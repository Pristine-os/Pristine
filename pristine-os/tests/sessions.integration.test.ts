/*
 * Session invalidation: a password reset (or deactivation) must end every
 * session issued before it. Real database, real route handlers; only
 * NextAuth's getServerSession is mocked to present a given session token.
 * Same safety guard as the other integration tests.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

let currentSession: unknown = null;

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => currentSession),
}));

type Session = {
  user: { id: string; organizationId: string; role: string; sessionVersion?: number };
};

// A session as NextAuth would present it. `version: undefined` models a
// token issued before session versions existed.
function sessionFor(id: string, organizationId: string, role: string, version?: number): Session {
  return {
    user: {
      id,
      organizationId,
      role,
      ...(version === undefined ? {} : { sessionVersion: version }),
    },
  };
}

const OLD_PASSWORD = "old-password-1";
const NEW_PASSWORD = "new-password-2";

describe.skipIf(!enabled)("password reset session invalidation (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routes: Record<string, any>;
  let authorizeCredentials: (email: unknown, password: unknown) => Promise<{
    id: string;
    organizationId: string;
    role: string;
    sessionVersion: number;
  } | null>;

  const owner = sessionFor("owner", "org-1", "OWNER", 0);
  const employee = sessionFor("employee", "org-1", "EMPLOYEE", 0);
  const otherOwner = sessionFor("other-owner", "org-2", "OWNER", 0);

  // Any authenticated request; /api/me is the simplest.
  async function me(session: Session | null) {
    currentSession = session;
    return (await routes.me.GET()).status;
  }

  async function patchUser(actor: Session, id: string, body: unknown) {
    currentSession = actor;
    const response = await routes.userById.PATCH(
      new Request(`http://localhost/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
    return { status: response.status, json: await response.json() };
  }

  // Log in for real and turn the result into the session NextAuth would issue.
  async function login(email: string, password: string): Promise<Session | null> {
    const user = await authorizeCredentials(email, password);
    return user ? sessionFor(user.id, user.organizationId, user.role, user.sessionVersion) : null;
  }

  const version = async (id: string) =>
    (await prisma.user.findUnique({ where: { id } })).sessionVersion;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    authorizeCredentials = (await import("@/lib/auth")).authorizeCredentials;
    routes = {
      me: await import("@/app/api/me/route"),
      userById: await import("@/app/api/users/[id]/route"),
    };
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Notification", "Payment", "GarmentTag", "Garment", "Order", "Rack", "Price", "Customer", "User", "Organization" CASCADE'
    );
    await prisma.organization.createMany({
      data: [
        { id: "org-1", name: "One" },
        { id: "org-2", name: "Two" },
      ],
    });
    const password = await bcrypt.hash(OLD_PASSWORD, 4);
    await prisma.user.createMany({
      data: [
        { id: "owner", email: "owner@test", password, role: "OWNER", organizationId: "org-1" },
        { id: "manager", email: "manager@test", password, role: "MANAGER", organizationId: "org-1" },
        { id: "employee", email: "employee@test", password, role: "EMPLOYEE", organizationId: "org-1" },
        { id: "other-owner", email: "other@test", password, role: "OWNER", organizationId: "org-2" },
      ],
    });
  });

  it("keeps existing sessions working, including tokens issued before session versions", async () => {
    expect(await me(employee)).toBe(200);
    expect(await me(sessionFor("employee", "org-1", "EMPLOYEE", undefined))).toBe(200);
  });

  it("ends every existing session when an Owner resets the password", async () => {
    const legacy = sessionFor("employee", "org-1", "EMPLOYEE", undefined);

    const reset = await patchUser(owner, "employee", { password: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect(reset.json.sessionVersion).toBeUndefined(); // not exposed
    expect(await version("employee")).toBe(1);

    expect(await me(employee)).toBe(401);
    expect(await me(legacy)).toBe(401);
  });

  it("lets the user sign in again with the new password and use the new session", async () => {
    await patchUser(owner, "employee", { password: NEW_PASSWORD });

    expect(await login("employee@test", OLD_PASSWORD)).toBeNull();
    const fresh = await login("employee@test", NEW_PASSWORD);
    expect(fresh?.user.sessionVersion).toBe(1);
    expect(await me(fresh)).toBe(200);

    // A second reset ends that session too.
    await patchUser(owner, "employee", { password: "third-password-3" });
    expect(await me(fresh)).toBe(401);
  });

  it("only affects the account whose password was reset", async () => {
    await patchUser(owner, "employee", { password: NEW_PASSWORD });
    expect(await me(owner)).toBe(200);
    expect(await me(sessionFor("manager", "org-1", "MANAGER", 0))).toBe(200);
    expect(await me(otherOwner)).toBe(200);
  });

  it("ends the Owner's own sessions when they reset their own password", async () => {
    expect((await patchUser(owner, "owner", { password: NEW_PASSWORD })).status).toBe(200);
    expect(await me(owner)).toBe(401);
    expect(await me(await login("owner@test", NEW_PASSWORD))).toBe(200);
  });

  it("does not revoke sessions for rejected resets or non-password changes", async () => {
    expect((await patchUser(owner, "employee", { password: "short" })).status).toBe(400);
    expect((await patchUser(sessionFor("manager", "org-1", "MANAGER", 0), "employee", { password: NEW_PASSWORD })).status).toBe(403);
    expect((await patchUser(owner, "employee", { name: "Renamed" })).status).toBe(200);
    expect((await patchUser(owner, "employee", { role: "MANAGER" })).status).toBe(200);

    expect(await version("employee")).toBe(0);
    expect(await me(sessionFor("employee", "org-1", "MANAGER", 0))).toBe(200);
  });

  it("ends sessions on deactivation and does not revive them on reactivation", async () => {
    expect((await patchUser(owner, "employee", { active: false })).status).toBe(200);
    expect(await me(employee)).toBe(401);
    expect(await login("employee@test", OLD_PASSWORD)).toBeNull();

    expect((await patchUser(owner, "employee", { active: true })).status).toBe(200);
    expect(await version("employee")).toBe(1);
    expect(await me(employee)).toBe(401); // the pre-deactivation session stays dead

    const fresh = await login("employee@test", OLD_PASSWORD);
    expect(fresh?.user.sessionVersion).toBe(1);
    expect(await me(fresh)).toBe(200);
  });

  it("keeps organizations isolated", async () => {
    const result = await patchUser(otherOwner, "employee", { password: NEW_PASSWORD });
    expect(result.status).toBe(404);
    expect(await version("employee")).toBe(0);
    expect(await me(employee)).toBe(200);
    expect(await login("employee@test", OLD_PASSWORD)).not.toBeNull();
  });

  it("rejects a session whose version doesn't match, in either direction", async () => {
    expect(await me(sessionFor("employee", "org-1", "EMPLOYEE", 5))).toBe(401);
    await prisma.user.update({ where: { id: "employee" }, data: { sessionVersion: 3 } });
    expect(await me(sessionFor("employee", "org-1", "EMPLOYEE", 2))).toBe(401);
    expect(await me(sessionFor("employee", "org-1", "EMPLOYEE", 3))).toBe(200);
  });
});
