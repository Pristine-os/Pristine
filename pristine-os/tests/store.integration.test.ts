/*
 * Store settings API against a real database. Same safety guard as the
 * other integration tests: only a localhost database whose name contains
 * "test", which is wiped.
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

const USERS = {
  owner: { id: "s-owner", role: "OWNER", org: "org-1", active: true },
  manager: { id: "s-manager", role: "MANAGER", org: "org-1", active: true },
  employee: { id: "s-employee", role: "EMPLOYEE", org: "org-1", active: true },
  inactiveOwner: { id: "s-inactive", role: "OWNER", org: "org-1", active: false },
  otherOwner: { id: "s-other", role: "OWNER", org: "org-2", active: true },
} as const;

type Actor = keyof typeof USERS;

function as(actor: Actor | null) {
  currentSession = actor
    ? { user: { id: USERS[actor].id, organizationId: USERS[actor].org, role: USERS[actor].role } }
    : null;
}

describe.skipIf(!enabled)("store settings API (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let store: any;

  async function call(method: "GET" | "PATCH", body?: unknown) {
    const request = new Request("http://localhost/api/store", {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const response = await (method === "GET" ? store.GET() : store.PATCH(request));
    return { status: response.status, json: await response.json() };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    store = await import("@/app/api/store/route");
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
          role: user.role,
          active: user.active,
          organizationId: user.org,
        },
      });
    }
  });

  it("lets every active role read their own store", async () => {
    for (const actor of ["owner", "manager", "employee"] as const) {
      as(actor);
      const result = await call("GET");
      expect(result.status).toBe(200);
      expect(result.json.name).toBe("Store One");
      expect(result.json.canEdit).toBe(actor === "owner");
    }
  });

  it("rejects signed-out and deactivated users", async () => {
    as(null);
    expect((await call("GET")).status).toBe(401);
    expect((await call("PATCH", { name: "X" })).status).toBe(401);
    as("inactiveOwner");
    expect((await call("GET")).status).toBe(401);
    expect((await call("PATCH", { name: "X" })).status).toBe(401);
  });

  it("lets only Owners change the store name", async () => {
    as("manager");
    expect((await call("PATCH", { name: "Manager Edit" })).status).toBe(403);
    as("employee");
    expect((await call("PATCH", { name: "Employee Edit" })).status).toBe(403);
    expect((await prisma.organization.findUnique({ where: { id: "org-1" } })).name).toBe("Store One");

    as("owner");
    const result = await call("PATCH", { name: "  Pristine   Cleaners " });
    expect(result.status).toBe(200);
    expect(result.json.name).toBe("Pristine Cleaners");
    expect((await prisma.organization.findUnique({ where: { id: "org-1" } })).name).toBe("Pristine Cleaners");
  });

  it("validates input and leaves the name unchanged on error", async () => {
    as("owner");
    for (const body of [{ name: "" }, { name: "   " }, { name: "x".repeat(101) }, { name: "Two\nLines" }, { name: 5 }, {}, "not json"]) {
      expect((await call("PATCH", body)).status).toBe(400);
    }
    expect((await prisma.organization.findUnique({ where: { id: "org-1" } })).name).toBe("Store One");
  });

  it("only ever changes the Owner's own organization", async () => {
    as("otherOwner");
    const result = await call("PATCH", { name: "Renamed Two", organizationId: "org-1", id: "org-1" });
    expect(result.status).toBe(200);
    expect((await prisma.organization.findUnique({ where: { id: "org-1" } })).name).toBe("Store One");
    expect((await prisma.organization.findUnique({ where: { id: "org-2" } })).name).toBe("Renamed Two");

    as("owner");
    expect((await call("GET")).json.name).toBe("Store One");
  });
});
