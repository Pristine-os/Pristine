import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { forbidden, requireUser } from "@/lib/authz";
import { checkStaffChange, type Role } from "@/lib/permissions";
import { parseRole, validatePassword } from "@/lib/staff";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

class StaffRuleError extends Error {}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireUser("staff.manage");

    if (auth.error) {
      return auth.error;
    }

    const { id } = await context.params;
    const body = await request.json();

    const data: {
      name?: string;
      role?: Role;
      active?: boolean;
      password?: string;
    } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return Response.json({ error: "Name is required." }, { status: 400 });
      }
      data.name = name;
    }

    if (body.role !== undefined) {
      const role = parseRole(body.role);
      if (!role) {
        return Response.json({ error: "Invalid role." }, { status: 400 });
      }
      data.role = role;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return Response.json({ error: "active must be true or false." }, { status: 400 });
      }
      data.active = body.active;
    }

    if (body.password !== undefined) {
      const passwordError = validatePassword(body.password);
      if (passwordError) {
        return Response.json({ error: passwordError }, { status: 400 });
      }
      data.password = await bcrypt.hash(body.password, 10);
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }

    // Serializable so two Owners can't demote each other at the same time
    // and leave the organization with none.
    const result = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findFirst({
          where: { id, organizationId: auth.user.organizationId },
          select: { id: true, role: true, active: true },
        });

        if (!target) return null;

        const activeOwnerCount = await tx.user.count({
          where: {
            organizationId: auth.user.organizationId,
            role: "OWNER",
            active: true,
          },
        });

        const ruleError = checkStaffChange({
          actorId: auth.user.id,
          targetId: target.id,
          targetRole: target.role,
          targetActive: target.active,
          nextRole: data.role,
          nextActive: data.active,
          activeOwnerCount,
        });

        if (ruleError) throw new StaffRuleError(ruleError);

        return tx.user.update({
          where: { id: target.id },
          data,
          select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (!result) {
      return Response.json({ error: "Staff member not found" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof StaffRuleError) {
      return forbidden(error.message);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return Response.json(
        { error: "Another change was made at the same time. Refresh and try again." },
        { status: 409 }
      );
    }

    console.error("UPDATE USER ERROR:", error);

    return Response.json({ error: "Failed to update staff account" }, { status: 500 });
  }
}
