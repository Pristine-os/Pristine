/*
 * Order PATCH must not act on a stale read. Each test makes a concurrent
 * change land between the route's read of the order and its write, by
 * wrapping the route's first prisma.order.findFirst call. Same safety
 * guard as the other integration tests.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

function isSafeTestDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
      parsed.pathname.toLowerCase().includes("test")
    );
  } catch {
    return false;
  }
}

const enabled = isSafeTestDatabase(TEST_DATABASE_URL);

if (enabled) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

let currentSession: unknown = null;

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => currentSession),
}));

const USERS = {
  manager: { id: "r-manager", role: "MANAGER" },
  employee: { id: "r-employee", role: "EMPLOYEE" },
} as const;

function as(actor: keyof typeof USERS) {
  currentSession = { user: { id: USERS[actor].id, organizationId: "org-1", role: USERS[actor].role } };
}

describe.skipIf(!enabled)("order PATCH concurrency (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orderRoute: any;

  async function patch(body: unknown) {
    const response = await orderRoute.PATCH(
      new Request("http://localhost/api/orders/o-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "o-1" }) }
    );
    return { status: response.status, json: await response.json() };
  }

  // Runs `change` right after the route's next read of the order, before
  // it writes. (vi.spyOn can't be restored cleanly on Prisma's model
  // delegates, so this wraps the method once and puts it back itself.)
  let originalFindFirst: unknown;

  function changeAfterRead(change: () => Promise<unknown>) {
    const delegate = prisma.order;
    const original = delegate.findFirst;
    originalFindFirst = original;
    delegate.findFirst = async (args: unknown) => {
      delegate.findFirst = original;
      const result = await original.call(delegate, args);
      await change();
      return result;
    };
  }

  async function garmentLine(overrides: Record<string, unknown> = {}) {
    const garment = await prisma.garment.findFirst({ where: { orderId: "o-1" } });
    return {
      id: garment.id,
      name: garment.name,
      service: garment.service,
      quantity: garment.quantity,
      price: garment.price,
      prepayDiscount: false,
      printTag: true,
      ...overrides,
    };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    orderRoute = await import("@/app/api/orders/[id]/route");
  });

  afterEach(() => {
    if (originalFindFirst) prisma.order.findFirst = originalFindFirst;
    originalFindFirst = undefined;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Notification", "Payment", "GarmentTag", "Garment", "Order", "Rack", "Price", "Customer", "User", "Organization" CASCADE'
    );
    await prisma.organization.create({ data: { id: "org-1", name: "One" } });
    for (const user of Object.values(USERS)) {
      await prisma.user.create({
        data: { id: user.id, email: `${user.id}@test`, password: "x", role: user.role, organizationId: "org-1" },
      });
    }
    await prisma.customer.create({
      data: { id: "c-1", firstName: "Ada", lastName: "L", phone: "555", organizationId: "org-1" },
    });
    await prisma.order.create({
      data: {
        id: "o-1",
        orderNumber: "PR-1",
        status: "RECEIVED",
        customerId: "c-1",
        organizationId: "org-1",
        total: 12,
        garments: { create: { name: "Shirt", service: "Dry Clean", quantity: 2, price: 6 } },
      },
    });
  });

  const status = async () => (await prisma.order.findUnique({ where: { id: "o-1" } })).status;

  it("refuses a forward move when someone else changed the status meanwhile", async () => {
    as("employee");
    changeAfterRead(() => prisma.order.update({ where: { id: "o-1" }, data: { status: "CANCELLED" } }));

    const result = await patch({ status: "PROCESSING" });
    expect(result.status).toBe(409);
    expect(result.json.currentStatus).toBe("CANCELLED");
    expect(await status()).toBe("CANCELLED");
  });

  it("refuses to cancel an order that received a payment meanwhile", async () => {
    as("manager");
    changeAfterRead(() =>
      prisma.payment.create({ data: { orderId: "o-1", amount: 5, method: "CASH" } })
    );

    const result = await patch({ status: "CANCELLED" });
    expect(result.status).toBe(409);
    expect(await status()).toBe("RECEIVED");
  });

  it("refuses to lower the total below a payment recorded meanwhile", async () => {
    as("manager");
    const line = await garmentLine({ quantity: 1 }); // total 12 -> 6
    changeAfterRead(() =>
      prisma.payment.create({ data: { orderId: "o-1", amount: 10, method: "CARD" } })
    );

    const result = await patch({ garments: [line] });
    expect(result.status).toBe(409);
    expect((await prisma.order.findUnique({ where: { id: "o-1" } })).total).toBe(12);
  });

  it("refuses a garment edit when the order was edited meanwhile", async () => {
    as("manager");
    const line = await garmentLine({ quantity: 3 });
    changeAfterRead(() =>
      prisma.order.update({ where: { id: "o-1" }, data: { tagPrintingEnabled: false } })
    );

    const result = await patch({ garments: [line] });
    expect(result.status).toBe(409);
    expect((await prisma.garment.findFirst({ where: { orderId: "o-1" } })).quantity).toBe(2);
  });

  it("still applies updates when nothing changed in between", async () => {
    as("employee");
    expect((await patch({ status: "PROCESSING" })).status).toBe(200);
    expect(await status()).toBe("PROCESSING");

    as("manager");
    expect((await patch({ garments: [await garmentLine({ quantity: 3 })] })).status).toBe(200);
    expect((await prisma.order.findUnique({ where: { id: "o-1" } })).total).toBe(18);
  });

  it("does not block tag-printing toggles on a concurrent status change", async () => {
    as("employee");
    changeAfterRead(() => prisma.order.update({ where: { id: "o-1" }, data: { status: "PROCESSING" } }));
    expect((await patch({ tagPrintingEnabled: false })).status).toBe(200);
  });
});
