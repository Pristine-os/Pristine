import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeRackInput } from "@/lib/racks";

// Occupancy is derived live from Order.rackId (no redundant counter) —
// PICKED_UP clears rackId, so a plain count of connected orders already
// means "currently housed here" with no status filtering required.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const racks = await prisma.rack.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { orders: true } } },
    });

    return Response.json({
      racks: racks.map((rack) => ({
        id: rack.id,
        name: rack.name,
        barcodeValue: rack.barcodeValue,
        active: rack.active,
        orderCount: rack._count.orders,
        createdAt: rack.createdAt,
      })),
    });
  } catch (error) {
    console.error("GET RACKS ERROR:", error);

    return Response.json(
      {
        error: "Failed to load racks",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = session.user.organizationId;
    const body = await request.json();

    if (typeof body.name !== "string") {
      return Response.json({ error: "Rack name is required." }, { status: 400 });
    }

    const normalized = normalizeRackInput(body.name);

    if ("error" in normalized) {
      return Response.json({ error: normalized.error }, { status: 400 });
    }

    const existing = await prisma.rack.findFirst({
      where: {
        organizationId,
        OR: [
          { name: normalized.name },
          { barcodeValue: normalized.barcodeValue },
        ],
      },
    });

    if (existing) {
      return Response.json(
        {
          error: `A rack equivalent to "${normalized.name}" (${normalized.barcodeValue}) already exists.`,
        },
        { status: 409 }
      );
    }

    const rack = await prisma.rack.create({
      data: {
        organizationId,
        name: normalized.name,
        barcodeValue: normalized.barcodeValue,
      },
    });

    return Response.json(rack, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return Response.json(
        { error: "A rack with this name or number already exists." },
        { status: 409 }
      );
    }

    console.error("CREATE RACK ERROR:", error);

    return Response.json(
      {
        error: "Failed to create rack",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
