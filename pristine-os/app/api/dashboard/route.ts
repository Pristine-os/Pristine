import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { summarizePayments } from "@/lib/payments";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET() {
  try {
    const auth = await requireUser("dashboard.operational");

    if (auth.error) {
      return auth.error;
    }

    const session = { user: auth.user };

    const organizationId = session.user.organizationId;

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    function isToday(date: Date) {
      return date >= startOfToday && date < startOfTomorrow;
    }

    // Every dashboard figure is derived from this one org-scoped fetch —
    // there's no cached revenue/balance column to drift out of sync.
    const orders = await prisma.order.findMany({
      where: { organizationId },
      include: {
        customer: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    const orderCards = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: {
        id: order.customer.id,
        firstName: order.customer.firstName,
        lastName: order.customer.lastName,
      },
      payments: order.payments,
      paymentSummary: summarizePayments(order.total, order.payments),
    }));

    const stripPayments = (order: (typeof orderCards)[number]) => {
      const { payments, ...rest } = order;
      return rest;
    };

    const ordersCreatedToday = orderCards.filter((order) =>
      isToday(new Date(order.createdAt))
    );

    const ordersReceived = orderCards.filter(
      (order) => order.status === "RECEIVED"
    );

    const ordersProcessing = orderCards.filter(
      (order) => order.status === "PROCESSING"
    );

    const ordersReady = orderCards.filter(
      (order) => order.status === "READY"
    );

    const ordersPickedUpToday = orderCards.filter(
      (order) =>
        order.status === "PICKED_UP" && isToday(new Date(order.updatedAt))
    );

    const revenueToday = round2(
      orderCards
        .flatMap((order) => order.payments)
        .filter((payment) => isToday(new Date(payment.createdAt)))
        .reduce((sum, payment) => sum + Number(payment.amount), 0)
    );

    const outstandingBalance = round2(
      orderCards.reduce(
        (sum, order) => sum + order.paymentSummary.balanceRemaining,
        0
      )
    );

    const customersServedToday = new Set(
      ordersCreatedToday.map((order) => order.customer.id)
    ).size;

    const recentOrders = orderCards.slice(0, 10).map(stripPayments);

    // Oldest-waiting-first: whoever has been sitting longest surfaces first.
    const readyQueue = ordersReady
      .slice()
      .sort(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      )
      .map(stripPayments);

    const processingQueue = ordersProcessing
      .slice()
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      .map(stripPayments);

    const requiringPayment = orderCards
      .filter((order) => order.paymentSummary.balanceRemaining > 0)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      .slice(0, 10)
      .map(stripPayments);

    const recentPayments = orderCards
      .flatMap((order) =>
        order.payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          method: payment.method,
          createdAt: payment.createdAt,
          order: { id: order.id, orderNumber: order.orderNumber },
          customer: order.customer,
        }))
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 10);

    // Employees get the operational view only: counts and queues, with
    // every revenue, balance, total and payment figure removed.
    if (!can(auth.user.role, "reports.financial")) {
      const operational = (order: {
        id: string;
        orderNumber: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        customer: (typeof orderCards)[number]["customer"];
      }) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: order.customer,
      });

      return Response.json({
        financial: false,
        metrics: {
          ordersToday: ordersCreatedToday.length,
          ordersReceived: ordersReceived.length,
          ordersProcessing: ordersProcessing.length,
          ordersReady: ordersReady.length,
          ordersPickedUpToday: ordersPickedUpToday.length,
          customersServedToday,
        },
        recentOrders: orderCards.slice(0, 10).map(operational),
        readyQueue: readyQueue.map(operational),
        processingQueue: processingQueue.map(operational),
      });
    }

    return Response.json({
      financial: true,
      metrics: {
        ordersToday: ordersCreatedToday.length,
        ordersReceived: ordersReceived.length,
        ordersProcessing: ordersProcessing.length,
        ordersReady: ordersReady.length,
        ordersPickedUpToday: ordersPickedUpToday.length,
        revenueToday,
        outstandingBalance,
        customersServedToday,
      },
      recentOrders,
      readyQueue,
      processingQueue,
      requiringPayment,
      recentPayments,
    });
  } catch (error) {
    console.error("GET DASHBOARD ERROR:", error);

    return Response.json(
      {
        error: "Failed to load dashboard",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
