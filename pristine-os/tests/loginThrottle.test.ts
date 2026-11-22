import { describe, expect, it } from "vitest";
import { clientIp, delayAfter, throttleKeys } from "@/lib/loginThrottle";

describe("login throttle rules", () => {
  it("adds no delay below each threshold", () => {
    expect(delayAfter("accountIp", 4)).toBe(0);
    expect(delayAfter("ip", 19)).toBe(0);
    expect(delayAfter("account", 9)).toBe(0);
  });

  it("doubles the delay from the threshold up to each cap", () => {
    expect([5, 6, 7, 8, 9, 10, 11].map((n) => delayAfter("accountIp", n) / 1000)).toEqual([
      30, 60, 120, 240, 480, 900, 900,
    ]);
    expect([10, 11, 12, 13, 14, 50].map((n) => delayAfter("account", n) / 1000)).toEqual([
      5, 10, 20, 40, 60, 60,
    ]);
    expect(delayAfter("ip", 1000)).toBe(15 * 60_000);
  });

  it("never stores the email or IP, and keys differ by scope", () => {
    const keys = throttleKeys("owner@pristine.com", "203.0.113.7");
    expect(keys.map((key) => key.scope).sort()).toEqual(["account", "accountIp", "ip"]);
    for (const key of keys) {
      expect(key.hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(keys.map((key) => key.hash)).size).toBe(3);
  });

  it("uses only the account-wide key when the IP is unknown", () => {
    expect(throttleKeys("owner@pristine.com", null).map((key) => key.scope)).toEqual(["account"]);
  });
});

describe("client IP", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIp({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })).toBe("203.0.113.7");
    expect(clientIp({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })).toBe("198.51.100.1");
    expect(clientIp({ "x-forwarded-for": "2001:DB8::1" })).toBe("2001:db8::1");
  });

  it("treats missing or invalid values as unknown", () => {
    expect(clientIp(undefined)).toBeNull();
    expect(clientIp({})).toBeNull();
    expect(clientIp({ "x-forwarded-for": "not-an-ip" })).toBeNull();
    expect(clientIp({ "x-real-ip": "' OR 1=1 --" })).toBeNull();
  });
});
