export type GarmentLine = {
  id?: string;
  name: string;
  service: string;
  quantity: number;
  price: number;
  prepayDiscount: boolean;
  printTag: boolean;
};

export type PriceEntry = {
  garmentType: string;
  service: string;
  price: number;
};

export type PricingCatalog = {
  garmentTypes: string[];
  services: string[];
  prices: PriceEntry[];
};

export function lookupCatalogPrice(
  catalog: PricingCatalog | null,
  garmentType: string,
  service: string
): number {
  const match = catalog?.prices.find(
    (entry) => entry.garmentType === garmentType && entry.service === service
  );

  return match ? match.price : 0;
}

export function blankGarmentLine(catalog: PricingCatalog | null): GarmentLine {
  const name = catalog?.garmentTypes[0] || "";
  const service = catalog?.services[0] || "";

  return {
    name,
    service,
    quantity: 1,
    price: lookupCatalogPrice(catalog, name, service),
    prepayDiscount: false,
    printTag: true,
  };
}

export function calculateGarmentLinesTotal(lines: GarmentLine[]): number {
  return lines.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.price),
    0
  );
}
