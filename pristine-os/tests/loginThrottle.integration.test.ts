/*
 * Login rate limiting against a real database. Time is passed in
 * explicitly, so expiry and progressive delays are tested without waiting.
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

const PASSWORD = "correct-password";
const T0 = new Date("2026-01-01T09:00:00Z").getTime();
const at = (seconds: number) => new Date(T0 + seconds * 1000);

const SHOP = "203.0.113.10";
const ATTACKER = "198.51.100.66";

describe.skipIf(!enabled)("login rate limiting (integration)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let throttle: any;
  let authorizeLogin: (
    email: unknown,
    password: unknown,
    ip: string | null,
    now?: Date
  ) => Promise<{ id: string } | null>;

  const login = (email: string, password: string, ip: string | null, seconds: number) =>
    authorizeLogin(email, password, ip, at(seconds));

  async function row(scope: "account" | "ip" | "accountIp", email: string, ip: string | null) {
    const key = throttle.throttleKeys(email, ip).find((k: { scope: string }) => k.scope === scope);
    return key ? prisma.loginThrottle.findUnique({ where: { keyHash: key.hash } }) : null;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    throttle = await import("@/lib/loginThrottle");
    authorizeLogin = (await import("@/lib/auth")).authorizeLogin;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "LoginThrottle", "Notification", "Payment", "GarmentTag", "Garment", "Order", "Rack", "Price", "Customer", "User", "Organization" CASCADE'
    );
    await prisma.organization.create({ data: { id: "org-1", name: "One" } });
    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.createMany({
      data: [
        { id: "owner", email: "owner@test", password, role: "OWNER", organizationId: "org-1" },
        { id: "e1", email: "e1@test", password, role: "EMPLOYEE", organizationId: "org-1" },
        { id: "e2", email: "e2@test", password, role: "EMPLOYEE", organizationId: "org-1" },
        { id: "gone", email: "gone@test", password, role: "EMPLOYEE", active: false, organizationId: "org-1" },
      ],
    });
  });

  it("never throttles staff who keep signing in successfully from the shop network", async () => {
    for (let i = 0; i < 45; i++) {
      const email = ["owner@test", "e1@test", "e2@test"][i % 3];
      expect(await login(email, PASSWORD, SHOP, i)).not.toBeNull();
    }
    expect((await row("ip", "owner@test", SHOP))?.attempts ?? 0).toBe(0);
  });

  it("pauses an account on a network after 5 failures — even the right password — then recovers", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await login("owner@test", "wrong", ATTACKER, i)).toBeNull();
    }
    // Blocked for 30s after the 5th failure (at t=4).
    expect(await login("owner@test", PASSWORD, ATTACKER, 10)).toBeNull();
    expect(await login("owner@test", PASSWORD, ATTACKER, 33)).toBeNull();

    // Block over: the right password works and clears the account's counters.
    expect(await login("owner@test", PASSWORD, ATTACKER, 35)).not.toBeNull();
    expect(await row("accountIp", "owner@test", ATTACKER)).toBeNull();
    expect(await row("account", "owner@test", ATTACKER)).toBeNull();

    // A single typo afterwards is not punished.
    expect(await login("owner@test", "typo", ATTACKER, 36)).toBeNull();
    expect(await login("owner@test", PASSWORD, ATTACKER, 37)).not.toBeNull();
  });

  it("doubles the delay for each further failure, up to 15 minutes, and keeps it there", async () => {
    let t = 0;
    for (let i = 0; i < 5; i++) await login("e1@test", "wrong", ATTACKER, t++);
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      const current = await row("accountIp", "e1@test", ATTACKER);
      delays.push((current.blockedUntil.getTime() - current.lastAttemptAt.getTime()) / 1000);
      // Next attempt right after the block ends.
      t = (current.blockedUntil.getTime() - T0) / 1000 + 1;
      expect(await login("e1@test", "wrong", ATTACKER, t)).toBeNull();
    }
    expect(delays).toEqual([30, 60, 120, 240, 480, 900, 900, 900]);
  });

  it("does not extend a block while it is being hammered", async () => {
    for (let i = 0; i < 5; i++) await login("e1@test", "wrong", ATTACKER, i);
    const before = await row("accountIp", "e1@test", ATTACKER);
    for (let i = 0; i < 20; i++) {
      expect(await login("e1@test", "wrong", ATTACKER, 5 + i)).toBeNull();
    }
    const after = await row("accountIp", "e1@test", ATTACKER);
    expect(after.attempts).toBe(before.attempts);
    expect(after.blockedUntil.getTime()).toBe(before.blockedUntil.getTime());
  });

  it("resets counters after 15 quiet minutes", async () => {
    for (let i = 0; i < 4; i++) await login("e1@test", "wrong", ATTACKER, i);
    // 16 minutes later: a fresh window, so 4 more failures still don't block.
    for (let i = 0; i < 4; i++) await login("e1@test", "wrong", ATTACKER, 960 + i);
    expect((await row("accountIp", "e1@test", ATTACKER)).blockedUntil).toBeNull();
    expect(await login("e1@test", PASSWORD, ATTACKER, 965)).not.toBeNull();
  });

  it("does not lock the Owner out of other networks when one network attacks", async () => {
    for (let i = 0; i < 9; i++) await login("owner@test", "wrong", ATTACKER, i);
    expect(await login("owner@test", PASSWORD, ATTACKER, 10)).toBeNull();
    expect(await login("owner@test", PASSWORD, SHOP, 10)).not.toBeNull();
  });

  it("caps an account-wide block at 60 seconds against a distributed attack", async () => {
    let maxAccountDelay = 0;
    // One wrong guess per second for 10 minutes, each from a different IP.
    for (let s = 0; s < 600; s++) {
      await login("owner@test", "wrong", `192.0.2.${(s % 250) + 1}`, s);
      const account = await row("account", "owner@test", null);
      if (account?.blockedUntil) {
        maxAccountDelay = Math.max(
          maxAccountDelay,
          account.blockedUntil.getTime() - account.lastAttemptAt.getTime()
        );
      }
    }
    expect(maxAccountDelay).toBe(60_000);

    // The real Owner, retrying every 5 seconds, gets in within a minute.
    let waited = 0;
    while (!(await login("owner@test", PASSWORD, SHOP, 600 + waited))) {
      waited += 5;
      expect(waited).toBeLessThanOrEqual(60);
    }
    // ...and that success clears the account-wide block.
    expect(await row("account", "owner@test", null)).toBeNull();
  });

  it("counts a burst of parallel attempts one at a time", async () => {
    const keys = throttle.throttleKeys("e2@test", ATTACKER);
    const results = await Promise.all(
      Array.from({ length: 25 }, () => throttle.reserveLoginAttempt(keys, at(0)))
    );
    expect(results.filter((r: { allowed: boolean }) => r.allowed)).toHaveLength(5);
    expect((await row("accountIp", "e2@test", ATTACKER)).attempts).toBe(5);
  });

  it("treats unknown emails exactly like real ones", async () => {
    const outcomes = async (email: string) => {
      const results = [];
      for (let i = 0; i < 7; i++) results.push(await login(email, "wrong", ATTACKER, i));
      const state = await row("accountIp", email, ATTACKER);
      return { results, attempts: state.attempts, blockedFor: state.blockedUntil - state.lastAttemptAt };
    };
    expect(await outcomes("nobody@test")).toEqual(await outcomes("e1@test"));
  });

  it("runs one bcrypt comparison per login whether or not the account exists", async () => {
    const spy = vi.spyOn(bcrypt, "compare");
    for (const email of ["nobody@test", "gone@test", "e1@test"]) {
      spy.mockClear();
      expect(await login(email, "wrong", SHOP, 0)).toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
    }
    spy.mockRestore();
  });

  it("falls back to the account-wide key alone when the IP is unknown", async () => {
    for (let i = 0; i < 9; i++) await login("e1@test", "wrong", null, i);
    expect(await login("e1@test", PASSWORD, null, 10)).not.toBeNull();
    expect(await prisma.loginThrottle.count()).toBe(0); // success cleared the only key
  });

  it("stores only hashes, never emails or IPs", async () => {
    await login("owner@test", "wrong", ATTACKER, 0);
    const rows = await prisma.loginThrottle.findMany();
    expect(rows).toHaveLength(3);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("owner");
    expect(dump).not.toContain(ATTACKER);
  });
});
