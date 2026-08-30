import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncGarmentTags } from "@/lib/garmentTags";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function isGarmentTagUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  // Under Prisma 7's driver-adapter engine, a P2002's `meta` carries
  // `modelName` directly rather than a `target` column-name array —
  // that's the reliable signal here. The `target` checks are kept as a
  // portable fallback for other engine/connector combinations, but
  // `modelName` is checked first since it's the actual shape observed
  // (verified against a live P2002 during concurrency testing).
  if (error.meta?.modelName === "GarmentTag") {
    return true;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes("garmentId") || target.includes("tagNumber");
  }

  if (typeof target === "string") {
    return target.includes("GarmentTag");
  }

  return false;
}

async function loadOrderWithTags(orderId: string, organizationId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: {
      customer: true,
      garments: {
        orderBy: { createdAt: "asc" },
        include: {
          tags: { orderBy: { sequence: "asc" } },
        },
      },
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    if (!id || id === "undefined") {
      return Response.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    const organizationId = session.user.organizationId;

    let order = await loadOrderWithTags(id, organizationId);

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    const needsBackfill = order.garments.some(
      (garment) => garment.tags.length < garment.quantity
    );

    if (needsBackfill) {
      try {
        await prisma.$transaction(async (tx) => {
          // Re-read inside the transaction for a consistent snapshot —
          // this only ever fills gaps up to `quantity`, so a repeat
          // call once the gap is closed performs zero writes.
          const freshGarments = await tx.garment.findMany({
            where: { orderId: id },
            include: { tags: true },
          });

          for (const garment of freshGarments) {
            if (garment.tags.length < garment.quantity) {
              await syncGarmentTags(tx, {
                orderId: id,
                orderNumber: order!.orderNumber,
                garmentId: garment.id,
                quantity: garment.quantity,
                currentTags: garment.tags,
              });
            }
          }
        });
      } catch (error) {
        // Only a GarmentTag uniqueness collision is treated as "a
        // concurrent request already generated these tags" — anything
        // else (including an unrelated P2002) is a real failure and
        // must not be silently swallowed.
        if (!isGarmentTagUniqueViolation(error)) {
          throw error;
        }
      }

      order = await loadOrderWithTags(id, organizationId);

      if (!order) {
        return Response.json({ error: "Order not found" }, { status: 404 });
      }

      const stillIncomplete = order.garments.some(
        (garment) => garment.tags.length !== garment.quantity
      );

      if (stillIncomplete) {
        return Response.json(
          {
            error:
              "Garment tags could not be reliably generated for this order.",
            details:
              "A concurrent request's tags were detected, but the resulting tag counts still don't match every garment's quantity. This needs investigation rather than a silent retry.",
          },
          { status: 500 }
        );
      }
    }

    const allTags = order.garments
      .flatMap((garment) =>
        garment.tags.map((tag) => ({ tag, garment }))
      )
      // Order matches allocation order: garments in creation order,
      // then each garment's own tags by line-sequence.
      .map((entry, index, all) => ({
        id: entry.tag.id,
        tagNumber: entry.tag.tagNumber,
        sequence: entry.tag.sequence,
        position: index + 1,
        totalTags: all.length,
        eligible: order!.tagPrintingEnabled && entry.garment.printTag,
        garment: {
          id: entry.garment.id,
          name: entry.garment.name,
          service: entry.garment.service,
          prepayDiscount: entry.garment.prepayDiscount,
          printTag: entry.garment.printTag,
        },
      }));

    return Response.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        tagPrintingEnabled: order.tagPrintingEnabled,
        customer: {
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
        },
      },
      totalTags: allTags.length,
      tags: allTags,
    });
  } catch (error) {
    console.error("GET GARMENT TAGS ERROR:", error);

    return Response.json(
      {
        error: "Failed to load garment tags",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
