import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PAYMENT_METHODS, summarizePayments } from "@/lib/payments";

// Thrown inside the Serializable transaction below to short-circuit an
// overpayment attempt — kept distinct from a genuine write conflict so
// the two can be told apart in the catch block.
class OverpaymentError extends Error {
  constructor(public balanceRemaining: number) {
    super("Amount exceeds remaining balance");
  }
}

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

    // The balance check and the insert must be read+written as one unit —
    // otherwise two requests racing on the same order (a double-click, or
    // two registers) can both read the same "balance remaining" before
    // either write lands, both pass the check, and together overpay the
    // order. Serializable isolation makes Postgres detect that overlap
    // and abort one of the two transactions instead of letting it happen.
    let payment;
    let existingPayments;

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const currentPayments = await tx.payment.findMany({
            where: { orderId: id },
          });

          const currentSummary = summarizePayments(order.total, currentPayments);

          // A cent of floating-point slack avoids rejecting a payment
          // that exactly clears the balance.
          if (amount > currentSummary.balanceRemaining + 0.01) {
            throw new OverpaymentError(currentSummary.balanceRemaining);
          }

          const created = await tx.payment.create({
            data: { orderId: id, amount, method, note },
          });

          return { created, currentPayments };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      payment = result.created;
      existingPayments = result.currentPayments;
    } catch (error) {
      if (error instanceof OverpaymentError) {
        return Response.json(
          {
            error: `Amount exceeds remaining balance of $${error.balanceRemaining.toFixed(2)}`,
          },
          { status: 400 }
        );
      }

      // Postgres serialization failure (40001) — another request recorded
      // a payment against this order in the same instant. Depending on
      // the client/engine this surfaces either as a known Prisma error
      // (P2034) or as an unknown error whose message names the conflict;
      // either way, ask the caller to reload and retry rather than
      // risking a stale balance being used for a second attempt.
      const isWriteConflict =
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034") ||
        (error instanceof Error &&
          /TransactionWriteConflict|write conflict/i.test(error.message));

      if (isWriteConflict) {
        return Response.json(
          {
            error:
              "This order's balance just changed (another payment may have been recorded at the same time). Refresh and try again.",
          },
          { status: 409 }
        );
      }

      throw error;
    }

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
