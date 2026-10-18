"use client";

import { useEffect, useState } from "react";
import type { Permission, Role } from "@/lib/permissions";

export type ClientUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  permissions: Permission[];
};

/*
 * Loads the signed-in user's role for hiding controls they can't use.
 * Cosmetic only — the server enforces every permission. While loading,
 * `can` returns false so restricted controls never flash on screen.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<ClientUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    user,
    can: (permission: Permission) =>
      user?.permissions.includes(permission) ?? false,
  };
}
