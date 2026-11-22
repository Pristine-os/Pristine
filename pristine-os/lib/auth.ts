import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { AuthOptions } from "next-auth";
import { prisma } from "@/lib/prisma";
import { canonicalEmail, findUserIdsByEmail } from "@/lib/staff";
import {
  clientIp,
  recordLoginSuccess,
  reserveLoginAttempt,
  throttleKeys,
} from "@/lib/loginThrottle";

// A real bcrypt hash of a throwaway value. Compared against when there's no
// usable account, so a login for an unknown, ambiguous or deactivated
// account takes as long as one for a real account and timing doesn't
// reveal which emails exist.
const TIMING_EQUALIZER_HASH =
  "$2b$10$Z38PoPLBwvhcMfudaRexnuP0pIVrcLzUGMSVvgOqeRUiK6JzL4cB6";

/*
 * Credential check for the login form. Emails are matched trimmed and
 * case-insensitively, so "  Owner@Pristine.com " signs in as
 * owner@pristine.com — including accounts created before emails were
 * stored lower-cased. If more than one account matches case-insensitively
 * (only possible with legacy data, since the unique index is
 * case-sensitive) the login is refused rather than guessing which one.
 */
export async function authorizeCredentials(
  rawEmail: unknown,
  password: unknown
) {
  const email = canonicalEmail(rawEmail);

  if (!email || typeof password !== "string" || !password) {
    return null;
  }

  const matches = await findUserIdsByEmail(email);

  const user =
    matches.length === 1
      ? await prisma.user.findUnique({ where: { id: matches[0] } })
      : null;

  // Always run one bcrypt comparison, whether or not there's an account.
  const validPassword = await bcrypt.compare(
    password,
    user?.password ?? TIMING_EQUALIZER_HASH
  );

  // Deactivated accounts can't sign in.
  if (!user || !user.active || !validPassword) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
  };
}

/*
 * Login with abuse protection (lib/loginThrottle.ts): the attempt is
 * counted before the password is checked, and refused — without checking
 * the password — while the account or network is temporarily blocked. A
 * refusal returns null exactly like a wrong password, so the client can't
 * tell the two apart.
 */
export async function authorizeLogin(
  rawEmail: unknown,
  password: unknown,
  ip: string | null,
  now: Date = new Date()
) {
  const email = canonicalEmail(rawEmail);

  if (!email || typeof password !== "string" || !password) {
    return null;
  }

  const keys = throttleKeys(email, ip);
  const reservation = await reserveLoginAttempt(keys, now);

  if (!reservation.allowed) {
    return null;
  }

  const user = await authorizeCredentials(email, password);

  if (user) {
    await recordLoginSuccess(keys, now);
  }

  return user;
}

export const authOptions: AuthOptions = {
  providers: [
    Credentials({
      name: "Credentials",

      credentials: {
        email: {},
        password: {},
      },

      async authorize(credentials, req) {
        return authorizeLogin(
          credentials?.email,
          credentials?.password,
          clientIp(req?.headers)
        );
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.organizationId = user.organizationId;
        token.role = user.role;
      }

      return token;
    },

    // The role carried here is for UI and page routing only — API routes
    // re-read it from the database (lib/authz.ts).
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.organizationId = token.organizationId;
        session.user.role = token.role;
      }

      return session;
    },
  },
};
