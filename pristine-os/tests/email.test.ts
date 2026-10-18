import { describe, expect, it } from "vitest";
import { canonicalEmail, normalizeEmail } from "@/lib/staff";

describe("email normalization", () => {
  it("trims and lower-cases", () => {
    expect(canonicalEmail("  Owner@Pristine.COM \t")).toBe("owner@pristine.com");
    expect(normalizeEmail(" New.Hire@Test.com ")).toBe("new.hire@test.com");
  });

  it("returns empty / null for non-strings and blanks", () => {
    expect(canonicalEmail(undefined)).toBe("");
    expect(canonicalEmail(42)).toBe("");
    expect(canonicalEmail("   ")).toBe("");
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
  });
});
