"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ScanInput from "@/components/scan/ScanInput";

type PaymentSummary = {
  amountDue: number;
  amountPaid: number;
  balanceRemaining: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
};

type Payment = {
  id: string;
  amount: number;
  method: string;
  note?: string | null;
  createdAt: string;
};

type Garment = {
  id: string;
  name: string;
  quantity: number;
  service: string;
};

type FullOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  customer: { id: string; firstName: string; lastName: string; phone: string };
  garments: Garment[];
  payments: Payment[];
  paymentSummary: PaymentSummary;
  rack: { id: string; name: string; active: boolean } | null;
};

type SearchCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  orderCount: number;
  latestOrder: { id: string; orderNumber: string; status: string } | null;
};

type SearchOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  customer: { id: string; firstName: string; lastName: string };
  paymentSummary: PaymentSummary;
};

type CustomerOrderOption = {
  id: string;
  orderNumber: string;
  status: string;
  paymentSummary: PaymentSummary;
};

type SuccessSummary = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  paymentSummary: PaymentSummary;
  releasedRackName: string | null;
};

const paymentMethods = ["CASH", "CARD", "OTHER"];

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(
      /\w\S*/g,
      (word) => word.charAt(0).toUpperCase() + word.substring(1).toLowerCase()
    );
}

function paymentStatusClasses(status: string) {
  if (status === "PAID") return "bg-green-100 text-green-700";
  if (status === "PARTIAL") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function PickupInner() {
  const searchParams = useSearchParams();
  const prefillOrderId = searchParams.get("orderId");

  const [view, setView] = useState<"find" | "found" | "success">("find");

  // ---- find: scan ----
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");
  const scanInputKeyRef = useRef(0);

  // ---- find: manual ----
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchCustomers, setSearchCustomers] = useState<SearchCustomer[]>([]);
  const [searchOrders, setSearchOrders] = useState<SearchOrder[]>([]);
  const [customerOrders, setCustomerOrders] = useState<{
    name: string;
    orders: CustomerOrderOption[];
  } | null>(null);

  // ---- found ----
  const [order, setOrder] = useState<FullOrder | null>(null);
  const [loadError, setLoadError] = useState("");

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentNote, setPaymentNote] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const recordingPaymentRef = useRef(false);

  const [showBalanceOverride, setShowBalanceOverride] = useState(false);
  const [pickupSubmitting, setPickupSubmitting] = useState(false);
  const [pickupError, setPickupError] = useState("");
  const pickupRef = useRef(false);

  // ---- success ----
  const [success, setSuccess] = useState<SuccessSummary | null>(null);

  useEffect(() => {
    if (prefillOrderId) {
      loadFullOrder(prefillOrderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillOrderId]);

  async function loadFullOrder(id: string) {
    setScanLoading(true);
    setLoadError("");

    try {
      const response = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.details || data?.error || "Order not found");
      }

      setOrder(data);
      setShowPaymentForm(false);
      setPaymentError("");
      setPickupError("");
      setShowBalanceOverride(false);
      setView("found");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Order not found");
    } finally {
      setScanLoading(false);
    }
  }

  async function handleInvoiceScan(code: string) {
    setScanError("");
    setScanLoading(true);

    try {
      const response = await fetch(
        `/api/orders/lookup?code=${encodeURIComponent(code)}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Invoice not found");
      }

      await loadFullOrder(data.id);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Invoice not found");
      setScanLoading(false);
    }
  }

  // ---- Manual search (debounced, mirrors GlobalSearch/Counter) ----
  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setSearchCustomers([]);
      setSearchOrders([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    setSearchLoading(true);
    setSearchError("");

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Search failed");
        }

        setSearchCustomers(data.customers || []);
        setSearchOrders(data.orders || []);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed");
        setSearchCustomers([]);
        setSearchOrders([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  async function pickCustomer(customerId: string) {
    setSearchError("");

    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load customer");
      }

      setCustomerOrders({
        name: `${data.firstName} ${data.lastName}`,
        orders: data.orders,
      });
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Failed to load customer"
      );
    }
  }

  function resetManual() {
    setManualOpen(false);
    setQuery("");
    setSearchCustomers([]);
    setSearchOrders([]);
    setCustomerOrders(null);
    setSearchError("");
  }

  // ---- Payment ----
  function prefillBalance() {
    if (!order) return;
    setPaymentAmount(order.paymentSummary.balanceRemaining.toFixed(2));
    setShowPaymentForm(true);
  }

  async function recordPayment() {
    if (!order || recordingPaymentRef.current) return;

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a valid payment amount.");
      return;
    }

    recordingPaymentRef.current = true;
    setRecordingPayment(true);
    setPaymentError("");

    try {
      const response = await fetch(`/api/orders/${order.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method: paymentMethod,
          note: paymentNote,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setPaymentError(
            data?.error || "This order's balance changed. Refreshing current state."
          );
          await loadFullOrder(order.id);
          return;
        }

        throw new Error(data?.details || data?.error || "Failed to record payment");
      }

      setOrder({
        ...order,
        payments: [data.payment, ...order.payments],
        paymentSummary: data.summary,
      });

      setPaymentAmount("");
      setPaymentNote("");
      setPaymentMethod("CASH");
      setShowPaymentForm(false);
    } catch (err) {
      setPaymentError(
        err instanceof Error ? err.message : "Failed to record payment"
      );
    } finally {
      recordingPaymentRef.current = false;
      setRecordingPayment(false);
    }
  }

  // ---- Pickup ----
  async function completePickup() {
    if (!order || pickupRef.current) return;

    const releasedRackName = order.rack?.name ?? null;
    const orderId = order.id;

    pickupRef.current = true;
    setPickupSubmitting(true);
    setPickupError("");

    try {
      const response = await fetch(`/api/orders/${orderId}/transition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "PICKED_UP" }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setPickupError(
            data.error ||
              "This order was already updated by someone else. Refreshing current state."
          );
          await loadFullOrder(orderId);
        } else {
          setPickupError(data.error || "Failed to complete pickup");
        }
        return;
      }

      setSuccess({
        orderId,
        orderNumber: data.orderNumber,
        customerName: `${order.customer.firstName} ${order.customer.lastName}`,
        paymentSummary: data.paymentSummary,
        releasedRackName,
      });
      setView("success");
    } catch (err) {
      setPickupError(
        err instanceof Error ? err.message : "Failed to complete pickup"
      );
    } finally {
      pickupRef.current = false;
      setPickupSubmitting(false);
    }
  }

  function nextCustomer() {
    setOrder(null);
    setLoadError("");
    setScanError("");
    resetManual();
    setSuccess(null);
    setShowPaymentForm(false);
    setPaymentError("");
    setPickupError("");
    setShowBalanceOverride(false);
    scanInputKeyRef.current += 1;
    setView("find");
  }

  function changeOrder() {
    setOrder(null);
    setLoadError("");
    resetManual();
    setView("find");
  }

  // ==================== SUCCESS ====================
  if (view === "success" && success) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="text-sm font-bold text-green-700 uppercase tracking-wide mb-2">
            Pickup Complete
          </div>
          <div className="text-2xl font-bold mb-1">{success.orderNumber}</div>
          <div className="text-gray-600 mb-4">{success.customerName}</div>

          {success.paymentSummary.balanceRemaining <= 0 ? (
            <div className="inline-block rounded-full bg-green-100 px-4 py-1 text-green-800 font-medium">
              Paid in Full
            </div>
          ) : (
            <div className="inline-block rounded-full bg-yellow-100 px-4 py-1 text-yellow-800 font-medium">
              Balance Remaining: ${success.paymentSummary.balanceRemaining.toFixed(2)}
            </div>
          )}

          <div className="mt-4 text-sm text-gray-500">
            {success.releasedRackName
              ? `Rack Released: ${success.releasedRackName}`
              : "No rack was assigned."}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => window.open(`/orders/${success.orderId}/print`, "_blank")}
            className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
          >
            🖨️ Print Ticket
          </button>

          <a
            href={`/orders/${success.orderId}`}
            className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
          >
            View Order
          </a>

          <button
            onClick={nextCustomer}
            className="rounded-lg bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
          >
            Next Customer
          </button>
        </div>
      </div>
    );
  }

  // ==================== FIND ====================
  if (view === "find") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Pickup</h1>
          <p className="text-gray-500 mt-1">
            Scan the invoice to check a customer out, or find their order manually.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm mb-6">
          <ScanInput
            key={scanInputKeyRef.current}
            label="Scan Invoice"
            placeholder="PR-1234567890123"
            autoFocus
            disabled={scanLoading}
            onScan={handleInvoiceScan}
          />

          {scanLoading && (
            <div className="mt-3 text-sm text-gray-500">Looking up order...</div>
          )}

          {(scanError || loadError) && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {scanError || loadError}
            </div>
          )}
        </div>

        <div className="text-center mb-6">
          <button
            onClick={() => setManualOpen(!manualOpen)}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            {manualOpen ? "Hide Manual Lookup" : "Find Order Manually"}
          </button>
        </div>

        {manualOpen && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <label className="block text-sm font-medium mb-2">
              Search by order #, customer name, or phone
            </label>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="w-full rounded-lg border px-4 py-3 text-lg"
            />

            {searchError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {searchError}
              </div>
            )}

            {searchLoading && (
              <div className="mt-4 text-sm text-gray-500">Searching...</div>
            )}

            {customerOrders && (
              <div className="mt-4 rounded-lg border">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <div className="font-medium">{customerOrders.name}</div>
                  <button
                    onClick={() => setCustomerOrders(null)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    Back
                  </button>
                </div>

                {customerOrders.orders.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">
                    This customer has no orders.
                  </div>
                ) : (
                  <div className="divide-y">
                    {customerOrders.orders.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => loadFullOrder(o.id)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-4"
                      >
                        <div className="font-medium">{o.orderNumber}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {formatStatus(o.status)}
                          </span>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${paymentStatusClasses(
                              o.paymentSummary.paymentStatus
                            )}`}
                          >
                            {o.paymentSummary.paymentStatus}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!customerOrders &&
              !searchLoading &&
              (searchCustomers.length > 0 || searchOrders.length > 0) && (
                <div className="mt-4 space-y-4">
                  {searchOrders.length > 0 && (
                    <div className="rounded-lg border divide-y">
                      <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50">
                        Orders
                      </div>
                      {searchOrders.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => loadFullOrder(o.id)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="font-medium">{o.orderNumber}</div>
                            <div className="text-sm text-gray-500">
                              {o.customer.firstName} {o.customer.lastName}
                            </div>
                          </div>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${paymentStatusClasses(
                              o.paymentSummary.paymentStatus
                            )}`}
                          >
                            {formatStatus(o.status)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchCustomers.length > 0 && (
                    <div className="rounded-lg border divide-y">
                      <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50">
                        Customers
                      </div>
                      {searchCustomers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => pickCustomer(c.id)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="font-medium">
                              {c.firstName} {c.lastName}
                            </div>
                            <div className="text-sm text-gray-500">{c.phone}</div>
                          </div>
                          <div className="text-sm text-gray-500">
                            {c.orderCount} {c.orderCount === 1 ? "order" : "orders"}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

            {!customerOrders &&
              !searchLoading &&
              query.trim().length >= 2 &&
              searchCustomers.length === 0 &&
              searchOrders.length === 0 && (
                <div className="mt-4 text-sm text-gray-500 text-center">
                  No matches for &ldquo;{query.trim()}&rdquo;.
                </div>
              )}
          </div>
        )}
      </div>
    );
  }

  // ==================== FOUND ====================
  if (!order) return null;

  const physicalGarmentCount = order.garments.reduce(
    (sum, g) => sum + g.quantity,
    0
  );

  const balance = order.paymentSummary.balanceRemaining;
  const isReady = order.status === "READY";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{order.orderNumber}</h1>
          <div className="text-gray-500 mt-1">{formatStatus(order.status)}</div>
        </div>
        <button
          onClick={changeOrder}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Change Order
        </button>
      </div>

      {/* STATUS WARNINGS */}
      {order.status === "RECEIVED" || order.status === "PROCESSING" ? (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <div className="font-bold text-yellow-800 mb-1">
            This order is currently {formatStatus(order.status)} and is not ready
            for pickup.
          </div>
          <a
            href={`/orders/${order.id}`}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Open Full Order →
          </a>
        </div>
      ) : null}

      {order.status === "PICKED_UP" && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="font-bold text-gray-700 mb-1">Already Picked Up</div>
          <a
            href={`/orders/${order.id}`}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Open Full Order →
          </a>
        </div>
      )}

      {order.status === "CANCELLED" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="font-bold text-red-700 mb-1">Order Cancelled</div>
          <a
            href={`/orders/${order.id}`}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Open Full Order →
          </a>
        </div>
      )}

      {/* CUSTOMER + LOCATION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">Customer</div>
          <div className="text-xl font-bold">
            {order.customer.firstName} {order.customer.lastName}
          </div>
          <div className="text-gray-600 mt-1">{order.customer.phone}</div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">Location</div>
          <div className="text-xl font-bold">
            {order.rack ? order.rack.name : "Not Assigned"}
          </div>
        </div>
      </div>

      {/* GARMENTS */}
      <div className="rounded-xl border bg-white p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Garments</h2>
          <div className="text-sm text-gray-500">
            {physicalGarmentCount} pieces
          </div>
        </div>

        <div className="divide-y">
          {order.garments.map((garment) => (
            <div
              key={garment.id}
              className="py-2 flex items-center justify-between text-sm"
            >
              <div>
                {garment.quantity} × {garment.name}
              </div>
              <div className="text-gray-500">{garment.service}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PAYMENT */}
      <div className="rounded-xl border bg-white p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold mb-4">Payment</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-2">
          <div>
            <div className="text-sm text-gray-500">Order Total</div>
            <div className="text-xl font-bold mt-1">
              ${order.paymentSummary.amountDue.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Amount Paid</div>
            <div className="text-xl font-bold mt-1">
              ${order.paymentSummary.amountPaid.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Balance Remaining</div>
            <div className="text-xl font-bold mt-1">${balance.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Payment Status</div>
            <div className="mt-1">
              <span
                className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${paymentStatusClasses(
                  order.paymentSummary.paymentStatus
                )}`}
              >
                {order.paymentSummary.paymentStatus}
              </span>
            </div>
          </div>
        </div>

        {balance > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs text-red-700 font-bold uppercase tracking-wide">
                Balance Due
              </div>
              <div className="text-2xl font-bold text-red-700">
                ${balance.toFixed(2)}
              </div>
            </div>

            {isReady && !showPaymentForm && (
              <button
                onClick={prefillBalance}
                className="rounded-lg bg-black px-5 py-3 text-white font-medium hover:bg-gray-800"
              >
                Pay Remaining Balance
              </button>
            )}
          </div>
        )}

        {isReady && showPaymentForm && (
          <div className="mt-4 rounded-lg border p-5 bg-gray-50">
            {paymentError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {paymentError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full rounded-lg border pl-7 pr-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 bg-white"
                >
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Note (optional)
                </label>
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="e.g. Balance due"
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={recordPayment}
                  disabled={recordingPayment}
                  className="flex-1 rounded-lg bg-black px-5 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {recordingPayment ? "Saving..." : "Record Payment"}
                </button>

                <button
                  onClick={() => setShowPaymentForm(false)}
                  disabled={recordingPayment}
                  className="rounded-lg border px-4 py-2 font-medium hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PICKUP ACTIONS */}
      {isReady && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          {pickupError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {pickupError}
            </div>
          )}

          {balance <= 0 ? (
            <button
              onClick={completePickup}
              disabled={pickupSubmitting}
              className="w-full rounded-lg bg-black px-6 py-4 text-white text-lg font-bold hover:bg-gray-800 disabled:opacity-50"
            >
              {pickupSubmitting ? "Completing Pickup..." : "Complete Pickup"}
            </button>
          ) : (
            <div>
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 mb-4">
                Balance Remaining: ${balance.toFixed(2)} — record payment before
                pickup, or use the override below.
              </div>

              {!showBalanceOverride ? (
                <button
                  onClick={() => setShowBalanceOverride(true)}
                  className="w-full rounded-lg border border-red-300 text-red-700 px-6 py-3 font-medium hover:bg-red-50"
                >
                  Complete Pickup With Balance
                </button>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-5">
                  <div className="font-medium text-red-800 mb-4">
                    This order still has a balance of ${balance.toFixed(2)}. Mark
                    it picked up anyway?
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={completePickup}
                      disabled={pickupSubmitting}
                      className="rounded-lg bg-red-700 px-5 py-3 text-white font-medium hover:bg-red-800 disabled:opacity-50"
                    >
                      {pickupSubmitting ? "Completing..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setShowBalanceOverride(false)}
                      disabled={pickupSubmitting}
                      className="rounded-lg border px-5 py-3 font-medium hover:bg-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => window.open(`/orders/${order.id}/print`, "_blank")}
          className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
        >
          🖨️ Print Ticket
        </button>

        <a
          href={`/orders/${order.id}`}
          className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
        >
          View Full Order
        </a>
      </div>
    </div>
  );
}

export default function PickupPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <PickupInner />
    </Suspense>
  );
}
