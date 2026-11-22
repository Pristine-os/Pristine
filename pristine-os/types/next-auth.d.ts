import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      organizationId: string;
      role: Role;
      sessionVersion: number;
    };
  }

  interface User {
    organizationId: string;
    role: Role;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId: string;
    role: Role;
    // Absent on tokens issued before session versions existed.
    sessionVersion?: number;
  }
}
