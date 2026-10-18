import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      organizationId: string;
      role: Role;
    };
  }

  interface User {
    organizationId: string;
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId: string;
    role: Role;
  }
}
