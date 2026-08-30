import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { summarizePayments } from "@/lib/payments";
import { syncGarmentTags } from "@/lib/garmentTags";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type GarmentLine = {
  id?: string;
  name: string;
  service: string;
  quantity: number;
  price: number;
  prepayDiscount: boolean;
  printTag: boolean;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Strict on purpose: unlike order creation, this path can shrink the
// total on an order that already has money against it, so every line
// is validated server-side rather than defaulted/coerced.
//
// `validGarmentIds` is the authoritative set of garment IDs that
// actually belong to THIS org-scoped order — never derived from the
// request itself. A line naming an id outside that set (forged, or
// belonging to another order/organization) fails the whole request
// before any write happens.
function parseGarmentLines(
  raw: unknown,
  validGarmentIds: Set<string>
): { lines: GarmentLine[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "An order must have at least one garment." };
  }

  const lines: GarmentLine[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { error: "Each garment line must be an object." };
    }

    const record = item as Record<string, unknown>;

    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : undefined;

    if (id !== undefined && !validGarmentIds.has(id)) {
      return {
        error:
          "One or more garment lines reference a garment that doesn't belong to this order.",
      };
    }

    const name =
      typeof record.name === "string" ? record.name.trim() : "";
    const service =
      typeof record.service === "string" ? record.service.trim() : "";
    const quantity = Number(record.quantity);
    const price = Number(record.price);

    if (!name) {
      return { error: "Every garment line requires a garment name." };
    }

    if (!service) {
      return { error: "Every garment line requires a service." };
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return {
        error: `Quantity for "${name}" must be a whole number of at least 1.`,
      };
    }

    if (!Number.isFinite(price) || price < 0) {
      return {
        error: `Price for "${name}" must be a non-negative number.`,
      };
    }

    // Pure notation — validated as a boolean but never fed into any
    // price/total calculation below.
    const prepayDiscount =
      record.prepayDiscount === undefined ? false : record.prepayDiscount;

    if (typeof prepayDiscount !== "boolean") {
      return {
        error: `"20% Prepay Discount" for "${name}" must be true or false.`,
      };
    }

    // Also pure notation from the financial engine's point of view —
    // it only ever decides whether tags get printed, never price/total.
    const printTag = record.printTag === undefined ? true : record.printTag;

    if (typeof printTag !== "boolean") {
      return {
        error: `"Print Tag" for "${name}" must be true or false.`,
      };
    }

    lines.push({ id, name, service, quantity, price, prepayDiscount, printTag });
  }

  return { lines };
}

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id || id === "undefined") {
      return Response.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    const order = await prisma.order.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
      include: {
        customer: true,
        garments: true,
        organization: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      return Response.json(
        {
          error: "Order not found",
          details:
            "No order was found for this ID and organization.",
        },
        { status: 404 }
      );
    }

    return Response.json({
      ...order,
      paymentSummary: summarizePayments(order.total, order.payments),
    });
  } catch (error) {
    console.error("GET ORDER ERROR:", error);

    return Response.json(
      {
        error: "Failed to load order",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id || id === "undefined") {
      return Response.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const allowedStatuses = [
      "RECEIVED",
      "PROCESSING",
      "READY",
      "PICKED_UP",
      "CANCELLED",
    ];

    if (
      body.status &&
      !allowedStatuses.includes(body.status)
    ) {
      return Response.json(
        { error: "Invalid order status" },
        { status: 400 }
      );
    }

    // organizationId is never trusted from the request body — access is
    // gated entirely through this org-scoped lookup, and payments are
    // fetched here (not re-queried later) so the amountPaid this request
    // reasons about can't drift from what it actually enforces. Garments
    // are fetched with their tags so the diff-based sync below has the
    // authoritative id set and current tag counts to work from.
    const existingOrder =
      await prisma.order.findFirst({
        where: {
          id,
          organizationId:
            session.user.organizationId,
        },
        include: {
          payments: true,
          garments: {
            include: { tags: true },
          },
        },
      });

    if (!existingOrder) {
      return Response.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    if (
      body.tagPrintingEnabled !== undefined &&
      typeof body.tagPrintingEnabled !== "boolean"
    ) {
      return Response.json(
        { error: "tagPrintingEnabled must be true or false." },
        { status: 400 }
      );
    }

    const amountPaid = round2(
      existingOrder.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0
      )
    );

    // Payments are an immutable ledger — a paid order can't be cancelled
    // out from under them until a refund/void workflow exists.
    if (body.status === "CANCELLED" && amountPaid > 0) {
      return Response.json(
        {
          error:
            "This order has recorded payments and can't be cancelled directly. Refund or void the payments first.",
        },
        { status: 400 }
      );
    }

    let garmentLines: GarmentLine[] | undefined;
    let newTotal: number | undefined;

    if (body.garments !== undefined) {
      const validGarmentIds = new Set(
        existingOrder.garments.map((garment) => garment.id)
      );

      const parsed = parseGarmentLines(body.garments, validGarmentIds);

      if ("error" in parsed) {
        return Response.json(
          { error: parsed.error },
          { status: 400 }
        );
      }

      garmentLines = parsed.lines;

      newTotal = round2(
        garmentLines.reduce(
          (sum, line) => sum + line.quantity * line.price,
          0
        )
      );

      // Existing payments are immutable, so the total can never drop
      // below what's already been collected — no automatic refunds.
      if (newTotal < amountPaid) {
        return Response.json(
          {
            error: `Order total cannot be reduced below the amount already paid ($${amountPaid.toFixed(2)}).`,
          },
          { status: 400 }
        );
      }
    }

    // Garment sync, tag sync, and the total update either all land or
    // none does — no partially-updated order on failure. Existing
    // garment rows are updated in place (never deleted+recreated) so
    // their id — and therefore their GarmentTag identities — survive
    // price/service/quantity/print-preference edits untouched.
    const order = await prisma.$transaction(async (tx) => {
      if (garmentLines) {
        const existingById = new Map(
          existingOrder.garments.map((garment) => [garment.id, garment])
        );
        const incomingIds = new Set(
          garmentLines
            .filter((line) => line.id !== undefined)
            .map((line) => line.id as string)
        );

        // Lines the employee removed entirely — no scan/production
        // history exists yet, so their tags are simply retired.
        for (const garment of existingOrder.garments) {
          if (!incomingIds.has(garment.id)) {
            await tx.garmentTag.deleteMany({
              where: { garmentId: garment.id },
            });
            await tx.garment.delete({ where: { id: garment.id } });
          }
        }

        for (const line of garmentLines) {
          if (line.id) {
            const existingGarment = existingById.get(line.id)!;

            await tx.garment.update({
              where: { id: line.id },
              data: {
                name: line.name,
                service: line.service,
                quantity: line.quantity,
                price: line.price,
                prepayDiscount: line.prepayDiscount,
                printTag: line.printTag,
              },
            });

            await syncGarmentTags(tx, {
              orderId: id,
              orderNumber: existingOrder.orderNumber,
              garmentId: line.id,
              quantity: line.quantity,
              currentTags: existingGarment.tags,
            });
          } else {
            const created = await tx.garment.create({
              data: {
                name: line.name,
                service: line.service,
                quantity: line.quantity,
                price: line.price,
                prepayDiscount: line.prepayDiscount,
                printTag: line.printTag,
                orderId: id,
              },
            });

            await syncGarmentTags(tx, {
              orderId: id,
              orderNumber: existingOrder.orderNumber,
              garmentId: created.id,
              quantity: line.quantity,
              currentTags: [],
            });
          }
        }
      }

      return tx.order.update({
        where: { id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(newTotal !== undefined ? { total: newTotal } : {}),
          ...(typeof body.tagPrintingEnabled === "boolean"
            ? { tagPrintingEnabled: body.tagPrintingEnabled }
            : {}),
        },
        include: {
          customer: true,
          garments: true,
          organization: true,
          payments: {
            orderBy: { createdAt: "desc" },
          },
        },
      });
    });

    return Response.json({
      ...order,
      paymentSummary: summarizePayments(order.total, order.payments),
    });
  } catch (error) {
    console.error("UPDATE ORDER ERROR:", error);

    return Response.json(
      {
        error: "Failed to update order",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}