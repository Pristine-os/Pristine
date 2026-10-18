import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { findUserIdsByEmail, normalizeEmail, parseRole, validatePassword } from "@/lib/staff";

// Managers see names, roles and active status only; Owners also see
// contact details. Password hashes are never selected.
export async function GET() {
  try {
    const auth = await requireUser("staff.view");

    if (auth.error) {
      return auth.error;
    }

    const isOwner = can(auth.user.role, "staff.manage");

    const users = await prisma.user.findMany({
      where: { organizationId: auth.user.organizationId },
      select: {
        id: true,
        name: true,
        role: true,
        active: true,
        ...(isOwner ? { email: true, createdAt: true } : {}),
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    return Response.json({ users, canManage: isOwner });
  } catch (error) {
    console.error("GET USERS ERROR:", error);

    return Response.json({ error: "Failed to load staff" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser("staff.manage");

    if (auth.error) {
      return auth.error;
    }

    const body = await request.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = normalizeEmail(body.email);
    const role = parseRole(body.role ?? "EMPLOYEE");
    const passwordError = validatePassword(body.password);

    if (!name) {
      return Response.json({ error: "Name is required." }, { status: 400 });
    }

    if (!email) {
      return Response.json({ error: "A valid email is required." }, { status: 400 });
    }

    if (!role) {
      return Response.json({ error: "Invalid role." }, { status: 400 });
    }

    if (passwordError) {
      return Response.json({ error: passwordError }, { status: 400 });
    }

    // The unique index is case-sensitive; also block a case-only variant
    // of an existing (legacy, mixed-case) email so logins stay unambiguous.
    if ((await findUserIdsByEmail(email, 1)).length > 0) {
      return Response.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const password = await bcrypt.hash(body.password, 10);

    try {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password,
          role,
          organizationId: auth.user.organizationId,
        },
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      });

      return Response.json(user, { status: 201 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return Response.json(
          { error: "An account with that email already exists." },
          { status: 409 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("CREATE USER ERROR:", error);

    return Response.json({ error: "Failed to create staff account" }, { status: 500 });
  }
}
