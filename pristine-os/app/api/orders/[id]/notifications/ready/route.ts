import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  ensureReadyNotificationIntent,
  attemptNotificationSend,
  READY_NOTIFICATION_TYPE,
} from "@/lib/notifications/service";

type RouteContext = { params: Promise<{ id: string }> };

// Manual "Send Ready Notification" / "Retry" / "Resend" — all the same
// underlying operation: ensure the notification row exists (this also
// covers a READY order that predates this feature and never got an
// automatic intent), then explicitly (re)attempt it regardless of its
// current status. Every call to this endpoint is a deliberate employee
// action — the UI is responsible for requiring confirmation before
// resending something already SENT/SIMULATED.
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = session.user.organizationId;
    const { id } = await context.params;

    if (!id || id === "undefined") {
      return Response.json({ error: "Order ID is required" }, { status: 400 });
    }

    // Access is gated entirely through this org-scoped order lookup — the
    // customer relation is read from the order itself, never trusted from
    // the request body, so a caller can't point a send at another
    // organization's customer.
    const order = await prisma.order.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        customer: {
          select: { id: true, firstName: true, phone: true, email: true },
        },
      },
    });

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    await ensureReadyNotificationIntent(prisma, {
      organizationId,
      orderId: order.id,
      customer: order.customer,
    });

    const notification = await prisma.notification.findFirst({
      where: { orderId: order.id, organizationId, type: READY_NOTIFICATION_TYPE },
    });

    if (!notification) {
      return Response.json(
        { error: "Failed to create notification record" },
        { status: 500 }
      );
    }

    const result = await attemptNotificationSend({
      organizationId,
      notificationId: notification.id,
      isExplicitResend: true,
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: 404 });
    }

    const fresh = await prisma.notification.findFirst({
      where: { id: notification.id, organizationId },
    });

    return Response.json({ notification: fresh });
  } catch (error) {
    console.error("SEND READY NOTIFICATION ERROR:", error);

    return Response.json(
      {
        error: "Failed to send notification",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
