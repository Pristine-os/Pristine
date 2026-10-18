import { isRole, type Role } from "@/lib/permissions";

export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
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
