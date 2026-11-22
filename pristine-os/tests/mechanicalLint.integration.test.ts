/*
 * Behaviour pinned while replacing `any` types: duplicate rack names still
 * return 409, order creation still coerces garment fields, and dashboard
 * cards keep the same shape. Same safety guard as the other integration
 * tests.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({
    user: { id: "m-1", organizationId: "org-1", role: "MANAGER", sessionVersion: 0 },
  })),
}));

describe.skipIf(!enabled)("behaviour kept by the lint type fixes (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routes: Record<string, any>;

  async function call(handler: (r: Request, c?: unknown) => Promise<Response>, method: string, body?: unknown, params: Record<string, string> = {}) {
    const response = await handler(
      new Request("http://localhost/api/x", {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve(params) }
    );
    return { status: response.status, json: await response.json() };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    routes = {
      racks: await import("@/app/api/racks/route"),
      rackById: await import("@/app/api/racks/[id]/route"),
      orders: await import("@/app/api/orders/route"),
      dashboard: await import("@/app/api/dashboard/route"),
    };
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Notification", "Payment", "GarmentTag", "Garment", "Order", "Rack", "Price", "Customer", "User", "Organization" CASCADE'
    );
    await prisma.organization.create({ data: { id: "org-1", name: "One" } });
    await prisma.user.create({
      data: { id: "m-1", email: "m1@test", password: "x", role: "MANAGER", organizationId: "org-1" },
    });
    await prisma.customer.create({
      data: { id: "c-1", firstName: "Ada", lastName: "L", phone: "555", organizationId: "org-1" },
    });
  });

  // Simulates a concurrent request: the route's `callNumber`-th
  // rack.findFirst (its duplicate pre-check) sees no clash, so the database's
  // unique constraint is what catches the duplicate — the error path whose
  // types changed.
  function missDuplicateCheck(callNumber: number) {
    const delegate = prisma.rack;
    const original = delegate.findFirst;
    let calls = 0;
    delegate.findFirst = async (args: unknown) => {
      calls += 1;
      if (calls === callNumber) {
        delegate.findFirst = original;
        return null;
      }
      return original.call(delegate, args);
    };
  }

  it("still returns 409 when the database rejects a duplicate rack", async () => {
    expect((await call(routes.racks.POST, "POST", { name: "7" })).status).toBe(201);

    // Pre-check path, unchanged.
    expect((await call(routes.racks.POST, "POST", { name: "7" })).status).toBe(409);

    // Unique-constraint path on create.
    missDuplicateCheck(1);
    const created = await call(routes.racks.POST, "POST", { name: "7" });
    expect(created.status).toBe(409);
    expect(created.json.error).toBe("A rack with this name or number already exists.");

    // Unique-constraint path on rename (the 2nd findFirst is the name check).
    const other = await call(routes.racks.POST, "POST", { name: "Overflow" });
    missDuplicateCheck(2);
    const renamed = await call(routes.rackById.PATCH, "PATCH", { name: "Rack 7" }, { id: other.json.id });
    expect(renamed.status).toBe(409);
    expect(renamed.json.error).toBe("Another rack already uses this name.");
  });

  it("still coerces loosely-typed garment fields when creating an order", async () => {
    const result = await call(routes.orders.POST, "POST", {
      customerId: "c-1",
      garments: [
        { name: "Shirt", service: "Dry Clean", quantity: "2", price: "6", printTag: false },
        { quantity: 0, price: -3 },
      ],
    });
    expect(result.status).toBe(201);
    const garments = result.json.garments.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    expect(garments.map((g: Record<string, unknown>) => [g.name, g.service, g.quantity, g.price, g.printTag])).toEqual([
      ["Garment", "Dry Clean", 1, 0, true],
      ["Shirt", "Dry Clean", 2, 6, false],
    ]);
    expect(result.json.total).toBe(12);
  });

  it("keeps dashboard order cards in the same shape, without raw payments", async () => {
    await call(routes.orders.POST, "POST", {
      customerId: "c-1",
      garments: [{ name: "Shirt", service: "Dry Clean", quantity: 1, price: 6 }],
    });
    const result = await call(routes.dashboard.GET, "GET");
    expect(result.status).toBe(200);
    const card = result.json.recentOrders[0];
    expect(Object.keys(card)).toEqual([
      "id",
      "orderNumber",
      "status",
      "total",
      "createdAt",
      "updatedAt",
      "customer",
      "paymentSummary",
    ]);
    expect(result.json.requiringPayment[0]).not.toHaveProperty("payments");
  });
});
