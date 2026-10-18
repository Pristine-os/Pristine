export const STORE_NAME_MAX_LENGTH = 100;

// Control characters (including newlines) have no place in a store name
// that's shown in the app and, later, on receipts.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function validateStoreName(
  value: unknown
): { name: string } | { error: string } {
  if (typeof value !== "string") {
    return { error: "Store name is required." };
  }

  const name = value.trim().replace(/\s+/g, " ");

  if (!name) {
    return { error: "Store name is required." };
  }

  if (name.length > STORE_NAME_MAX_LENGTH) {
    return {
      error: `Store name must be ${STORE_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (CONTROL_CHARACTERS.test(value.trim())) {
    return { error: "Store name can't contain line breaks or control characters." };
  }

  return { name };
}
