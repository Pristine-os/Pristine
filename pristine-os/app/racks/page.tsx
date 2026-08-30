"use client";

import { useEffect, useRef, useState } from "react";

type Rack = {
  id: string;
  name: string;
  barcodeValue: string;
  active: boolean;
  orderCount: number;
};

type RackOrder = {
  id: string;
  orderNumber: string;
  status: string;
  customer: { firstName: string; lastName: string };
};

export default function RacksPage() {
  const [racks, setRacks] = useState<Rack[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const creatingRef = useRef(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const inFlightRef = useRef<Record<string, boolean>>({});
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<RackOrder[] | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  async function loadRacks() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/racks", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load racks");
      }

      setRacks(data.racks);
    } catch (err) {
      console.error("Load racks error:", err);
      setError(err instanceof Error ? err.message : "Failed to load racks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRacks();
  }, []);

  async function createRack() {
    if (creatingRef.current) return;

    if (!newName.trim()) {
      setCreateError("Enter a rack number or name.");
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setCreateError("");

    try {
      const response = await fetch("/api/racks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to create rack");
      }

      setNewName("");
      await loadRacks();
    } catch (err) {
      console.error("Create rack error:", err);
      setCreateError(err instanceof Error ? err.message : "Failed to create rack");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  function startRename(rack: Rack) {
    setRenamingId(rack.id);
    setRenameValue(rack.name);
    setRowError((current) => ({ ...current, [rack.id]: "" }));
  }

  async function saveRename(rackId: string) {
    if (inFlightRef.current[rackId]) return;

    inFlightRef.current[rackId] = true;
    setInFlightIds((current) => new Set(current).add(rackId));

    try {
      const response = await fetch(`/api/racks/${rackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to rename rack");
      }

      setRenamingId(null);
      await loadRacks();
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [rackId]: err instanceof Error ? err.message : "Failed to rename rack",
      }));
    } finally {
      inFlightRef.current[rackId] = false;
      setInFlightIds((current) => {
        const next = new Set(current);
        next.delete(rackId);
        return next;
      });
    }
  }

  async function toggleActive(rack: Rack) {
    if (inFlightRef.current[rack.id]) return;

    inFlightRef.current[rack.id] = true;
    setInFlightIds((current) => new Set(current).add(rack.id));

    try {
      const response = await fetch(`/api/racks/${rack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rack.active }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to update rack");
      }

      await loadRacks();
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [rack.id]: err instanceof Error ? err.message : "Failed to update rack",
      }));
    } finally {
      inFlightRef.current[rack.id] = false;
      setInFlightIds((current) => {
        const next = new Set(current);
        next.delete(rack.id);
        return next;
      });
    }
  }

  async function toggleExpanded(rackId: string) {
    if (expandedId === rackId) {
      setExpandedId(null);
      setExpandedOrders(null);
      return;
    }

    setExpandedId(rackId);
    setExpandedOrders(null);
    setExpandedLoading(true);

    try {
      const response = await fetch(`/api/racks/${rackId}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load rack orders");
      }

      setExpandedOrders(data.orders);
    } catch (err) {
      console.error("Load rack orders error:", err);
      setExpandedOrders([]);
    } finally {
      setExpandedLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8">Loading racks...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Racks</h1>
        <p className="text-gray-500 mt-1">
          Manage physical storage racks used for scan-to-assign.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium mb-2">Add Rack</label>

        <div className="flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createRack()}
            placeholder='e.g. "24" or "Rack 24" or "Overflow Shelf"'
            className="flex-1 rounded-lg border px-4 py-3"
          />

          <button
            onClick={createRack}
            disabled={creating}
            className="rounded-lg bg-black px-6 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {creating ? "Adding..." : "Add Rack"}
          </button>
        </div>

        {createError && (
          <div className="mt-3 text-sm text-red-700">{createError}</div>
        )}
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {racks && racks.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No racks yet.</div>
        ) : (
          <div className="divide-y">
            {racks?.map((rack) => {
              const busy = inFlightIds.has(rack.id);

              return (
                <div key={rack.id}>
                  <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-[180px]">
                      {renamingId === rack.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="rounded-lg border px-3 py-2"
                            autoFocus
                          />
                          <button
                            onClick={() => saveRename(rack.id)}
                            disabled={busy}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleExpanded(rack.id)}
                          className="text-left"
                        >
                          <div className="font-bold text-lg">
                            {rack.name}
                            {!rack.active && (
                              <span className="ml-2 text-xs font-medium text-red-600">
                                INACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 font-mono">
                            {rack.barcodeValue}
                          </div>
                        </button>
                      )}

                      {rowError[rack.id] && (
                        <div className="text-xs text-red-600 mt-1">
                          {rowError[rack.id]}
                        </div>
                      )}
                    </div>

                    <div className="text-sm text-gray-500">
                      {rack.orderCount} {rack.orderCount === 1 ? "order" : "orders"}
                    </div>

                    <div className="flex items-center gap-3">
                      <a
                        href={`/racks/${rack.id}/label`}
                        target="_blank"
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
                      >
                        🖨️ Print Label
                      </a>

                      {renamingId !== rack.id && (
                        <button
                          onClick={() => startRename(rack)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          Rename
                        </button>
                      )}

                      <button
                        onClick={() => toggleActive(rack)}
                        disabled={busy}
                        className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
                      >
                        {rack.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>

                  {expandedId === rack.id && (
                    <div className="px-5 pb-5">
                      {expandedLoading ? (
                        <div className="text-sm text-gray-400">Loading orders...</div>
                      ) : expandedOrders && expandedOrders.length > 0 ? (
                        <div className="rounded-lg border divide-y">
                          {expandedOrders.map((order) => (
                            <a
                              key={order.id}
                              href={`/orders/${order.id}`}
                              className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50"
                            >
                              <span className="font-mono">{order.orderNumber}</span>
                              <span className="text-gray-500">
                                {order.customer.firstName} {order.customer.lastName}
                              </span>
                              <span className="text-gray-400">{order.status}</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">
                          No orders currently on this rack.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
