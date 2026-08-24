import { prisma } from "@/lib/prisma";

/*
 * Central pricing configuration.
 *
 * Garment types and services offered, plus the default
 * price for each combination. These defaults seed new
 * organizations and act as a fallback for any combination
 * that hasn't been explicitly priced in the database yet.
 * Actual prices served to the app always come from
 * `getPriceCatalog`, which layers per-organization
 * database overrides on top of these defaults — nothing
 * in the UI should hard-code a dollar amount.
 */

export const GARMENT_TYPES = [
  "Shirt",
  "Pants",
  "Dress",
  "Suit",
  "Jacket",
  "Skirt",
  "Coat",
  "Blouse",
  "Sweater",
  "Comforter",
] as const;

export const SERVICES = [
  "Dry Clean",
  "Shirt Laundry",
  "Wash & Fold",
  "Press Only",
  "Alterations",
  "Leather",
  "Household",
] as const;

// Fallback price for a service when no garment-specific
// default is defined below.
const SERVICE_FALLBACK_PRICE: Record<string, number> = {
  "Dry Clean": 8,
  "Shirt Laundry": 4,
  "Wash & Fold": 3,
  "Press Only": 5,
  Alterations: 15,
  Leather: 30,
  Household: 20,
};

export const DEFAULT_PRICES: Record<string, Record<string, number>> = {
  Shirt: { "Dry Clean": 6, "Shirt Laundry": 4, "Press Only": 3.5, Alterations: 12 },
  Pants: { "Dry Clean": 8, "Press Only": 5, Alterations: 15 },
  Dress: { "Dry Clean": 14, "Press Only": 8, Alterations: 20 },
  Suit: { "Dry Clean": 18, "Press Only": 10, Alterations: 25 },
  Jacket: { "Dry Clean": 12, "Press Only": 7, Alterations: 18 },
  Skirt: { "Dry Clean": 8, "Press Only": 5, Alterations: 14 },
  Coat: { "Dry Clean": 16, "Press Only": 9, Leather: 40 },
  Blouse: { "Dry Clean": 7, "Press Only": 4, Alterations: 12 },
  Sweater: { "Dry Clean": 9, "Wash & Fold": 5 },
  Comforter: { "Dry Clean": 25, "Wash & Fold": 20 },
};

export function getDefaultPrice(garmentType: string, service: string): number {
  return (
    DEFAULT_PRICES[garmentType]?.[service] ??
    SERVICE_FALLBACK_PRICE[service] ??
    0
  );
}

export type PriceEntry = {
  garmentType: string;
  service: string;
  price: number;
  isCustom: boolean;
};

/*
 * Merges the default price matrix with any organization-specific
 * overrides stored in the database. Combos that only exist as a
 * database override (a custom garment/service pairing an org added)
 * are included too.
 */
export async function getPriceCatalog(
  organizationId: string
): Promise<PriceEntry[]> {
  const overrides = await prisma.price.findMany({
    where: { organizationId },
  });

  const overrideMap = new Map(
    overrides.map((entry) => [`${entry.garmentType}::${entry.service}`, entry.price])
  );

  const entries: PriceEntry[] = [];
  const seen = new Set<string>();

  for (const garmentType of Object.keys(DEFAULT_PRICES)) {
    for (const service of Object.keys(DEFAULT_PRICES[garmentType])) {
      const key = `${garmentType}::${service}`;
      seen.add(key);

      entries.push({
        garmentType,
        service,
        price: overrideMap.get(key) ?? DEFAULT_PRICES[garmentType][service],
        isCustom: overrideMap.has(key),
      });
    }
  }

  for (const entry of overrides) {
    const key = `${entry.garmentType}::${entry.service}`;

    if (!seen.has(key)) {
      entries.push({
        garmentType: entry.garmentType,
        service: entry.service,
        price: entry.price,
        isCustom: true,
      });
    }
  }

  return entries;
}

export async function resolvePrice(
  organizationId: string,
  garmentType: string,
  service: string
): Promise<number> {
  const override = await prisma.price.findUnique({
    where: {
      organizationId_garmentType_service: {
        organizationId,
        garmentType,
        service,
      },
    },
  });

  return override?.price ?? getDefaultPrice(garmentType, service);
}
