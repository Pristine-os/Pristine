import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { summarizePayments } from "@/lib/payments";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type GarmentLine = {
  name: string;
  service: string;
  quantity: number;
  price: number;
  prepayDiscount: boolean;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Strict on purpose: unlike order creation, this path can shrink the
// total on an order that already has money against it, so every line
// is validated server-side rather than defaulted/coerced.
function parseGarmentLines(
  raw: unknown
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

    lines.push({ name, service, quantity, price, prepayDiscount });
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
    // reasons about can't drift from what it actually enforces.
    const existingOrder =
      await prisma.order.findFirst({
        where: {
          id,
          organizationId:
            session.user.organizationId,
        },
        include: {
          payments: true,
        },
      });

    if (!existingOrder) {
      return Response.json(
        { error: "Order not found" },
        { status: 404 }
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
      const parsed = parseGarmentLines(body.garments);

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

    // Garment replacement and the total update either both land or
    // neither does — no partially-updated order on failure.
    const order = await prisma.$transaction(async (tx) => {
      if (garmentLines) {
        await tx.garment.deleteMany({ where: { orderId: id } });

        await tx.garment.createMany({
          data: garmentLines.map((line) => ({
            ...line,
            orderId: id,
          })),
        });
      }

      return tx.order.update({
        where: { id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(newTotal !== undefined ? { total: newTotal } : {}),
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