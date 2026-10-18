import { prisma } from "@/lib/prisma";
import { isRole, type Role } from "@/lib/permissions";

export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Canonical form used everywhere an email is stored or compared:
// surrounding whitespace removed, lower-cased.
export function canonicalEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// canonicalEmail plus a format check, for creating accounts.
export function normalizeEmail(value: unknown): string | null {
  const email = canonicalEmail(value);
  return EMAIL_PATTERN.test(email) ? email : null;
}

export function parseRole(value: unknown): Role | null {
  return isRole(value) ? value : null;
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/*
 * IDs of every account whose stored email equals `email` ignoring case and
 * surrounding whitespace. Exact comparison on purpose: Prisma's
 * `mode: "insensitive"` uses ILIKE, where "%" and "_" in user input would
 * act as wildcards. `email` must already be canonical.
 */
export async function findUserIdsByEmail(email: string, limit = 2): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE lower(trim("email")) = ${email} LIMIT ${limit}
  `;
  return rows.map((row) => row.id);
}
