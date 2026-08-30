import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { summarizePayments } from "@/lib/payments";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const CUSTOMER_LIMIT = 8;
const ORDER_LIMIT = 8;
// Bound on how many of the org's customers we're willing to scan in
// application code for the digit-normalized phone fallback below.
// Org-scoped, not "the whole database" — but still capped defensively.
const PHONE_SCAN_LIMIT = 500;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const organizationId = session.user.organizationId;

    const url = new URL(request.url);
    const rawQuery = (url.searchParams.get("q") || "").trim();
    const query = rawQuery.slice(0, MAX_QUERY_LENGTH);

    if (query.length < MIN_QUERY_LENGTH) {
      return Response.json({ query, customers: [], orders: [] });
    }

    // Every filter below is a Prisma `contains`, which is parameterized
    // by the query engine — the raw search string is never interpolated
    // into SQL, so no manual escaping is needed here.
    const tokens = query
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5);

    const nameEmailPhoneMatches = await prisma.customer.findMany({
      where: {
        organizationId,
        AND: tokens.map((token) => ({
          OR: [
            { firstName: { contains: token, mode: "insensitive" as const } },
            { lastName: { contains: token, mode: "insensitive" as const } },
            { email: { contains: token, mode: "insensitive" as const } },
            { phone: { contains: token } },
          ],
        })),
      },
      take: CUSTOMER_LIMIT * 2,
    });

    // Fallback for phone numbers stored with different punctuation than
    // what was typed (e.g. searching "4045551212" should still find a
    // customer stored as "(404) 555-1212"). No schema/index change, so
    // this normalizes in application code over a bounded candidate set
    // rather than the whole organization.
    const queryDigits = digitsOnly(query);
    let phoneDigitMatches: typeof nameEmailPhoneMatches = [];

    if (queryDigits.length >= 3) {
      const candidates = await prisma.customer.findMany({
        where: { organizationId },
        take: PHONE_SCAN_LIMIT,
      });

      phoneDigitMatches = candidates.filter((customer) =>
        digitsOnly(customer.phone).includes(queryDigits)
      );
    }

    const customerMap = new Map<string, (typeof nameEmailPhoneMatches)[number]>();

    for (const customer of [...nameEmailPhoneMatches, ...phoneDigitMatches]) {
      customerMap.set(customer.id, customer);
    }

    const matchedCustomers = Array.from(customerMap.values()).slice(
      0,
      CUSTOMER_LIMIT
    );

    const customerIds = matchedCustomers.map((customer) => customer.id);

    const ordersForMatchedCustomers = customerIds.length
      ? await prisma.order.findMany({
          where: {
            organizationId,
            customerId: { in: customerIds },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const ordersByCustomer = new Map<string, typeof ordersForMatchedCustomers>();

    for (const order of ordersForMatchedCustomers) {
      const list = ordersByCustomer.get(order.customerId) ?? [];
      list.push(order);
      ordersByCustomer.set(order.customerId, list);
    }

    const customers = matchedCustomers.map((customer) => {
      const customerOrders = ordersByCustomer.get(customer.id) ?? [];
      const latest = customerOrders[0];

      return {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        email: customer.email,
        orderCount: customerOrders.length,
        latestOrder: latest
          ? {
              id: latest.id,
              orderNumber: latest.orderNumber,
              status: latest.status,
              createdAt: latest.createdAt,
            }
          : null,
      };
    });

    const matchedOrders = await prisma.order.findMany({
      where: {
        organizationId,
        orderNumber: { contains: query, mode: "insensitive" },
      },
      include: {
        customer: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      take: ORDER_LIMIT,
    });

    const orders = matchedOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      customer: {
        id: order.customer.id,
        firstName: order.customer.firstName,
        lastName: order.customer.lastName,
      },
      paymentSummary: summarizePayments(order.total, order.payments),
    }));

    return Response.json({ query, customers, orders });
  } catch (error) {
    console.error("GET SEARCH ERROR:", error);

    return Response.json(
      {
        error: "Search failed",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
