import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { summarizePayments } from "@/lib/payments";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// The only transitions the production board is allowed to perform.
// This is intentionally narrower than the free-form status control on
// the order detail page (which staff use for corrections) — jumping to
// PICKED_UP, CANCELLED, or backwards is out of scope here on purpose.
const PRODUCTION_TRANSITIONS: Record<string, string> = {
  PROCESSING: "RECEIVED",
  READY: "PROCESSING",
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    if (!id || id === "undefined") {
      return Response.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const to = body.to;

    if (typeof to !== "string" || !PRODUCTION_TRANSITIONS[to]) {
      return Response.json(
        {
          error:
            'Invalid production transition. Expected "to" to be "PROCESSING" or "READY".',
        },
        { status: 400 }
      );
    }

    const requiredFrom = PRODUCTION_TRANSITIONS[to];
    const organizationId = session.user.organizationId;

    // A single atomic UPDATE ... WHERE status = requiredFrom is a
    // compare-and-swap at the database level — there is no read-then-write
    // gap for two devices to race through. If the row's status already
    // moved (or the order doesn't belong to this org), count is 0.
    const result = await prisma.order.updateMany({
      where: { id, organizationId, status: requiredFrom },
      data: { status: to },
    });

    if (result.count === 0) {
      const current = await prisma.order.findFirst({
        where: { id, organizationId },
        select: { status: true },
      });

      if (!current) {
        return Response.json({ error: "Order not found" }, { status: 404 });
      }

      return Response.json(
        {
          error: `Order is currently ${current.status}, not ${requiredFrom}. It may have already been updated by someone else — refresh and try again.`,
          currentStatus: current.status,
        },
        { status: 409 }
      );
    }

    const order = await prisma.order.findFirst({
      where: { id, organizationId },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        garments: {
          select: {
            name: true,
            quantity: true,
            printTag: true,
            _count: { select: { tags: true } },
          },
        },
        payments: true,
      },
    });

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    const physicalGarmentCount = order.garments.reduce(
      (sum, garment) => sum + garment.quantity,
      0
    );

    const totalTags = order.garments.reduce(
      (sum, garment) => sum + garment._count.tags,
      0
    );

    return Response.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      customer: order.customer,
      garments: order.garments.map((garment) => ({
        name: garment.name,
        quantity: garment.quantity,
      })),
      physicalGarmentCount,
      totalTags,
      tagPrintingEnabled: order.tagPrintingEnabled,
      paymentSummary: summarizePayments(order.total, order.payments),
    });
  } catch (error) {
    console.error("PRODUCTION TRANSITION ERROR:", error);

    return Response.json(
      {
        error: "Failed to update order status",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
