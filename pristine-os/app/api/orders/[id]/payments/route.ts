import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PAYMENT_METHODS, summarizePayments } from "@/lib/payments";

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

    // Payments carry no organizationId of their own — access is
    // gated entirely through this org-scoped order lookup.
    const order = await prisma.order.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    });

    if (!order) {
      return Response.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const payments = await prisma.payment.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({
      payments,
      summary: summarizePayments(order.total, payments),
    });
  } catch (error) {
    console.error("GET PAYMENTS ERROR:", error);

    return Response.json(
      {
        error: "Failed to load payments",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(
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
    });

    if (!order) {
      return Response.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const amount = Number(body.amount);
    const method = String(body.method || "");
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        { error: "Amount must be a positive number" },
        { status: 400 }
      );
    }

    if (!PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) {
      return Response.json(
        { error: "Invalid payment method" },
        { status: 400 }
      );
    }

    const existingPayments = await prisma.payment.findMany({
      where: { orderId: id },
    });

    const currentSummary = summarizePayments(order.total, existingPayments);

    // A cent of floating-point slack avoids rejecting a payment
    // that exactly clears the balance.
    if (amount > currentSummary.balanceRemaining + 0.01) {
      return Response.json(
        {
          error: `Amount exceeds remaining balance of $${currentSummary.balanceRemaining.toFixed(2)}`,
        },
        { status: 400 }
      );
    }

    const payment = await prisma.payment.create({
      data: {
        orderId: id,
        amount,
        method,
        note,
      },
    });

    const summary = summarizePayments(order.total, [
      ...existingPayments,
      payment,
    ]);

    return Response.json({ payment, summary }, { status: 201 });
  } catch (error) {
    console.error("CREATE PAYMENT ERROR:", error);

    return Response.json(
      {
        error: "Failed to record payment",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
