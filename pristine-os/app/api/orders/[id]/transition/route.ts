import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { summarizePayments } from "@/lib/payments";
import {
  ensureReadyNotificationIntent,
  attemptNotificationSend,
  READY_NOTIFICATION_TYPE,
} from "@/lib/notifications/service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// The only transitions this endpoint is allowed to perform: the
// production board's forward moves (RECEIVED→PROCESSING→READY) and the
// pickup counter's checkout (READY→PICKED_UP). This is intentionally
// narrower than the free-form status control on the order detail page
// (which staff use for corrections) — jumping statuses, CANCELLED, or
// moving backwards stays out of scope here on purpose.
const ALLOWED_TRANSITIONS: Record<string, string> = {
  PROCESSING: "RECEIVED",
  READY: "PROCESSING",
  PICKED_UP: "READY",
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

    if (typeof to !== "string" || !ALLOWED_TRANSITIONS[to]) {
      return Response.json(
        {
          error:
            'Invalid transition. Expected "to" to be "PROCESSING", "READY", or "PICKED_UP".',
        },
        { status: 400 }
      );
    }

    const requiredFrom = ALLOWED_TRANSITIONS[to];
    const organizationId = session.user.organizationId;

    // A single atomic UPDATE ... WHERE status = requiredFrom is a
    // compare-and-swap at the database level — there is no read-then-write
    // gap for two devices to race through. If the row's status already
    // moved (or the order doesn't belong to this org), count is 0.
    //
    // Order.rackId means "current physical storage location" — once the
    // customer picks up the garments there is no current location, so it
    // clears in this same UPDATE statement rather than a follow-up write.
    // Never preserved for history (see project decision).
    //
    // When this transition enters READY, the notification intent is
    // created in this SAME transaction (ensureReadyNotificationIntent) so
    // there is never a window where the order is READY without a durable
    // Notification row. The actual provider dispatch happens afterward,
    // once this transaction has committed — external delivery must never
    // be able to roll back a successful status change.
    const entered = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: { id, organizationId, status: requiredFrom },
        data: {
          status: to,
          ...(to === "PICKED_UP" ? { rackId: null } : {}),
        },
      });

      if (updateResult.count === 0) {
        return false;
      }

      if (to === "READY") {
        const updatedOrder = await tx.order.findFirst({
          where: { id, organizationId },
          select: {
            customer: {
              select: { id: true, firstName: true, phone: true, email: true },
            },
          },
        });

        if (updatedOrder) {
          await ensureReadyNotificationIntent(tx, {
            organizationId,
            orderId: id,
            customer: updatedOrder.customer,
          });
        }
      }

      return true;
    });

    if (!entered) {
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

    // Provider dispatch happens after commit, so a delivery failure never
    // affects the already-successful status-change response below.
    if (to === "READY") {
      const notification = await prisma.notification.findFirst({
        where: { orderId: id, organizationId, type: READY_NOTIFICATION_TYPE },
        select: { id: true },
      });

      if (notification) {
        await attemptNotificationSend({
          organizationId,
          notificationId: notification.id,
        }).catch((err) => {
          console.error("READY NOTIFICATION SEND ERROR:", err);
        });
      }
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
        rack: { select: { id: true, name: true } },
        payments: true,
        notifications: {
          where: { type: READY_NOTIFICATION_TYPE },
          select: { status: true, channel: true },
        },
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
      rack: order.rack,
      paymentSummary: summarizePayments(order.total, order.payments),
      readyNotification: order.notifications[0] ?? null,
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
