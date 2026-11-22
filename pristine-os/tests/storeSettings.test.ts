import { describe, expect, it } from "vitest";
import { STORE_NAME_MAX_LENGTH, validateStoreName } from "@/lib/storeSettings";

describe("store name validation", () => {
  it("trims and collapses whitespace", () => {
    expect(validateStoreName("  Pristine   Cleaners  ")).toEqual({ name: "Pristine Cleaners" });
  });

  it("rejects blanks and non-strings", () => {
    for (const value of ["", "   ", undefined, null, 42, {}]) {
      expect(validateStoreName(value)).toHaveProperty("error");
    }
  });

  it("rejects names that are too long", () => {
    expect(validateStoreName("x".repeat(STORE_NAME_MAX_LENGTH))).toHaveProperty("name");
    expect(validateStoreName("x".repeat(STORE_NAME_MAX_LENGTH + 1))).toHaveProperty("error");
  });

  it("rejects line breaks and control characters", () => {
    expect(validateStoreName("Pristine\nCleaners")).toHaveProperty("error");
    expect(validateStoreName("Pristine\u0007")).toHaveProperty("error");
  });
});

import { STORE_DEFAULTS, customerFacingName, validateStoreSettingsUpdate } from "@/lib/storeSettings";
import { buildReadyMessage } from "@/lib/notifications/service";

describe("store profile validation", () => {
  function ok(body: unknown) {
    const result = validateStoreSettingsUpdate(body);
    if ("error" in result) throw new Error(result.error);
    return result.data;
  }
  function err(body: unknown) {
    const result = validateStoreSettingsUpdate(body);
    expect(result).toHaveProperty("error");
  }

  it("normalizes single-line and multi-line text", () => {
    expect(ok({ displayName: "  Main   Street  Cleaners " })).toEqual({ displayName: "Main Street Cleaners" });
    expect(ok({ businessHours: " Mon–Fri 7–7 \r\n\r\n\r\n Sat 9–5 " })).toEqual({ businessHours: "Mon–Fri 7–7\n\nSat 9–5" });
  });

  it("treats blank and null as clearing a field", () => {
    expect(ok({ tagline: "   ", phone: null })).toEqual({ tagline: null, phone: null });
  });

  it("validates email and phone formats", () => {
    expect(ok({ email: " Hello@Store.COM " })).toEqual({ email: "hello@store.com" });
    err({ email: "not-an-email" });
    expect(ok({ phone: "+1 (555) 010-0000 ext 12" })).toEqual({ phone: "+1 (555) 010-0000 ext 12" });
    err({ phone: "call us" });
  });

  it("enforces lengths, types and control characters", () => {
    err({ city: "x".repeat(81) });
    err({ displayName: 42 });
    err({ displayName: "Two\nLines" });
    err({ receiptFooter: "bell\u0007" });
    err({ readyNotificationsEnabled: "yes" });
    expect(ok({ readyNotificationsEnabled: false })).toEqual({ readyNotificationsEnabled: false });
  });

  it("ignores unknown fields and rejects empty updates", () => {
    expect(ok({ organizationId: "other", id: "x", tagline: "Hi" })).toEqual({ tagline: "Hi" });
    err({ organizationId: "other" });
    err(null);
    err([]);
  });

  it("falls back to the original customer-facing text", () => {
    expect(customerFacingName(null)).toBe("Pristine Cleaners");
    expect(customerFacingName({ displayName: null })).toBe(STORE_DEFAULTS.displayName);
    expect(customerFacingName({ displayName: "Main Street Cleaners" })).toBe("Main Street Cleaners");
    expect(buildReadyMessage("PR-1", "Ada", customerFacingName(null))).toBe(
      "Hi Ada, your order PR-1 is ready for pickup at Pristine Cleaners."
    );
  });
});
