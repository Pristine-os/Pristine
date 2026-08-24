import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

    return Response.json(order);
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

    const existingOrder =
      await prisma.order.findFirst({
        where: {
          id,
          organizationId:
            session.user.organizationId,
        },
      });

    if (!existingOrder) {
      return Response.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const order = await prisma.order.update({
      where: {
        id,
      },
      data: {
        ...(body.status
          ? { status: body.status }
          : {}),
      },
      include: {
        customer: true,
        garments: true,
        organization: true,
      },
    });

    return Response.json(order);
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