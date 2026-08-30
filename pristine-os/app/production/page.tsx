"use client";

import { useEffect, useRef, useState } from "react";

type BoardOrder = {
  id: string;
  orderNumber: string;
  status: "RECEIVED" | "PROCESSING" | "READY";
  createdAt: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  garments: { name: string; quantity: number }[];
  physicalGarmentCount: number;
  totalTags: number;
  tagPrintingEnabled: boolean;
  rack: { id: string; name: string } | null;
  paymentSummary: {
    amountDue: number;
    amountPaid: number;
    balanceRemaining: number;
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  };
};

const REFRESH_INTERVAL_MS = 45_000;

const COLUMNS: { status: BoardOrder["status"]; label: string }[] = [
  { status: "RECEIVED", label: "Received" },
  { status: "PROCESSING", label: "Processing" },
  { status: "READY", label: "Ready" },
];

function garmentSummary(garments: { name: string; quantity: number }[]) {
  if (garments.length === 0) return "No garments";

  const shown = garments.slice(0, 3);
  const remaining = garments.length - shown.length;

  const text = shown.map((g) => `${g.name} ×${g.quantity}`).join(" · ");

  return remaining > 0 ? `${text} +${remaining} more` : text;
}

function paymentBadgeClasses(status: string) {
  if (status === "PARTIAL") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

export default function ProductionBoardPage() {
  const [orders, setOrders] = useState<BoardOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());

  // Synchronous per-order lock — mirrors the fix applied to /counter.
  // Component state updates are batched/async, so a fast triple-click
  // could otherwise fire the handler three times before the disabled
  // attribute ever lands. A ref is read/written synchronously, so the
  // second and third clicks see the lock immediately.
  const inFlightRef = useRef<Record<string, boolean>>({});

  async function loadBoard(showSpinner = true) {
    try {
      if (showSpinner) setLoading(true);
      setError("");

      const response = await fetch("/api/production", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.details || data?.error || "Failed to load production board"
        );
      }

      setOrders(data.orders);
    } catch (err) {
      console.error("Load production board error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load production board"
      );
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard();

    const interval = setInterval(() => loadBoard(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function transition(orderId: string, to: "PROCESSING" | "READY") {
    if (inFlightRef.current[orderId]) return;

    inFlightRef.current[orderId] = true;
    setInFlightIds((current) => new Set(current).add(orderId));
    setError("");

    try {
      const response = await fetch(`/api/orders/${orderId}/transition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });

      const data = await response.json();

      if (!response.ok) {
        // A 409 means someone else already moved this order — resync
        // the whole board rather than trusting our stale local copy.
        if (response.status === 409) {
          setError(data.error || "This order was already updated.");
          await loadBoard(false);
        } else {
          setError(data.error || "Failed to update order status");
        }
        return;
      }

      setOrders((current) =>
        current
          ? current.map((order) => (order.id === orderId ? data : order))
          : current
      );
    } catch (err) {
      console.error("Production transition error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update order status"
      );
    } finally {
      inFlightRef.current[orderId] = false;
      setInFlightIds((current) => {
        const next = new Set(current);
        next.delete(orderId);
        return next;
      });
    }
  }

  const trimmedSearch = search.trim().toLowerCase();

  const filtered = (orders ?? []).filter((order) => {
    if (!trimmedSearch) return true;

    const haystack = [
      order.orderNumber,
      order.customer.firstName,
      order.customer.lastName,
      order.customer.phone,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(trimmedSearch);
  });

  if (loading) {
    return <div className="p-8">Loading production board...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Production Board</h1>
          <p className="text-gray-500 mt-1">
            Move orders through Received → Processing → Ready.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer name, phone..."
            className="w-full md:w-80 rounded-lg border px-4 py-3 text-lg"
          />

          <button
            onClick={() => loadBoard(true)}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {COLUMNS.map((column) => {
          const columnOrders = filtered.filter(
            (order) => order.status === column.status
          );

          return (
            <div key={column.status} className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h2 className="text-lg font-bold">
                  {column.label} ({columnOrders.length})
                </h2>
              </div>

              <div className="p-4 space-y-4">
                {columnOrders.length === 0 ? (
                  <div className="text-center text-gray-400 py-8 text-sm">
                    Nothing here.
                  </div>
                ) : (
                  columnOrders.map((order) => {
                    const busy = inFlightIds.has(order.id);

                    return (
                      <div
                        key={order.id}
                        className="rounded-lg border p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <a
                            href={`/orders/${order.id}`}
                            className="text-lg font-bold text-blue-600 hover:text-blue-800"
                          >
                            {order.orderNumber}
                          </a>

                          {order.paymentSummary.paymentStatus !== "PAID" && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${paymentBadgeClasses(
                                order.paymentSummary.paymentStatus
                              )}`}
                            >
                              {order.paymentSummary.paymentStatus}
                            </span>
                          )}
                        </div>

                        <div className="font-medium mb-1">
                          {order.customer.firstName} {order.customer.lastName}
                        </div>

                        <div className="text-sm text-gray-600 mb-2">
                          {garmentSummary(order.garments)}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mb-4">
                          <span>{order.physicalGarmentCount} garments</span>
                          <span>
                            {order.tagPrintingEnabled
                              ? `Tags ${order.totalTags}/${order.physicalGarmentCount}`
                              : "Tags Off"}
                          </span>
                          <span>
                            {new Date(order.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {order.status === "READY" && (
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                            <span>
                              Rack: {order.rack ? order.rack.name : "Not Assigned"}
                            </span>
                            <a
                              href={`/rack-assignment?orderId=${order.id}`}
                              className="font-medium text-blue-600 hover:text-blue-800"
                            >
                              Assign Rack
                            </a>
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          {order.status === "RECEIVED" && (
                            <button
                              onClick={() => transition(order.id, "PROCESSING")}
                              disabled={busy}
                              className="flex-1 rounded-lg bg-black px-4 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
                            >
                              {busy ? "Updating..." : "Start Processing"}
                            </button>
                          )}

                          {order.status === "PROCESSING" && (
                            <button
                              onClick={() => transition(order.id, "READY")}
                              disabled={busy}
                              className="flex-1 rounded-lg bg-black px-4 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
                            >
                              {busy ? "Updating..." : "Mark Ready"}
                            </button>
                          )}

                          <a
                            href={`/orders/${order.id}`}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium hover:bg-gray-50"
                          >
                            View
                          </a>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
