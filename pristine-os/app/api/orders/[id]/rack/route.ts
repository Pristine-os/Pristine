import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

// Assign, change, or clear an order's current rack. Rack assignment is
// deliberately separate from production status — this endpoint never
// touches Order.status, and status changes (see /api/orders/[id] PATCH)
// never touch rackId except the approved PICKED_UP-clears-rack rule.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = session.user.organizationId;
    const { id } = await context.params;
    const body = await request.json();

    if (body.rackId !== null && typeof body.rackId !== "string") {
      return Response.json(
        { error: "rackId must be a string or null." },
        { status: 400 }
      );
    }

    const order = await prisma.order.findFirst({
      where: { id, organizationId },
      select: { id: true, orderNumber: true, rackId: true },
    });

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    // Optional optimistic-concurrency check: if the caller tells us what
    // rack it believed was current (from the screen it read before
    // confirming), and that no longer matches, surface a conflict instead
    // of silently overwriting a change made by someone else in between.
    if (
      body.expectedCurrentRackId !== undefined &&
      body.expectedCurrentRackId !== order.rackId
    ) {
      return Response.json(
        {
          error:
            "This order's rack was changed by someone else. Refresh and try again.",
          currentRackId: order.rackId,
        },
        { status: 409 }
      );
    }

    let rack: { id: string; name: string } | null = null;

    if (body.rackId !== null) {
      const foundRack = await prisma.rack.findFirst({
        where: { id: body.rackId, organizationId },
      });

      if (!foundRack) {
        return Response.json({ error: "Rack not found" }, { status: 404 });
      }

      if (!foundRack.active) {
        return Response.json(
          {
            error: `Rack "${foundRack.name}" is inactive and cannot accept new assignments.`,
          },
          { status: 400 }
        );
      }

      rack = { id: foundRack.id, name: foundRack.name };
    }

    const result = await prisma.order.updateMany({
      where: { id, organizationId },
      data: { rackId: rack ? rack.id : null },
    });

    if (result.count === 0) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      rack,
    });
  } catch (error) {
    console.error("ASSIGN RACK ERROR:", error);

    return Response.json(
      {
        error: "Failed to update rack assignment",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
