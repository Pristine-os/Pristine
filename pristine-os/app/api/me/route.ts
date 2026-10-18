import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { permissionsFor } from "@/lib/permissions";

// The signed-in user's role and permissions, for client pages that need
// to hide controls. Cosmetic only — every API route re-checks.
export async function GET() {
  const auth = await requireUser();

  if (auth.error) {
    return auth.error;
  }

  const store = await prisma.organization.findUnique({
    where: { id: auth.user.organizationId },
    select: { name: true },
  });

  return Response.json({
    id: auth.user.id,
    name: auth.user.name,
    email: auth.user.email,
    role: auth.user.role,
    storeName: store?.name ?? null,
    permissions: permissionsFor(auth.user.role),
  });
}
