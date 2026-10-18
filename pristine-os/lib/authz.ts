import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, isRole, type Permission, type Role } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  organizationId: string;
};

/*
 * Resolves the signed-in user for an API route and, optionally, checks a
 * permission. Returns either the user or a ready-made 401/403 Response.
 *
 * The role, active flag and organization are always re-read from the
 * database rather than trusted from the JWT, so a demotion or
 * deactivation takes effect on the very next request instead of when the
 * token expires. Any failure denies by default.
 */
export async function requireUser(
  permission?: Permission
): Promise<{ user: CurrentUser; error?: never } | { user?: never; error: Response }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId || !session?.user?.organizationId) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      organizationId: true,
    },
  });

  if (
    !user ||
    !user.active ||
    !isRole(user.role) ||
    user.organizationId !== session.user.organizationId
  ) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (permission && !can(user.role, permission)) {
    return { error: forbidden() };
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
  };
}

export function forbidden(message = "You don't have permission to do that.") {
  return Response.json({ error: message }, { status: 403 });
}
