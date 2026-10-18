/*
 * Barcode lookups must match codes exactly (case-insensitively), never as
 * LIKE patterns. Same safety guard as the other integration tests.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { escapeLikePattern } from "@/lib/likePattern";

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

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLikePattern("PR-100")).toBe("PR-100");
    expect(escapeLikePattern("PR-%")).toBe("PR-\\%");
    expect(escapeLikePattern("RACK_1")).toBe("RACK\\_1");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });
});

describe.skipIf(!enabled)("barcode lookups (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orderLookup: any, rackLookup: any;

  async function lookup(handler: { GET: (r: Request) => Promise<Response> }, code: string) {
    const response = await handler.GET(
      new Request(`http://localhost/api/lookup?code=${encodeURIComponent(code)}`)
    );
    return { status: response.status, json: await response.json() };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    orderLookup = await import("@/app/api/orders/lookup/route");
    rackLookup = await import("@/app/api/racks/lookup/route");
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Notification", "Payment", "GarmentTag", "Garment", "Order", "Rack", "Price", "Customer", "User", "Organization" CASCADE'
    );
    await prisma.organization.createMany({ data: [{ id: "org-1", name: "One" }, { id: "org-2", name: "Two" }] });
    await prisma.user.create({
      data: { id: "u-1", email: "u1@test", password: "x", role: "EMPLOYEE", organizationId: "org-1" },
    });
    await prisma.customer.create({
      data: { id: "c-1", firstName: "Ada", lastName: "L", phone: "555", organizationId: "org-1" },
    });
    await prisma.customer.create({
      data: { id: "c-2", firstName: "Bo", lastName: "T", phone: "556", organizationId: "org-2" },
    });
    await prisma.order.createMany({
      data: [
        { id: "o-1", orderNumber: "PR-100", customerId: "c-1", organizationId: "org-1" },
        { id: "o-2", orderNumber: "PR-200", customerId: "c-2", organizationId: "org-2" },
      ],
    });
    await prisma.rack.createMany({
      data: [
        { id: "r-1", name: "1", barcodeValue: "RACK-001", organizationId: "org-1" },
        { id: "r-2", name: "2", barcodeValue: "RACK-002", organizationId: "org-2" },
      ],
    });
    currentSession = { user: { id: "u-1", organizationId: "org-1", role: "EMPLOYEE" } };
  });

  it("still finds orders and racks by exact code, ignoring case", async () => {
    expect((await lookup(orderLookup, "PR-100")).json.id).toBe("o-1");
    expect((await lookup(orderLookup, " pr-100 ")).json.id).toBe("o-1");
    expect((await lookup(rackLookup, "RACK-001")).json.id).toBe("r-1");
    expect((await lookup(rackLookup, "rack-001")).json.id).toBe("r-1");
  });

  it("treats % and _ in a scanned code literally", async () => {
    for (const code of ["PR-%", "%", "PR-1_0", "PR-___", "%100"]) {
      expect((await lookup(orderLookup, code)).status).toBe(404);
    }
    for (const code of ["RACK-%", "%", "RACK-00_", "_ACK-001"]) {
      expect((await lookup(rackLookup, code)).status).toBe(404);
    }
    expect((await lookup(orderLookup, "PR-10\\0")).status).toBe(404);
  });

  it("never returns another organization's order or rack", async () => {
    expect((await lookup(orderLookup, "PR-200")).status).toBe(404);
    expect((await lookup(rackLookup, "RACK-002")).status).toBe(404);
  });
});
