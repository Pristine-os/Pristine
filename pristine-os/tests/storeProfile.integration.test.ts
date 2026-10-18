/*
 * Store profile + ready-notification preference against a real database.
 * Same safety guard as the other integration tests.
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
  owner: { id: "p-owner", role: "OWNER", org: "org-1" },
  manager: { id: "p-manager", role: "MANAGER", org: "org-1" },
  employee: { id: "p-employee", role: "EMPLOYEE", org: "org-1" },
  otherOwner: { id: "p-other", role: "OWNER", org: "org-2" },
} as const;

type Actor = keyof typeof USERS;

function as(actor: Actor) {
  currentSession = { user: { id: USERS[actor].id, organizationId: USERS[actor].org, role: USERS[actor].role } };
}

describe.skipIf(!enabled)("store profile and ready notifications (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routes: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendSpy: any;

  async function call(handler: (r: Request, c?: unknown) => Promise<Response>, method: string, body?: unknown, params: Record<string, string> = {}) {
    const request = new Request("http://localhost/api/test", {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const response = await handler(request, { params: Promise.resolve(params) });
    return { status: response.status, json: await response.json() };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    routes = {
      store: await import("@/app/api/store/route"),
      transition: await import("@/app/api/orders/[id]/transition/route"),
      ready: await import("@/app/api/orders/[id]/notifications/ready/route"),
    };
    const { devNotificationProvider } = await import("@/lib/notifications/devProvider");
    sendSpy = vi.spyOn(devNotificationProvider, "send");
  });

  afterEach(() => sendSpy.mockClear());

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
        data: { id: user.id, email: `${user.id}@test`, password: "x", role: user.role, organizationId: user.org },
      });
    }
    await prisma.customer.create({
      data: { id: "c-1", firstName: "Ada", lastName: "L", phone: "555-0100", organizationId: "org-1" },
    });
    await prisma.order.create({
      data: { id: "o-1", orderNumber: "PR-1", status: "PROCESSING", customerId: "c-1", organizationId: "org-1", total: 10 },
    });
  });

  const markReady = () => call(routes.transition.PATCH, "PATCH", { to: "READY" }, { id: "o-1" });

  it("returns defaults for a store that hasn't set its profile", async () => {
    as("employee");
    const result = await call(routes.store.GET, "GET");
    expect(result.status).toBe(200);
    expect(result.json.displayName).toBeNull();
    expect(result.json.readyNotificationsEnabled).toBe(true);
    expect(result.json.defaults.displayName).toBe("Pristine Cleaners");
  });

  it("lets only Owners change the profile and keeps it in their organization", async () => {
    for (const actor of ["manager", "employee"] as const) {
      as(actor);
      expect((await call(routes.store.PATCH, "PATCH", { displayName: "Nope" })).status).toBe(403);
    }

    as("otherOwner");
    const other = await call(routes.store.PATCH, "PATCH", { displayName: "Other Store", organizationId: "org-1" });
    expect(other.status).toBe(200);

    as("owner");
    const result = await call(routes.store.PATCH, "PATCH", {
      displayName: "Main Street Cleaners",
      phone: "555-0199",
      email: "Hello@MainStreet.test",
      businessHours: "Mon-Fri 7-7\nSat 9-5",
      receiptFooter: "Bring this ticket.",
    });
    expect(result.status).toBe(200);
    expect(result.json.email).toBe("hello@mainstreet.test");

    const stored = await prisma.organization.findUnique({ where: { id: "org-1" } });
    expect(stored.displayName).toBe("Main Street Cleaners");
    expect(stored.businessHours).toBe("Mon-Fri 7-7\nSat 9-5");
    expect((await prisma.organization.findUnique({ where: { id: "org-2" } })).displayName).toBe("Other Store");

    // Clearing a field restores the default.
    await call(routes.store.PATCH, "PATCH", { displayName: "" });
    expect((await prisma.organization.findUnique({ where: { id: "org-1" } })).displayName).toBeNull();
  });

  it("rejects invalid updates without changing anything", async () => {
    as("owner");
    for (const body of [{ email: "bad" }, { phone: "call me" }, { city: "x".repeat(81) }, { readyNotificationsEnabled: "no" }]) {
      expect((await call(routes.store.PATCH, "PATCH", { displayName: "Changed", ...body })).status).toBe(400);
    }
    expect((await prisma.organization.findUnique({ where: { id: "org-1" } })).displayName).toBeNull();
  });

  it("keeps today's behaviour by default: automatic send with the original store name", async () => {
    as("employee");
    expect((await markReady()).status).toBe(200);

    const notification = await prisma.notification.findFirst({ where: { orderId: "o-1" } });
    expect(notification.status).toBe("SIMULATED");
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].message).toBe("Hi Ada, your order PR-1 is ready for pickup at Pristine Cleaners.");
  });

  it("uses the store's customer-facing name in the message", async () => {
    await prisma.organization.update({ where: { id: "org-1" }, data: { displayName: "Main Street Cleaners" } });
    as("employee");
    await markReady();
    expect(sendSpy.mock.calls[0][0].message).toContain("ready for pickup at Main Street Cleaners.");
  });

  it("skips the automatic message when disabled but still allows a manual send", async () => {
    await prisma.organization.update({ where: { id: "org-1" }, data: { readyNotificationsEnabled: false } });
    as("employee");
    expect((await markReady()).status).toBe(200);

    // Intent is recorded but nothing was sent.
    let notification = await prisma.notification.findFirst({ where: { orderId: "o-1" } });
    expect(notification.status).toBe("PENDING");
    expect(notification.attempts).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();

    const manual = await call(routes.ready.POST, "POST", undefined, { id: "o-1" });
    expect(manual.status).toBe(200);
    notification = await prisma.notification.findFirst({ where: { orderId: "o-1" } });
    expect(notification.status).toBe("SIMULATED");
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
