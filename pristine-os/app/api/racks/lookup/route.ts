import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Scan-to-find for racks. Org-scoped exact match on barcodeValue — a rack
// barcode from another organization behaves identically to a nonexistent
// one (404), never leaking cross-org existence. An inactive rack IS
// returned (with active:false) since it genuinely belongs to this org and
// the caller needs to know why it can't be used for a new assignment.
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

    const rack = await prisma.rack.findFirst({
      where: {
        organizationId: session.user.organizationId,
        barcodeValue: { equals: code, mode: "insensitive" },
      },
    });

    if (!rack) {
      return Response.json({ error: "Rack not found" }, { status: 404 });
    }

    return Response.json({
      id: rack.id,
      name: rack.name,
      barcodeValue: rack.barcodeValue,
      active: rack.active,
    });
  } catch (error) {
    console.error("RACK LOOKUP ERROR:", error);

    return Response.json(
      {
        error: "Rack lookup failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
