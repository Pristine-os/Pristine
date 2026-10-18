import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  can,
  checkStaffChange,
  isForwardTransition,
  permissionsFor,
  type Permission,
  type Role,
} from "@/lib/permissions";

const EXPECTED: Record<Role, Permission[]> = {
  EMPLOYEE: [
    "orders.view",
    "orders.create",
    "orders.process",
    "customers.view",
    "customers.manage",
    "payments.record",
    "dashboard.operational",
  ],
  MANAGER: [
    "orders.view",
    "orders.create",
    "orders.process",
    "customers.view",
    "customers.manage",
    "payments.record",
    "dashboard.operational",
    "orders.overridePrice",
    "orders.correctStatus",
    "pricing.manage",
    "reports.financial",
    "settings.operational",
    "staff.view",
  ],
  OWNER: [...PERMISSIONS],
};

describe("role permission matrix", () => {
  for (const role of Object.keys(EXPECTED) as Role[]) {
    for (const permission of PERMISSIONS) {
      const allowed = EXPECTED[role].includes(permission);

      it(`${role} ${allowed ? "may" : "may not"} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowed);
      });
    }
  }

  it("only Owners can manage staff", () => {
    expect(can("OWNER", "staff.manage")).toBe(true);
    expect(can("MANAGER", "staff.manage")).toBe(false);
    expect(can("EMPLOYEE", "staff.manage")).toBe(false);
  });

  it("denies unknown or missing roles everything", () => {
    for (const role of [undefined, null, "", "ADMIN", "owner"]) {
      expect(permissionsFor(role)).toEqual([]);
      expect(can(role, "orders.view")).toBe(false);
    }
  });
});

describe("forward transitions", () => {
  it("allows only the everyday lifecycle", () => {
    expect(isForwardTransition("RECEIVED", "PROCESSING")).toBe(true);
    expect(isForwardTransition("PROCESSING", "READY")).toBe(true);
    expect(isForwardTransition("READY", "PICKED_UP")).toBe(true);
    expect(isForwardTransition("RECEIVED", "READY")).toBe(false);
    expect(isForwardTransition("READY", "PROCESSING")).toBe(false);
    expect(isForwardTransition("RECEIVED", "CANCELLED")).toBe(false);
    expect(isForwardTransition("PICKED_UP", "RECEIVED")).toBe(false);
  });
});

describe("staff change rules", () => {
  const base = {
    actorId: "owner-1",
    targetId: "user-2",
    targetRole: "EMPLOYEE" as Role,
    targetActive: true,
    activeOwnerCount: 1,
  };

  it("allows ordinary role changes", () => {
    expect(checkStaffChange({ ...base, nextRole: "MANAGER" })).toBeNull();
  });

  it("blocks changing your own role", () => {
    expect(
      checkStaffChange({ ...base, targetId: "owner-1", targetRole: "OWNER", nextRole: "MANAGER" })
    ).toMatch(/own role/);
  });

  it("blocks deactivating yourself", () => {
    expect(
      checkStaffChange({ ...base, targetId: "owner-1", targetRole: "OWNER", nextActive: false })
    ).toMatch(/own account/);
  });

  it("keeps at least one active Owner", () => {
    const other = { ...base, targetId: "owner-2", targetRole: "OWNER" as Role };
    expect(checkStaffChange({ ...other, nextRole: "EMPLOYEE" })).toMatch(/at least one/);
    expect(checkStaffChange({ ...other, nextActive: false })).toMatch(/at least one/);
    expect(checkStaffChange({ ...other, nextActive: false, activeOwnerCount: 2 })).toBeNull();
  });

  it("allows no-op updates and name-only changes", () => {
    expect(checkStaffChange({ ...base, targetRole: "OWNER", nextRole: "OWNER" })).toBeNull();
    expect(checkStaffChange(base)).toBeNull();
  });
});
