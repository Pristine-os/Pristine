"use client";

import { signOut } from "next-auth/react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ROLE_LABELS, type Permission } from "@/lib/permissions";

const LINKS: { href: string; label: string; bold?: boolean; permission?: Permission }[] = [
  { href: "/counter", label: "Counter", bold: true },
  { href: "/pickup", label: "Pickup", bold: true },
  { href: "/production", label: "Production", bold: true },
  { href: "/rack-assignment", label: "Rack Assignment", bold: true },
  { href: "/racks", label: "Racks" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/orders", label: "Orders" },
  { href: "/garments", label: "Garments" },
  { href: "/payments", label: "Payments", permission: "reports.financial" },
  { href: "/staff", label: "Staff", permission: "staff.view" },
];

export default function SidebarNav() {
  const { user, can } = useCurrentUser();

  return (
    <nav
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {LINKS.filter((link) => !link.permission || can(link.permission)).map(
        (link) => (
          <a
            key={link.href}
            href={link.href}
            style={{
              color: "white",
              textDecoration: "none",
              fontWeight: link.bold ? "bold" : undefined,
            }}
          >
            {link.label}
          </a>
        )
      )}

      <div style={{ marginTop: "20px" }}>
        {user && (
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "8px" }}>
            {user.name || user.email} · {ROLE_LABELS[user.role]}
          </div>
        )}

        {/* A real sign-out, so a shared counter terminal doesn't keep the
            previous employee's session. */}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            color: "#f87171",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "inherit",
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
