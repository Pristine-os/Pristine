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
