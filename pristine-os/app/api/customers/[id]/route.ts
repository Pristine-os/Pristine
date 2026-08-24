import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { summarizePayments } from "@/lib/payments";

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
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    // Access is gated entirely through this org-scoped lookup —
    // a customer belonging to another organization simply doesn't match.
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!customer) {
      return Response.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const { orders, ...customerFields } = customer;

    const ordersWithSummary = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      paymentSummary: summarizePayments(order.total, order.payments),
    }));

    // Lifetime figures are derived from order/payment rows on every
    // request rather than stored on Customer, so they can never drift.
    const lifetimeSpending = ordersWithSummary.reduce(
      (sum, order) => sum + order.paymentSummary.amountDue,
      0
    );

    const totalPaid = ordersWithSummary.reduce(
      (sum, order) => sum + order.paymentSummary.amountPaid,
      0
    );

    const outstandingBalance = ordersWithSummary.reduce(
      (sum, order) => sum + order.paymentSummary.balanceRemaining,
      0
    );

    return Response.json({
      ...customerFields,
      orders: ordersWithSummary,
      stats: {
        orderCount: ordersWithSummary.length,
        lifetimeSpending,
        totalPaid,
        outstandingBalance,
        mostRecentOrder: ordersWithSummary[0] ?? null,
      },
    });
  } catch (error) {
    console.error("GET CUSTOMER ERROR:", error);

    return Response.json(
      {
        error: "Failed to load customer",
        details:
          error instanceof Error ? error.message : String(error),
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
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
    });

    if (!existingCustomer) {
      return Response.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const phone = String(body.phone ?? "").trim();

    const emailInput =
      typeof body.email === "string" ? body.email.trim() : "";
    const email = emailInput === "" ? null : emailInput;

    if (!firstName || !lastName) {
      return Response.json(
        { error: "First and last name are required" },
        { status: 400 }
      );
    }

    if (!phone) {
      return Response.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Enter a valid email address" },
        { status: 400 }
      );
    }

    // organizationId is intentionally never taken from the request body —
    // it stays whatever it already was on the org-scoped row above.
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        firstName,
        lastName,
        phone,
        email,
      },
    });

    return Response.json(customer);
  } catch (error) {
    console.error("UPDATE CUSTOMER ERROR:", error);

    return Response.json(
      {
        error: "Failed to update customer",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
