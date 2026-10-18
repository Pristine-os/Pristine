"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";

type StaffMember = {
  id: string;
  name: string | null;
  role: Role;
  active: boolean;
  email?: string;
  createdAt?: string;
};

export default function StaffPage() {
  const { user } = useCurrentUser();

  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("EMPLOYEE");
  const [creating, setCreating] = useState(false);

  async function loadStaff() {
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load staff");
      }

      setStaff(data.users);
      setCanManage(data.canManage === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStaff();
  }, []);

  async function updateStaff(id: string, changes: Record<string, unknown>) {
    try {
      setError("");
      setBusyId(id);

      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to update staff member");
      }

      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update staff member");
    } finally {
      setBusyId("");
    }
  }

  async function resetPassword(member: StaffMember) {
    const password = window.prompt(
      `New password for ${member.name || member.email} (at least 8 characters):`
    );

    if (password) {
      await updateStaff(member.id, { password });
    }
  }

  async function createStaff() {
    try {
      setError("");
      setCreating(true);

      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to add staff member");
      }

      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("EMPLOYEE");
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add staff member");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Staff</h1>
        <p className="text-gray-500 mt-1">
          {canManage
            ? "Add staff accounts, set roles, and deactivate accounts."
            : "Staff names, roles, and status. Only an Owner can make changes."}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {canManage && (
        <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold mb-4">Add Staff Member</h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="rounded-lg border px-3 py-2"
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="rounded-lg border px-3 py-2"
            />
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Temporary password"
              type="password"
              className="rounded-lg border px-3 py-2"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="rounded-lg border px-3 py-2 bg-white"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <button
              onClick={createStaff}
              disabled={creating}
              className="rounded-lg bg-black px-5 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {creating ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {staff === null ? (
          <div className="p-6 text-center text-gray-500">Loading staff...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Name</th>
                {canManage && <th className="text-left p-4">Email</th>}
                <th className="text-left p-4">Role</th>
                <th className="text-left p-4">Status</th>
                {canManage && <th className="text-right p-4">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {staff.map((member) => {
                const isSelf = member.id === user?.id;
                const busy = busyId === member.id;

                return (
                  <tr key={member.id} className="border-t">
                    <td className="p-4 font-medium">
                      {member.name || "—"}
                      {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                    </td>

                    {canManage && <td className="p-4 text-gray-600">{member.email}</td>}

                    <td className="p-4">
                      {canManage && !isSelf ? (
                        <select
                          value={member.role}
                          disabled={busy}
                          onChange={(e) => updateStaff(member.id, { role: e.target.value })}
                          className="rounded-lg border px-2 py-1 bg-white"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ROLE_LABELS[member.role]
                      )}
                    </td>

                    <td className="p-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          member.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {member.active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {canManage && (
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => resetPassword(member)}
                            disabled={busy}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          >
                            Reset Password
                          </button>

                          {!isSelf && (
                            <button
                              onClick={() => updateStaff(member.id, { active: !member.active })}
                              disabled={busy}
                              className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
                            >
                              {member.active ? "Deactivate" : "Activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
