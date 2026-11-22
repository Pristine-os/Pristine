export const STORE_NAME_MAX_LENGTH = 100;

// Control characters (including newlines) have no place in a store name
// that's shown in the app and, later, on receipts.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

// Multi-line fields may contain line breaks but no other control characters.
const CONTROL_CHARACTERS_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-.\s]*(?:\s*(?:x|ext\.?)\s*[0-9]+)?$/i;

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

/*
 * Customer-facing store profile. All optional: an empty value is stored as
 * NULL, and NULL falls back to the original built-in text (STORE_DEFAULTS),
 * so receipts and notifications don't change until an Owner sets them.
 */
type ProfileField = {
  label: string;
  max: number;
  multiline?: boolean;
  format?: "email" | "phone";
};

export const STORE_PROFILE_FIELDS = {
  displayName: { label: "Name on receipts and messages", max: 100 },
  tagline: { label: "Receipt tagline", max: 120 },
  phone: { label: "Phone", max: 30, format: "phone" },
  email: { label: "Email", max: 254, format: "email" },
  addressLine1: { label: "Address line 1", max: 120 },
  addressLine2: { label: "Address line 2", max: 120 },
  city: { label: "City", max: 80 },
  region: { label: "State / region", max: 80 },
  postalCode: { label: "Postal code", max: 20 },
  businessHours: { label: "Business hours", max: 500, multiline: true },
  receiptFooter: { label: "Receipt footer", max: 300, multiline: true },
} satisfies Record<string, ProfileField>;

export type StoreProfileField = keyof typeof STORE_PROFILE_FIELDS;

export const STORE_PROFILE_FIELD_NAMES = Object.keys(
  STORE_PROFILE_FIELDS
) as StoreProfileField[];

export type StoreProfile = Record<StoreProfileField, string | null>;

// The text receipts and notifications used before Store Settings existed.
export const STORE_DEFAULTS = {
  displayName: "Pristine Cleaners",
  tagline: "Professional Garment Care",
  receiptFooter: "Please present this ticket when picking up your order.",
} as const;

export type StoreSettingsUpdate = Partial<StoreProfile> & {
  name?: string;
  readyNotificationsEnabled?: boolean;
};

function validateProfileField(
  field: StoreProfileField,
  value: unknown
): { value: string | null } | { error: string } {
  const spec: ProfileField = STORE_PROFILE_FIELDS[field];

  if (value === null) return { value: null };

  if (typeof value !== "string") {
    return { error: `${spec.label} must be text.` };
  }

  let text: string;

  if (spec.multiline) {
    text = value
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (CONTROL_CHARACTERS_EXCEPT_NEWLINE.test(text)) {
      return { error: `${spec.label} can't contain control characters.` };
    }
  } else {
    if (CONTROL_CHARACTERS.test(value.trim())) {
      return { error: `${spec.label} can't contain line breaks or control characters.` };
    }
    text = value.trim().replace(/\s+/g, " ");
  }

  if (!text) return { value: null };

  if (text.length > spec.max) {
    return { error: `${spec.label} must be ${spec.max} characters or fewer.` };
  }

  if (spec.format === "email") {
    text = text.toLowerCase();
    if (!EMAIL_PATTERN.test(text)) {
      return { error: `${spec.label} must be a valid email address.` };
    }
  }

  if (spec.format === "phone" && !PHONE_PATTERN.test(text)) {
    return {
      error: `${spec.label} may only contain digits, spaces, + ( ) - . and an extension.`,
    };
  }

  return { value: text };
}

/*
 * Validates a partial Store Settings update. Only known fields are read;
 * anything else in the body (including organizationId) is ignored.
 */
export function validateStoreSettingsUpdate(
  body: unknown
): { data: StoreSettingsUpdate } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request body." };
  }

  const input = body as Record<string, unknown>;
  const data: StoreSettingsUpdate = {};

  if (input.name !== undefined) {
    const result = validateStoreName(input.name);
    if ("error" in result) return result;
    data.name = result.name;
  }

  for (const field of STORE_PROFILE_FIELD_NAMES) {
    if (input[field] === undefined) continue;
    const result = validateProfileField(field, input[field]);
    if ("error" in result) return result;
    data[field] = result.value;
  }

  if (input.readyNotificationsEnabled !== undefined) {
    if (typeof input.readyNotificationsEnabled !== "boolean") {
      return { error: "Ready notifications setting must be true or false." };
    }
    data.readyNotificationsEnabled = input.readyNotificationsEnabled;
  }

  if (Object.keys(data).length === 0) {
    return { error: "Nothing to update." };
  }

  return { data };
}

export function customerFacingName(store: { displayName: string | null } | null | undefined) {
  return store?.displayName || STORE_DEFAULTS.displayName;
}
