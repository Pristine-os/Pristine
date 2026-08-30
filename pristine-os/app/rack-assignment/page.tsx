"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ScanInput from "@/components/scan/ScanInput";

type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  customer: { firstName: string; lastName: string };
  physicalGarmentCount: number;
  rack: { id: string; name: string; active: boolean } | null;
};

type RackOption = { id: string; name: string; active: boolean };
type RackLookup = { id: string; name: string; barcodeValue: string; active: boolean };

function RackAssignmentInner() {
  const searchParams = useSearchParams();
  const prefillOrderId = searchParams.get("orderId");

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [orderError, setOrderError] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);

  const [rackOptions, setRackOptions] = useState<RackOption[]>([]);
  const [selectedRack, setSelectedRack] = useState<RackLookup | null>(null);
  const [rackError, setRackError] = useState("");

  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const assignRef = useRef(false);

  useEffect(() => {
    fetch("/api/racks", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setRackOptions((data.racks || []).filter((r: RackOption) => r.active)))
      .catch((err) => console.error("Failed to load racks:", err));
  }, []);

  useEffect(() => {
    if (prefillOrderId) {
      loadOrderById(prefillOrderId);
    }
  }, [prefillOrderId]);

  async function loadOrderById(id: string) {
    setOrderLoading(true);
    setOrderError("");
    setSuccessMessage("");

    try {
      const response = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Order not found");
      }

      const physicalGarmentCount = (data.garments || []).reduce(
        (sum: number, g: { quantity: number }) => sum + g.quantity,
        0
      );

      setOrder({
        id: data.id,
        orderNumber: data.orderNumber,
        status: data.status,
        customer: data.customer,
        physicalGarmentCount,
        rack: data.rack,
      });
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Order not found");
      setOrder(null);
    } finally {
      setOrderLoading(false);
    }
  }

  async function handleOrderScan(code: string) {
    setOrderLoading(true);
    setOrderError("");
    setSuccessMessage("");
    setSelectedRack(null);
    setRackError("");

    try {
      const response = await fetch(`/api/orders/lookup?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Order not found");
      }

      setOrder(data);
    } catch (err) {
      setOrder(null);
      setOrderError(err instanceof Error ? err.message : "Order not found");
    } finally {
      setOrderLoading(false);
    }
  }

  async function handleRackScan(code: string) {
    setRackError("");
    setAssignError("");

    try {
      const response = await fetch(`/api/racks/lookup?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Rack not found");
      }

      setSelectedRack(data);
    } catch (err) {
      setSelectedRack(null);
      setRackError(err instanceof Error ? err.message : "Rack not found");
    }
  }

  function selectRackFromList(rackId: string) {
    const rack = rackOptions.find((r) => r.id === rackId);
    if (!rack) return;
    setRackError("");
    setSelectedRack({ id: rack.id, name: rack.name, barcodeValue: "", active: rack.active });
  }

  async function confirmAssign() {
    if (!order || !selectedRack || assignRef.current) return;

    assignRef.current = true;
    setAssigning(true);
    setAssignError("");

    try {
      const response = await fetch(`/api/orders/${order.id}/rack`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rackId: selectedRack.id,
          expectedCurrentRackId: order.rack?.id ?? null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to assign rack");
      }

      setSuccessMessage(`${data.orderNumber} — Assigned to ${data.rack.name}`);
      setOrder(null);
      setSelectedRack(null);
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign rack");
    } finally {
      assignRef.current = false;
      setAssigning(false);
    }
  }

  function resetForNext() {
    setOrder(null);
    setOrderError("");
    setSelectedRack(null);
    setRackError("");
    setAssignError("");
    setSuccessMessage("");
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Rack Assignment</h1>
        <p className="text-gray-500 mt-1">
          Scan the invoice, then scan the rack, to assign an order to a physical rack.
        </p>
      </div>

      {successMessage && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5 flex items-center justify-between">
          <div className="font-bold text-green-700">{successMessage}</div>
          <button
            onClick={resetForNext}
            className="rounded-lg bg-black px-4 py-2 text-white text-sm font-medium"
          >
            Assign Next Order
          </button>
        </div>
      )}

      {!order && !successMessage && (
        <div className="rounded-xl border bg-white p-6 shadow-sm mb-6">
          <ScanInput
            label="Step 1 — Scan or Type Invoice Number"
            placeholder="PR-1234567890123"
            autoFocus
            disabled={orderLoading}
            onScan={handleOrderScan}
          />

          {orderLoading && <div className="mt-3 text-sm text-gray-500">Looking up order...</div>}

          {orderError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {orderError}
            </div>
          )}
        </div>
      )}

      {order && (
        <div className="rounded-xl border bg-white p-6 shadow-sm mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-bold">{order.orderNumber}</div>
              <div className="text-gray-600">
                {order.customer.firstName} {order.customer.lastName}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {order.physicalGarmentCount} garments · Status: {order.status}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                Current Rack: {order.rack ? order.rack.name : "Not Assigned"}
              </div>
            </div>

            <button
              onClick={resetForNext}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Change Order
            </button>
          </div>

          {order.status !== "READY" && (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              This order is currently {order.status}. You can still assign a rack anyway.
            </div>
          )}

          <div className="mt-6 border-t pt-5">
            <ScanInput
              label="Step 2 — Scan or Type Rack Number"
              placeholder="RACK-024"
              autoFocus
              onScan={handleRackScan}
            />

            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">
                Or select a rack
              </label>
              <select
                value={selectedRack?.id || ""}
                onChange={(e) => selectRackFromList(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 bg-white"
              >
                <option value="">Select a rack...</option>
                {rackOptions.map((rack) => (
                  <option key={rack.id} value={rack.id}>
                    {rack.name}
                  </option>
                ))}
              </select>
            </div>

            {rackError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {rackError}
              </div>
            )}

            {selectedRack && (
              <div className="mt-4 rounded-lg border bg-gray-50 p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">{selectedRack.name}</div>
                  {!selectedRack.active && (
                    <div className="text-sm text-red-600">
                      This rack is inactive and cannot be assigned.
                    </div>
                  )}
                </div>

                <button
                  onClick={confirmAssign}
                  disabled={assigning || !selectedRack.active}
                  className="rounded-lg bg-black px-5 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {assigning ? "Assigning..." : `Assign to ${selectedRack.name}`}
                </button>
              </div>
            )}

            {assignError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {assignError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RackAssignmentPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <RackAssignmentInner />
    </Suspense>
  );
}
