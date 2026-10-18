/*
 * Login regression tests: authorizeCredentials against a real database.
 * Same safety guard as api.integration.test.ts — only runs against a
 * localhost database whose name contains "test", and wipes it.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

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

describe.skipIf(!enabled)("login email normalization (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let authorizeCredentials: (email: unknown, password: unknown) => Promise<{ id: string; role: string } | null>;
  const PASSWORD = "correct-horse";

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    authorizeCredentials = (await import("@/lib/auth")).authorizeCredentials;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Notification", "Payment", "GarmentTag", "Garment", "Order", "Rack", "Price", "Customer", "User", "Organization" CASCADE'
    );
    await prisma.organization.create({ data: { id: "org-1", name: "Store" } });

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.createMany({
      data: [
        // Stored exactly like the existing seeded Owner.
        { id: "owner", email: "owner@pristine.com", password, role: "OWNER", organizationId: "org-1" },
        // A legacy account stored with mixed case.
        { id: "legacy", email: "Legacy.Manager@Pristine.com", password, role: "MANAGER", organizationId: "org-1" },
        { id: "inactive", email: "gone@pristine.com", password, role: "EMPLOYEE", active: false, organizationId: "org-1" },
      ],
    });
  });

  it("signs in with the exact stored email (existing Owner unaffected)", async () => {
    const user = await authorizeCredentials("owner@pristine.com", PASSWORD);
    expect(user?.id).toBe("owner");
    expect(user?.role).toBe("OWNER");
  });

  it("ignores case and surrounding whitespace", async () => {
    for (const email of ["OWNER@PRISTINE.COM", "  Owner@Pristine.com  ", "\towner@pristine.com\n"]) {
      expect((await authorizeCredentials(email, PASSWORD))?.id).toBe("owner");
    }
  });

  it("finds legacy mixed-case accounts from a lower-case login", async () => {
    expect((await authorizeCredentials("legacy.manager@pristine.com", PASSWORD))?.id).toBe("legacy");
    expect((await authorizeCredentials(" LEGACY.MANAGER@pristine.com", PASSWORD))?.id).toBe("legacy");
  });

  it("does not trim or alter the password", async () => {
    expect(await authorizeCredentials("owner@pristine.com", ` ${PASSWORD}`)).toBeNull();
    expect(await authorizeCredentials("owner@pristine.com", PASSWORD.toUpperCase())).toBeNull();
  });

  it("still rejects wrong passwords, unknown, blank and deactivated accounts", async () => {
    expect(await authorizeCredentials("owner@pristine.com", "wrong")).toBeNull();
    expect(await authorizeCredentials("nobody@pristine.com", PASSWORD)).toBeNull();
    expect(await authorizeCredentials("   ", PASSWORD)).toBeNull();
    expect(await authorizeCredentials(undefined, PASSWORD)).toBeNull();
    expect(await authorizeCredentials("owner@pristine.com", "")).toBeNull();
    expect(await authorizeCredentials("GONE@pristine.com", PASSWORD)).toBeNull();
  });

  it("refuses an ambiguous login when two accounts differ only by case", async () => {
    await prisma.user.create({
      data: {
        id: "dup",
        email: "OWNER@pristine.com",
        password: await bcrypt.hash(PASSWORD, 4),
        role: "EMPLOYEE",
        organizationId: "org-1",
      },
    });
    expect(await authorizeCredentials("owner@pristine.com", PASSWORD)).toBeNull();
  });

  it("does not treat email input as a pattern", async () => {
    expect(await authorizeCredentials("%@pristine.com", PASSWORD)).toBeNull();
    expect(await authorizeCredentials("owner@pristine.co_", PASSWORD)).toBeNull();
  });
});
