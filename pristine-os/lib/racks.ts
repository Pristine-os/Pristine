const MAX_INPUT_LENGTH = 40;

export type NormalizedRack = { name: string; barcodeValue: string };
export type NormalizeResult = NormalizedRack | { error: string };

// Deterministic, non-clever normalization so "24", "Rack 24", "rack 24" and
// "RACK 24" all collapse to the same identity (name "Rack 24", barcode
// "RACK-024") instead of silently becoming separate physical racks.
export function normalizeRackInput(raw: string): NormalizeResult {
  const trimmed = (raw || "").trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return { error: "Rack name is required." };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      error: `Rack name must be ${MAX_INPUT_LENGTH} characters or fewer.`,
    };
  }

  // Strip a leading "rack" / "rack #" label if present, so "Rack 24" and
  // "24" are recognized as the same identity.
  const withoutLabel = trimmed.replace(/^rack\s*#?\s*/i, "").trim();

  if (!withoutLabel) {
    return { error: "Rack name must contain more than just the word \"Rack\"." };
  }

  if (/^\d+$/.test(withoutLabel)) {
    const number = parseInt(withoutLabel, 10);
    return {
      name: `Rack ${number}`,
      barcodeValue: `RACK-${String(number).padStart(3, "0")}`,
    };
  }

  const slug = withoutLabel
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return {
      error: "Rack name must contain at least one letter or number.",
    };
  }

  return {
    name: withoutLabel,
    barcodeValue: `RACK-${slug}`.slice(0, MAX_INPUT_LENGTH),
  };
}

export function validateRackName(raw: string): { name: string } | { error: string } {
  const trimmed = (raw || "").trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return { error: "Rack name is required." };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      error: `Rack name must be ${MAX_INPUT_LENGTH} characters or fewer.`,
    };
  }

  return { name: trimmed };
}
