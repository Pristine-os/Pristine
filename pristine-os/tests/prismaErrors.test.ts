import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/lib/prismaErrors";

describe("isUniqueViolation", () => {
  it("matches Prisma's unique-constraint error code only", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("dup"), { code: "P2002" }))).toBe(true);
    for (const value of [{ code: "P2025" }, new Error("x"), null, undefined, "P2002", 42]) {
      expect(isUniqueViolation(value)).toBe(false);
    }
  });
});
