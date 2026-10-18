import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { GARMENT_TYPES, SERVICES, getPriceCatalog } from "@/lib/pricing";

export async function GET() {
  try {
    const auth = await requireUser("orders.view");

    if (auth.error) {
      return auth.error;
    }

    const session = { user: auth.user };

    const prices = await getPriceCatalog(session.user.organizationId);

    return Response.json({
      garmentTypes: GARMENT_TYPES,
      services: SERVICES,
      prices,
    });
  } catch (error) {
    console.error("GET PRICING ERROR:", error);

    return Response.json(
      {
        error: "Failed to load pricing",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireUser("pricing.manage");

    if (auth.error) {
      return auth.error;
    }

    const session = { user: auth.user };

    const body = await request.json();

    const garmentType = String(body.garmentType || "").trim();
    const service = String(body.service || "").trim();
    const price = Number(body.price);

    if (!garmentType || !service) {
      return Response.json(
        { error: "Garment type and service are required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(price) || price < 0) {
      return Response.json(
        { error: "Price must be a non-negative number" },
        { status: 400 }
      );
    }

    const entry = await prisma.price.upsert({
      where: {
        organizationId_garmentType_service: {
          organizationId: session.user.organizationId,
          garmentType,
          service,
        },
      },
      create: {
        organizationId: session.user.organizationId,
        garmentType,
        service,
        price,
      },
      update: {
        price,
      },
    });

    return Response.json(entry);
  } catch (error) {
    console.error("UPDATE PRICING ERROR:", error);

    return Response.json(
      {
        error: "Failed to update pricing",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireUser("pricing.manage");

    if (auth.error) {
      return auth.error;
    }

    const session = { user: auth.user };

    const url = new URL(request.url);
    const garmentType = url.searchParams.get("garmentType") || "";
    const service = url.searchParams.get("service") || "";

    if (!garmentType || !service) {
      return Response.json(
        { error: "Garment type and service are required" },
        { status: 400 }
      );
    }

    await prisma.price
      .delete({
        where: {
          organizationId_garmentType_service: {
            organizationId: session.user.organizationId,
            garmentType,
            service,
          },
        },
      })
      .catch(() => null);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("DELETE PRICING ERROR:", error);

    return Response.json(
      {
        error: "Failed to reset price",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
