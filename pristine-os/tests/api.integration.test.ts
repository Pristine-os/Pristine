/*
 * Route-handler integration tests for roles & permissions.
 *
 * These call the real API handlers against a real PostgreSQL database;
 * only NextAuth's getServerSession is mocked. They WIPE the database they
 * run against, so they refuse to run unless TEST_DATABASE_URL points at a
 * localhost database whose name contains "test".
 *
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:55432/pristine_test \
 *     npx prisma migrate deploy && npm test
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

let currentSession: unknown = null;

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => currentSession),
}));

type Handler = (request: Request, context?: unknown) => Promise<Response>;

async function call(
  handler: Handler,
  options: { method?: string; body?: unknown; params?: Record<string, string>; url?: string } = {}
) {
  const request = new Request(options.url ?? "http://localhost/api/test", {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const response = await handler(request, { params: Promise.resolve(options.params ?? {}) });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

const USERS = {
  owner: { id: "u-owner", role: "OWNER", org: "org-1" },
  manager: { id: "u-manager", role: "MANAGER", org: "org-1" },
  employee: { id: "u-employee", role: "EMPLOYEE", org: "org-1" },
  inactive: { id: "u-inactive", role: "EMPLOYEE", org: "org-1", active: false },
  otherOwner: { id: "u-other-owner", role: "OWNER", org: "org-2" },
} as const;

type Actor = keyof typeof USERS;

function as(actor: Actor | null) {
  if (!actor) {
    currentSession = null;
    return;
  }
  const user = USERS[actor];
  currentSession = {
    user: { id: user.id, organizationId: user.org, role: user.role, email: `${user.id}@test` },
  };
}

describe.skipIf(!enabled)("API roles & permissions (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routes: Record<string, any>;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    routes = {
      orders: await import("@/app/api/orders/route"),
      order: await import("@/app/api/orders/[id]/route"),
      transition: await import("@/app/api/orders/[id]/transition/route"),
      payments: await import("@/app/api/orders/[id]/payments/route"),
      rack: await import("@/app/api/orders/[id]/rack/route"),
      pricing: await import("@/app/api/pricing/route"),
      racks: await import("@/app/api/racks/route"),
      rackById: await import("@/app/api/racks/[id]/route"),
      dashboard: await import("@/app/api/dashboard/route"),
      customers: await import("@/app/api/customers/route"),
      users: await import("@/app/api/users/route"),
      userById: await import("@/app/api/users/[id]/route"),
      me: await import("@/app/api/me/route"),
      search: await import("@/app/api/search/route"),
    };
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Notification", "Payment", "GarmentTag", "Garment", "Order", "Rack", "Price", "Customer", "User", "Organization" CASCADE'
    );

    await prisma.organization.createMany({
      data: [
        { id: "org-1", name: "Store One" },
        { id: "org-2", name: "Store Two" },
      ],
    });

    for (const user of Object.values(USERS)) {
      await prisma.user.create({
        data: {
          id: user.id,
          email: `${user.id}@test`,
          password: "not-used",
          name: user.id,
          role: user.role,
          active: "active" in user ? user.active : true,
          organizationId: user.org,
        },
      });
    }

    await prisma.customer.createMany({
      data: [
        { id: "c-1", firstName: "Ada", lastName: "One", phone: "555-0001", organizationId: "org-1" },
        { id: "c-2", firstName: "Bob", lastName: "Two", phone: "555-0002", organizationId: "org-2" },
      ],
    });
  });

  // Shirt / Dry Clean is $6 in the default catalog.
  const catalogLine = { name: "Shirt", service: "Dry Clean", quantity: 2, price: 6 };

  async function createOrder(actor: Actor, garments: unknown[] = [catalogLine], extra = {}) {
    as(actor);
    return call(routes.orders.POST, { method: "POST", body: { customerId: "c-1", garments, ...extra } });
  }

  describe("authentication", () => {
    it("rejects signed-out requests with 401", async () => {
      as(null);
      expect((await call(routes.orders.GET)).status).toBe(401);
      expect((await call(routes.dashboard.GET)).status).toBe(401);
      expect((await call(routes.users.GET)).status).toBe(401);
    });

    it("rejects deactivated users even with a valid session", async () => {
      as("inactive");
      expect((await call(routes.orders.GET)).status).toBe(401);
      expect((await createOrder("inactive")).status).toBe(401);
    });

    it("uses the database role, not the role in the session token", async () => {
      currentSession = {
        user: { id: USERS.employee.id, organizationId: "org-1", role: "OWNER" },
      };
      const result = await call(routes.pricing.PUT, {
        method: "PUT",
        body: { garmentType: "Shirt", service: "Dry Clean", price: 1 },
      });
      expect(result.status).toBe(403);
    });

    it("rejects a session whose organization doesn't match the user's", async () => {
      currentSession = { user: { id: USERS.employee.id, organizationId: "org-2", role: "EMPLOYEE" } };
      expect((await call(routes.orders.GET)).status).toBe(401);
    });

    it("keeps existing Owner access working", async () => {
      as("owner");
      const me = await call(routes.me.GET);
      expect(me.status).toBe(200);
      expect(me.json.role).toBe("OWNER");
      expect(me.json.permissions).toContain("staff.manage");
    });
  });

  describe("orders and prices", () => {
    it("lets Employees create orders at catalog prices", async () => {
      const result = await createOrder("employee");
      expect(result.status).toBe(201);
      expect(result.json.total).toBe(12);
    });

    it("blocks Employees from custom prices on new orders", async () => {
      const result = await createOrder("employee", [{ ...catalogLine, price: 1 }]);
      expect(result.status).toBe(403);
      expect(await prisma.order.count()).toBe(0);
    });

    it("blocks Employees from pricing a combination that has no catalog price", async () => {
      const result = await createOrder("employee", [
        { name: "Shirt", service: "Wash & Fold", quantity: 1, price: 0 },
      ]);
      expect(result.status).toBe(403);
    });

    it("honours organization price overrides for Employees", async () => {
      await prisma.price.create({
        data: { organizationId: "org-1", garmentType: "Shirt", service: "Dry Clean", price: 7.5 },
      });
      expect((await createOrder("employee", [{ ...catalogLine, price: 6 }])).status).toBe(403);
      expect((await createOrder("employee", [{ ...catalogLine, price: 7.5 }])).status).toBe(201);
    });

    it("blocks Employees from creating an order in a non-RECEIVED status", async () => {
      expect((await createOrder("employee", [catalogLine], { status: "PICKED_UP" })).status).toBe(403);
    });

    it("lets Managers and Owners set custom prices", async () => {
      expect((await createOrder("manager", [{ ...catalogLine, price: 1 }])).status).toBe(201);
      expect((await createOrder("owner", [{ ...catalogLine, price: 2 }])).status).toBe(201);
    });

    it("lets Employees edit quantities on a Manager-priced order but not the price", async () => {
      const created = await createOrder("manager", [{ ...catalogLine, price: 4 }]);
      const order = await prisma.order.findUnique({
        where: { id: created.json.id },
        include: { garments: true },
      });
      const garment = order.garments[0];
      const line = {
        id: garment.id,
        name: garment.name,
        service: garment.service,
        quantity: 3,
        price: 4,
        prepayDiscount: false,
        printTag: true,
      };

      as("employee");
      const params = { id: order.id };
      const ok = await call(routes.order.PATCH, { method: "PATCH", params, body: { garments: [line] } });
      expect(ok.status).toBe(200);

      const raised = await call(routes.order.PATCH, {
        method: "PATCH",
        params,
        body: { garments: [{ ...line, price: 9 }] },
      });
      expect(raised.status).toBe(403);

      as("manager");
      const managerEdit = await call(routes.order.PATCH, {
        method: "PATCH",
        params,
        body: { garments: [{ ...line, price: 9 }] },
      });
      expect(managerEdit.status).toBe(200);
    });

    it("lets Employees make forward status moves but not corrections or cancellations", async () => {
      const created = await createOrder("employee");
      const params = { id: created.json.id };

      as("employee");
      const patch = (status: string) =>
        call(routes.order.PATCH, { method: "PATCH", params, body: { status } });

      expect((await patch("READY")).status).toBe(403); // skips PROCESSING
      expect((await patch("CANCELLED")).status).toBe(403);
      expect((await patch("PROCESSING")).status).toBe(200);
      expect((await patch("RECEIVED")).status).toBe(403); // backwards
      expect(
        (await call(routes.transition.PATCH, { method: "PATCH", params, body: { to: "READY" } })).status
      ).toBe(200);

      const tagToggle = await call(routes.order.PATCH, {
        method: "PATCH",
        params,
        body: { tagPrintingEnabled: false },
      });
      expect(tagToggle.status).toBe(200);

      as("manager");
      expect((await patch("RECEIVED")).status).toBe(200);
      expect((await patch("CANCELLED")).status).toBe(200);
    });

    it("keeps the paid-order cancellation safeguard for every role", async () => {
      const created = await createOrder("employee");
      const params = { id: created.json.id };

      as("employee");
      const payment = await call(routes.payments.POST, {
        method: "POST",
        params,
        body: { amount: 5, method: "CASH" },
      });
      expect(payment.status).toBe(201);

      as("owner");
      const cancel = await call(routes.order.PATCH, { method: "PATCH", params, body: { status: "CANCELLED" } });
      expect(cancel.status).toBe(400);
    });

    it("keeps the overpayment safeguard for Employees", async () => {
      const created = await createOrder("employee");
      as("employee");
      const result = await call(routes.payments.POST, {
        method: "POST",
        params: { id: created.json.id },
        body: { amount: 500, method: "CARD" },
      });
      expect(result.status).toBe(400);
    });
  });

  describe("organization isolation", () => {
    it("hides another organization's orders, customers and staff", async () => {
      const created = await createOrder("owner");

      as("otherOwner");
      expect((await call(routes.order.GET, { params: { id: created.json.id } })).status).toBe(404);
      expect(
        (await call(routes.payments.POST, { method: "POST", params: { id: created.json.id }, body: { amount: 1, method: "CASH" } })).status
      ).toBe(404);
      expect(
        (await call(routes.orders.POST, { method: "POST", body: { customerId: "c-1", garments: [catalogLine] } })).status
      ).toBe(404);

      const staff = await call(routes.users.GET);
      expect(staff.json.users.map((u: { id: string }) => u.id)).toEqual([USERS.otherOwner.id]);

      const patch = await call(routes.userById.PATCH, {
        method: "PATCH",
        params: { id: USERS.employee.id },
        body: { role: "OWNER" },
      });
      expect(patch.status).toBe(404);
    });
  });

  describe("pricing catalog and store settings", () => {
    const body = { garmentType: "Shirt", service: "Dry Clean", price: 6.5 };

    it("lets everyone read pricing but only Managers and Owners change it", async () => {
      as("employee");
      expect((await call(routes.pricing.GET)).status).toBe(200);
      expect((await call(routes.pricing.PUT, { method: "PUT", body })).status).toBe(403);
      expect(
        (await call(routes.pricing.DELETE, { method: "DELETE", url: "http://localhost/api/pricing?garmentType=Shirt&service=Dry%20Clean" })).status
      ).toBe(403);

      as("manager");
      expect((await call(routes.pricing.PUT, { method: "PUT", body })).status).toBe(200);
    });

    it("lets Employees assign racks but only Managers and Owners set them up", async () => {
      as("employee");
      expect((await call(routes.racks.POST, { method: "POST", body: { name: "1" } })).status).toBe(403);

      as("manager");
      const rack = await call(routes.racks.POST, { method: "POST", body: { name: "1" } });
      expect(rack.status).toBe(201);

      as("employee");
      expect(
        (await call(routes.rackById.PATCH, { method: "PATCH", params: { id: rack.json.id }, body: { active: false } })).status
      ).toBe(403);

      const order = await createOrder("employee");
      as("employee");
      const assign = await call(routes.rack.PATCH, {
        method: "PATCH",
        params: { id: order.json.id },
        body: { rackId: rack.json.id },
      });
      expect(assign.status).toBe(200);
    });

    it("lets Employees manage customers and search", async () => {
      as("employee");
      const created = await call(routes.customers.POST, {
        method: "POST",
        body: { firstName: "New", lastName: "Customer", phone: "555-0100" },
      });
      expect(created.status).toBeLessThan(300);
      expect(
        (await call(routes.search.GET, { url: "http://localhost/api/search?q=Ada" })).status
      ).toBe(200);
    });
  });

  describe("dashboard", () => {
    it("gives Employees an operational view with no financial data", async () => {
      const created = await createOrder("employee");
      as("employee");
      await call(routes.payments.POST, { method: "POST", params: { id: created.json.id }, body: { amount: 5, method: "CASH" } });

      const result = await call(routes.dashboard.GET);
      expect(result.status).toBe(200);
      expect(result.json.financial).toBe(false);
      expect(result.json.metrics.ordersToday).toBe(1);

      const serialized = JSON.stringify(result.json);
      for (const field of ["revenueToday", "outstandingBalance", "recentPayments", "requiringPayment", "paymentSummary", "total", "amount"]) {
        expect(serialized).not.toContain(`"${field}"`);
      }
    });

    it("gives Managers financial reporting", async () => {
      await createOrder("manager");
      as("manager");
      const result = await call(routes.dashboard.GET);
      expect(result.json.financial).toBe(true);
      expect(result.json.metrics.outstandingBalance).toBe(12);
      expect(result.json.recentPayments).toBeDefined();
    });
  });

  describe("staff management", () => {
    it("denies Employees the staff list", async () => {
      as("employee");
      expect((await call(routes.users.GET)).status).toBe(403);
    });

    it("gives Managers names, roles and status only", async () => {
      as("manager");
      const result = await call(routes.users.GET);
      expect(result.status).toBe(200);
      expect(result.json.canManage).toBe(false);
      for (const user of result.json.users) {
        expect(Object.keys(user).sort()).toEqual(["active", "id", "name", "role"]);
      }
    });

    it("never lets Managers create or change accounts", async () => {
      as("manager");
      expect(
        (await call(routes.users.POST, { method: "POST", body: { name: "X", email: "x@test", password: "longenough", role: "EMPLOYEE" } })).status
      ).toBe(403);
      expect(
        (await call(routes.userById.PATCH, { method: "PATCH", params: { id: USERS.employee.id }, body: { role: "MANAGER" } })).status
      ).toBe(403);
      expect(
        (await call(routes.userById.PATCH, { method: "PATCH", params: { id: USERS.manager.id }, body: { role: "OWNER" } })).status
      ).toBe(403);
    });

    it("lets Owners add staff without exposing password hashes", async () => {
      as("owner");
      const result = await call(routes.users.POST, {
        method: "POST",
        body: { name: "New Hire", email: "New.Hire@Test.com", password: "longenough", role: "EMPLOYEE" },
      });
      expect(result.status).toBe(201);
      expect(result.json.password).toBeUndefined();
      expect(result.json.email).toBe("new.hire@test.com");

      const stored = await prisma.user.findUnique({ where: { email: "new.hire@test.com" } });
      expect(stored.password).not.toBe("longenough");

      const list = await call(routes.users.GET);
      expect(JSON.stringify(list.json)).not.toContain('"password"');

      const duplicate = await call(routes.users.POST, {
        method: "POST",
        body: { name: "Dup", email: "new.hire@test.com", password: "longenough" },
      });
      expect(duplicate.status).toBe(409);

      const short = await call(routes.users.POST, {
        method: "POST",
        body: { name: "Short", email: "short@test.com", password: "short" },
      });
      expect(short.status).toBe(400);
    });

    it("defaults new accounts to Employee", async () => {
      as("owner");
      const result = await call(routes.users.POST, {
        method: "POST",
        body: { name: "Default", email: "default@test.com", password: "longenough" },
      });
      expect(result.json.role).toBe("EMPLOYEE");
    });

    it("lets Owners change roles and deactivate, which takes effect immediately", async () => {
      as("owner");
      const promote = await call(routes.userById.PATCH, {
        method: "PATCH",
        params: { id: USERS.employee.id },
        body: { role: "MANAGER" },
      });
      expect(promote.status).toBe(200);

      as("employee");
      expect((await call(routes.users.GET)).status).toBe(200);

      as("owner");
      await call(routes.userById.PATCH, { method: "PATCH", params: { id: USERS.employee.id }, body: { active: false } });

      as("employee");
      expect((await call(routes.orders.GET)).status).toBe(401);
    });

    it("protects the last active Owner and the Owner's own account", async () => {
      as("owner");
      const selfDemote = await call(routes.userById.PATCH, {
        method: "PATCH",
        params: { id: USERS.owner.id },
        body: { role: "EMPLOYEE" },
      });
      expect(selfDemote.status).toBe(403);

      const selfDeactivate = await call(routes.userById.PATCH, {
        method: "PATCH",
        params: { id: USERS.owner.id },
        body: { active: false },
      });
      expect(selfDeactivate.status).toBe(403);

      // A second Owner can't remove the only other Owner either.
      await prisma.user.update({ where: { id: USERS.manager.id }, data: { role: "OWNER" } });
      as("manager");
      expect(
        (await call(routes.userById.PATCH, { method: "PATCH", params: { id: USERS.owner.id }, body: { role: "EMPLOYEE" } })).status
      ).toBe(200);
      // The demoted Owner loses staff access on their very next request.
      as("owner");
      expect((await call(routes.users.GET)).status).toBe(403);
    });

    it("refuses to remove the final Owner even via another Owner's request", async () => {
      await prisma.user.update({ where: { id: USERS.manager.id }, data: { role: "OWNER" } });
      await prisma.user.update({ where: { id: USERS.owner.id }, data: { active: false } });

      // u-manager is now the only active Owner; nobody else can demote them
      // and they can't demote themselves.
      as("manager");
      expect(
        (await call(routes.userById.PATCH, { method: "PATCH", params: { id: USERS.manager.id }, body: { role: "EMPLOYEE" } })).status
      ).toBe(403);
    });
  });
});
