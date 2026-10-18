import { requireUser } from "@/lib/authz";
import { permissionsFor } from "@/lib/permissions";

// The signed-in user's role and permissions, for client pages that need
// to hide controls. Cosmetic only — every API route re-checks.
export async function GET() {
  const auth = await requireUser();

  if (auth.error) {
    return auth.error;
  }

  return Response.json({
    id: auth.user.id,
    name: auth.user.name,
    email: auth.user.email,
    role: auth.user.role,
    permissions: permissionsFor(auth.user.role),
  });
}
