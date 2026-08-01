import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      organizationId: string;
    };
  }

  interface User {
    organizationId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId: string;
  }
}