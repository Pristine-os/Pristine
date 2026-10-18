import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { AuthOptions } from "next-auth";
import { prisma } from "@/lib/prisma";
import { canonicalEmail, findUserIdsByEmail } from "@/lib/staff";

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

  if (matches.length !== 1) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: matches[0] } });

  if (!user) {
    return null;
  }

  // Deactivated accounts can't sign in.
  if (!user.active) {
    return null;
  }

  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
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

export const authOptions: AuthOptions = {
  providers: [
    Credentials({
      name: "Credentials",

      credentials: {
        email: {},
        password: {},
      },

      async authorize(credentials) {
        return authorizeCredentials(credentials?.email, credentials?.password);
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
