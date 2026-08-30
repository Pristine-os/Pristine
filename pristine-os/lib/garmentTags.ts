import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export function formatTagNumber(
  orderNumber: string,
  orderWideNumber: number
): string {
  return `${orderNumber}-${String(orderWideNumber).padStart(3, "0")}`;
}

/*
 * Allocates `count` sequential, never-reused order-wide tag numbers.
 *
 * Order.nextTagNumber is a monotonically increasing counter — it only
 * ever moves forward. The increment itself compiles to a single atomic
 * `UPDATE ... SET nextTagNumber = nextTagNumber + count RETURNING
 * nextTagNumber`, so Postgres row-level locking serializes concurrent
 * callers on the same order; there is no read-then-write gap for two
 * requests to race through. Numbers are retired forever once a tag
 * using them is deleted — persistent identity is prioritized over
 * gapless-looking numbering.
 */
export async function allocateTagNumbers(
  tx: TxClient,
  orderId: string,
  orderNumber: string,
  count: number
): Promise<string[]> {
  if (count <= 0) return [];

  const updated = await tx.order.update({
    where: { id: orderId },
    data: { nextTagNumber: { increment: count } },
  });

  const start = updated.nextTagNumber - count;

  return Array.from({ length: count }, (_, i) =>
    formatTagNumber(orderNumber, start + i)
  );
}

type ExistingTag = { id: string; sequence: number };

/*
 * Brings one garment's GarmentTag rows in line with its current
 * quantity. GarmentTag.sequence is the position *within this garment
 * line only* — completely independent of the globally unique,
 * order-wide `tagNumber`. Retained tags never change identity:
 *   - increase: append new tags at sequence (currentCount+1..quantity)
 *   - decrease: drop the *highest* sequence numbers down to quantity,
 *     keeping the lowest (already-issued) ones untouched
 *   - equal: no-op
 */
export async function syncGarmentTags(
  tx: TxClient,
  params: {
    orderId: string;
    orderNumber: string;
    garmentId: string;
    quantity: number;
    currentTags: ExistingTag[];
  }
): Promise<void> {
  const { orderId, orderNumber, garmentId, quantity, currentTags } = params;
  const currentCount = currentTags.length;

  if (quantity > currentCount) {
    const needed = quantity - currentCount;
    const tagNumbers = await allocateTagNumbers(
      tx,
      orderId,
      orderNumber,
      needed
    );

    await tx.garmentTag.createMany({
      data: tagNumbers.map((tagNumber, i) => ({
        garmentId,
        tagNumber,
        sequence: currentCount + i + 1,
      })),
    });
  } else if (quantity < currentCount) {
    const excess = currentTags
      .slice()
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, currentCount - quantity)
      .map((tag) => tag.id);

    await tx.garmentTag.deleteMany({ where: { id: { in: excess } } });
  }
}
