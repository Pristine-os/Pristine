import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { AuthOptions } from "next-auth";
import { prisma } from "@/lib/prisma";

export const authOptions: AuthOptions = {
  providers: [
    Credentials({
      name: "Credentials",

      credentials: {
        email: {},
        password: {},
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email,
          },
        });

        // Deactivated accounts can't sign in.
        if (!user || !user.active) {
          return null;
        }

        const validPassword = await bcrypt.compare(
          credentials.password,
          user.password
        );

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
