import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { escapeLikePattern } from "@/lib/likePattern";

// Scan-to-find for racks. Org-scoped exact match on barcodeValue — a rack
// barcode from another organization behaves identically to a nonexistent
// one (404), never leaking cross-org existence. An inactive rack IS
// returned (with active:false) since it genuinely belongs to this org and
// the caller needs to know why it can't be used for a new assignment.
export async function GET(request: Request) {
  try {
    const auth = await requireUser("orders.view");

    if (auth.error) {
      return auth.error;
    }

    const session = { user: auth.user };

    const url = new URL(request.url);
    const code = (url.searchParams.get("code") || "").trim();

    if (!code) {
      return Response.json({ error: "A code is required." }, { status: 400 });
    }

    const rack = await prisma.rack.findFirst({
      where: {
        organizationId: session.user.organizationId,
        // Exact, case-insensitive match: wildcards in the code are literal.
        barcodeValue: { equals: escapeLikePattern(code), mode: "insensitive" },
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
