import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { summarizePayments } from "@/lib/payments";

// The active production workflow. PICKED_UP and CANCELLED orders are
// finished business — they stay visible through Orders/Search/Customer
// Profile, but never clutter the shop-floor board.
const ACTIVE_STATUSES = ["RECEIVED", "PROCESSING", "READY"];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // One org-scoped query with only the relations the board actually
    // needs — garment tag counts via `_count` rather than fetching every
    // tag row, and no historical (PICKED_UP/CANCELLED) orders at all.
    const orders = await prisma.order.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: "asc" },
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

    const board = orders.map((order) => {
      const physicalGarmentCount = order.garments.reduce(
        (sum, garment) => sum + garment.quantity,
        0
      );

      const totalTags = order.garments.reduce(
        (sum, garment) => sum + garment._count.tags,
        0
      );

      return {
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
      };
    });

    return Response.json({ orders: board });
  } catch (error) {
    console.error("GET PRODUCTION ERROR:", error);

    return Response.json(
      {
        error: "Failed to load production board",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
