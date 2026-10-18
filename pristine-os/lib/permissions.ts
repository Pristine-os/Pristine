/*
 * Role-based permissions.
 *
 * Pure data + helpers, no I/O — this is the single source of truth for
 * what each role may do. Server routes enforce it through lib/authz.ts;
 * the UI reads it only to hide controls a user can't use (cosmetic — the
 * server always re-checks).
 *
 * Anything not listed for a role is denied.
 */

export const ROLES = ["OWNER", "MANAGER", "EMPLOYEE"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // Day-to-day counter and production work.
  "orders.view",
  "orders.create",
  "orders.process", // production/pickup transitions, rack assignment, tags, ready notices
  "customers.view",
  "customers.manage",
  "payments.record",
  "dashboard.operational",

  // Money and catalog.
  "orders.overridePrice", // any price that differs from the catalog
  "orders.correctStatus", // free-form status changes, including CANCELLED
  "pricing.manage",
  "reports.financial",

  // Approved operational store settings (currently: racks).
  "settings.operational",

  // Staff.
  "staff.view",
  "staff.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const EMPLOYEE_PERMISSIONS: Permission[] = [
  "orders.view",
  "orders.create",
  "orders.process",
  "customers.view",
  "customers.manage",
  "payments.record",
  "dashboard.operational",
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...EMPLOYEE_PERMISSIONS,
  "orders.overridePrice",
  "orders.correctStatus",
  "pricing.manage",
  "reports.financial",
  "settings.operational",
  "staff.view",
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(PERMISSIONS),
  MANAGER: new Set(MANAGER_PERMISSIONS),
  EMPLOYEE: new Set(EMPLOYEE_PERMISSIONS),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: unknown, permission: Permission): boolean {
  if (!isRole(role)) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: unknown): Permission[] {
  if (!isRole(role)) return [];
  return PERMISSIONS.filter((permission) => ROLE_PERMISSIONS[role].has(permission));
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

/*
 * Staff-management invariants, kept pure so they can be unit tested.
 * Returns an error message, or null when the change is allowed.
 */
export function checkStaffChange(input: {
  actorId: string;
  targetId: string;
  targetRole: Role;
  targetActive: boolean;
  nextRole?: Role;
  nextActive?: boolean;
  activeOwnerCount: number;
}): string | null {
  const isSelf = input.actorId === input.targetId;
  const roleChanging =
    input.nextRole !== undefined && input.nextRole !== input.targetRole;
  const deactivating =
    input.nextActive === false && input.targetActive;

  if (isSelf && roleChanging) {
    return "You can't change your own role.";
  }

  if (isSelf && deactivating) {
    return "You can't deactivate your own account.";
  }

  const losesOwner =
    input.targetRole === "OWNER" &&
    input.targetActive &&
    (deactivating || roleChanging);

  if (losesOwner && input.activeOwnerCount <= 1) {
    return "The organization must keep at least one active Owner.";
  }

  return null;
}

// The everyday order lifecycle: RECEIVED → PROCESSING → READY → PICKED_UP.
const FORWARD_TRANSITIONS: Record<string, string> = {
  RECEIVED: "PROCESSING",
  PROCESSING: "READY",
  READY: "PICKED_UP",
};

export function isForwardTransition(from: string, to: unknown): boolean {
  return FORWARD_TRANSITIONS[from] === to;
}

// Prices are compared at cent precision.
export function pricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}
