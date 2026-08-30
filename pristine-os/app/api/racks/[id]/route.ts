import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateRackName } from "@/lib/racks";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const rack = await prisma.rack.findFirst({
      where: { id, organizationId: session.user.organizationId },
      include: {
        orders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customer: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!rack) {
      return Response.json({ error: "Rack not found" }, { status: 404 });
    }

    return Response.json(rack);
  } catch (error) {
    console.error("GET RACK ERROR:", error);

    return Response.json(
      {
        error: "Failed to load rack",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Rename and/or activate/deactivate only — no delete endpoint. Renaming
// never touches barcodeValue, so a previously printed label stays valid.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = session.user.organizationId;
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.rack.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return Response.json({ error: "Rack not found" }, { status: 404 });
    }

    const data: { name?: string; active?: boolean } = {};

    if (body.name !== undefined) {
      const validated = validateRackName(body.name);

      if ("error" in validated) {
        return Response.json({ error: validated.error }, { status: 400 });
      }

      const nameCollision = await prisma.rack.findFirst({
        where: {
          organizationId,
          name: validated.name,
          NOT: { id },
        },
      });

      if (nameCollision) {
        return Response.json(
          { error: `Another rack is already named "${validated.name}".` },
          { status: 409 }
        );
      }

      data.name = validated.name;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return Response.json(
          { error: "active must be true or false." },
          { status: 400 }
        );
      }

      data.active = body.active;
    }

    if (Object.keys(data).length === 0) {
      return Response.json(
        { error: "Nothing to update." },
        { status: 400 }
      );
    }

    const rack = await prisma.rack.update({ where: { id }, data });

    return Response.json(rack);
  } catch (error: any) {
    if (error?.code === "P2002") {
      return Response.json(
        { error: "Another rack already uses this name." },
        { status: 409 }
      );
    }

    console.error("UPDATE RACK ERROR:", error);

    return Response.json(
      {
        error: "Failed to update rack",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
