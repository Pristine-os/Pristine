import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Scan-to-find: resolves a scanned/typed invoice barcode (Order.orderNumber)
// to its order. Org-scoped exact match — an order number that exists but
// belongs to another organization returns the same 404 as one that doesn't
// exist at all, so cross-org data is never leaked through this endpoint.
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const code = (url.searchParams.get("code") || "").trim();

    if (!code) {
      return Response.json({ error: "A code is required." }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: {
        organizationId: session.user.organizationId,
        orderNumber: { equals: code, mode: "insensitive" },
      },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        garments: { select: { quantity: true } },
        rack: { select: { id: true, name: true, active: true } },
      },
    });

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    const physicalGarmentCount = order.garments.reduce(
      (sum, garment) => sum + garment.quantity,
      0
    );

    return Response.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customer: order.customer,
      physicalGarmentCount,
      rack: order.rack,
    });
  } catch (error) {
    console.error("ORDER LOOKUP ERROR:", error);

    return Response.json(
      {
        error: "Order lookup failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
