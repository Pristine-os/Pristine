import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";

/*
 * Database-backed login abuse protection.
 *
 * Each login attempt is counted against up to three keys before the
 * password is checked:
 *
 *   accountIp  this email from this network    5 attempts,  30s doubling, max 15 min
 *   ip         this network, any account      20 attempts,  30s doubling, max 15 min
 *   account    this email from anywhere       10 attempts,   5s doubling, max 60 s
 *
 * Once a key reaches its threshold, each further attempt pushes its
 * `blockedUntil` out by a progressively longer delay. While any key is
 * blocked, attempts are refused without checking the password and without
 * extending the block. Counters reset after RESET_AFTER_MS with no attempts
 * once any block has ended.
 *
 * Owner lock-out: an attacker can only block the account from their own
 * network for long; across all networks (the `account` key) the delay is
 * capped at 60 seconds, so a distributed attacker can slow but never lock
 * out the real user, and the real user's successful login clears it.
 *
 * Account existence: keys are derived from the typed email, never from a
 * user record, so unknown emails are throttled exactly like real ones, and
 * a refused attempt looks the same to the client as a wrong password.
 *
 * Privacy: only an HMAC of each key is stored — never the email or IP.
 *
 * Concurrency: counting happens in one transaction that locks the key rows
 * (in a fixed order), so parallel attempts are counted one at a time and a
 * burst can't slip more than the threshold past the check.
 */

export type ThrottleScope = "accountIp" | "ip" | "account";

type Rule = { threshold: number; baseDelayMs: number; maxDelayMs: number };

export const THROTTLE_RULES: Record<ThrottleScope, Rule> = {
  accountIp: { threshold: 5, baseDelayMs: 30_000, maxDelayMs: 15 * 60_000 },
  ip: { threshold: 20, baseDelayMs: 30_000, maxDelayMs: 15 * 60_000 },
  account: { threshold: 10, baseDelayMs: 5_000, maxDelayMs: 60_000 },
};

// Counters start over after this long without an attempt on the key,
// measured from the end of any block (so waiting out a maximum-length block
// doesn't by itself earn a fresh set of attempts).
export const RESET_AFTER_MS = 15 * 60_000;

// Rows idle this long (and not blocked) are deleted opportunistically.
const RETAIN_MS = 24 * 60 * 60_000;

export type ThrottleKey = { scope: ThrottleScope; hash: string };

/*
 * Delay applied after an attempt that brings a key to `attempts`. Zero below
 * the threshold; from the threshold on, base × 2^(attempts − threshold),
 * capped at the rule's maximum.
 */
export function delayAfter(scope: ThrottleScope, attempts: number): number {
  const rule = THROTTLE_RULES[scope];
  if (attempts < rule.threshold) return 0;
  const exponent = Math.min(attempts - rule.threshold, 30);
  return Math.min(rule.baseDelayMs * 2 ** exponent, rule.maxDelayMs);
}

function hashKey(value: string): string {
  // Keyed with the app secret when available so stored hashes can't be
  // matched against a list of known emails or IPs.
  const secret = process.env.NEXTAUTH_SECRET;
  return secret
    ? createHmac("sha256", secret).update(value).digest("hex")
    : createHash("sha256").update(value).digest("hex");
}

/*
 * The keys for one attempt. `email` must already be canonical (trimmed,
 * lower-cased). Without a usable client IP only the account-wide key
 * applies: per-network keys shared by every IP-less request could let one
 * attacker throttle everyone.
 */
export function throttleKeys(email: string, ip: string | null): ThrottleKey[] {
  const keys: ThrottleKey[] = [{ scope: "account", hash: hashKey(`account:${email}`) }];

  if (ip) {
    keys.push({ scope: "ip", hash: hashKey(`ip:${ip}`) });
    keys.push({ scope: "accountIp", hash: hashKey(`accountIp:${email}|${ip}`) });
  }

  return keys;
}

/*
 * Client IP from request headers. Assumes the app runs behind a proxy that
 * sets these headers itself (e.g. Vercel); without one they can be spoofed,
 * which only weakens the per-network keys — the account-wide key still
 * applies. Anything that isn't a valid IP address is treated as unknown.
 */
export function clientIp(headers: Record<string, unknown> | undefined): string | null {
  if (!headers) return null;

  const header = (name: string) => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return typeof value === "string" ? value : Array.isArray(value) ? String(value[0]) : "";
  };

  const candidates = [header("x-real-ip"), header("x-forwarded-for").split(",")[0]];

  for (const candidate of candidates) {
    const ip = candidate.trim();
    if (ip && isIP(ip)) return ip.toLowerCase();
  }

  return null;
}

type ThrottleRow = {
  keyHash: string;
  attempts: number;
  lastAttemptAt: Date;
  blockedUntil: Date | null;
};

/*
 * Counts one login attempt against every key, unless one of them is
 * currently blocked — then nothing is counted and the attempt is refused.
 */
export async function reserveLoginAttempt(
  keys: ThrottleKey[],
  now: Date = new Date()
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  // Lock rows in a fixed order so concurrent attempts can't deadlock.
  const ordered = [...keys].sort((a, b) => a.hash.localeCompare(b.hash));
  const hashes = ordered.map((key) => key.hash);

  return prisma.$transaction(async (tx) => {
    for (const hash of hashes) {
      await tx.$executeRaw`
        INSERT INTO "LoginThrottle" ("keyHash", "attempts", "lastAttemptAt")
        VALUES (${hash}, 0, ${now})
        ON CONFLICT ("keyHash") DO NOTHING
      `;
    }

    const rows = new Map<string, ThrottleRow>();
    for (const hash of hashes) {
      const [row] = await tx.$queryRaw<ThrottleRow[]>`
        SELECT "keyHash", "attempts", "lastAttemptAt", "blockedUntil"
        FROM "LoginThrottle" WHERE "keyHash" = ${hash}
        FOR UPDATE
      `;
      rows.set(hash, row);
    }

    const blockedUntil = Math.max(
      ...[...rows.values()].map((row) => row.blockedUntil?.getTime() ?? 0)
    );

    if (blockedUntil > now.getTime()) {
      return { allowed: false as const, retryAfterMs: blockedUntil - now.getTime() };
    }

    for (const key of ordered) {
      const row = rows.get(key.hash)!;
      const quietSince = Math.max(
        row.lastAttemptAt.getTime(),
        row.blockedUntil?.getTime() ?? 0
      );
      const stale = now.getTime() - quietSince > RESET_AFTER_MS;
      const attempts = (stale ? 0 : row.attempts) + 1;
      const delay = delayAfter(key.scope, attempts);

      await tx.$executeRaw`
        UPDATE "LoginThrottle"
        SET "attempts" = ${attempts},
            "lastAttemptAt" = ${now},
            "blockedUntil" = ${delay > 0 ? new Date(now.getTime() + delay) : null}
        WHERE "keyHash" = ${key.hash}
      `;
    }

    return { allowed: true as const };
  });
}

/*
 * A successful login clears the account's counters. For the network-wide
 * key it only takes back this attempt, so many staff signing in from one
 * shop network never accumulate a block, while failures from that network
 * still count.
 */
export async function recordLoginSuccess(keys: ThrottleKey[], now: Date = new Date()) {
  const accountHashes = keys.filter((key) => key.scope !== "ip").map((key) => key.hash);
  const ipKey = keys.find((key) => key.scope === "ip");

  await prisma.$transaction(async (tx) => {
    if (accountHashes.length > 0) {
      await tx.$executeRaw`
        DELETE FROM "LoginThrottle" WHERE "keyHash" = ANY(${accountHashes}::text[])
      `;
    }

    if (ipKey) {
      const [row] = await tx.$queryRaw<ThrottleRow[]>`
        SELECT "keyHash", "attempts", "lastAttemptAt", "blockedUntil"
        FROM "LoginThrottle" WHERE "keyHash" = ${ipKey.hash}
        FOR UPDATE
      `;

      if (row) {
        const attempts = Math.max(row.attempts - 1, 0);
        const blocked = delayAfter("ip", attempts) > 0 ? row.blockedUntil : null;
        await tx.$executeRaw`
          UPDATE "LoginThrottle" SET "attempts" = ${attempts}, "blockedUntil" = ${blocked}
          WHERE "keyHash" = ${ipKey.hash}
        `;
      }
    }

    // Housekeeping: drop long-idle, unblocked rows.
    const cutoff = new Date(now.getTime() - RETAIN_MS);
    await tx.$executeRaw`
      DELETE FROM "LoginThrottle"
      WHERE "lastAttemptAt" < ${cutoff}
        AND ("blockedUntil" IS NULL OR "blockedUntil" < ${now})
    `;
  });
}
