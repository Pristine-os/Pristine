"use client";

import { useEffect, useRef, useState } from "react";
import GarmentLineEditor from "@/components/orders/GarmentLineEditor";
import {
  blankGarmentLine,
  calculateGarmentLinesTotal,
} from "@/lib/garmentLines";
import type { GarmentLine, PricingCatalog } from "@/lib/garmentLines";

type SearchCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  orderCount: number;
  latestOrder: {
    id: string;
    orderNumber: string;
    status: string;
    createdAt: string;
  } | null;
};

type SelectedCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  stats: {
    orderCount: number;
    outstandingBalance: number;
  };
};

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

type CreatedOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  tagPrintingEnabled: boolean;
  customer: { id: string; firstName: string; lastName: string };
  garments: { printTag: boolean }[];
  payments: Payment[];
  paymentSummary: PaymentSummary;
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

export default function CounterPage() {
  const [stage, setStage] = useState<"search" | "building" | "created">(
    "search"
  );

  // ---- Step 1: find customer ----
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchCustomer[] | null>(
    null
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---- Step 2: create customer inline ----
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createCustomerError, setCreateCustomerError] = useState("");

  // ---- Selected customer + order building ----
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [catalog, setCatalog] = useState<PricingCatalog | null>(null);
  const [garments, setGarments] = useState<GarmentLine[]>([]);
  const [tagPrintingEnabled, setTagPrintingEnabled] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createOrderError, setCreateOrderError] = useState("");

  // ---- Created order + payment ----
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentNote, setPaymentNote] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // Synchronous submission locks. Component state updates via setState
  // are batched/async, so two clicks fired in the same tick (a fast
  // double-click, or a synthetic double .click()) can both read the old
  // state and pass a state-only guard before either re-render lands.
  // Refs are mutable and read/written synchronously, so the second call
  // always sees the first call's lock — this only debounces duplicate
  // submissions from the UI and never touches the payment/order math.
  const creatingCustomerRef = useRef(false);
  const creatingOrderRef = useRef(false);
  const recordingPaymentRef = useRef(false);

  useEffect(() => {
    fetch("/api/pricing", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setCatalog(data))
      .catch((err) => console.error("Failed to load pricing:", err));
  }, []);

  useEffect(() => {
    if (stage === "search") {
      searchInputRef.current?.focus();
    }
  }, [stage]);

  // ---- Search ----
  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setSearchResults(null);
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

        setSearchResults(data.customers || []);
      } catch (err) {
        console.error("Counter search error:", err);
        setSearchError(
          err instanceof Error ? err.message : "Search failed"
        );
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      setSearchResults(null);
      return;
    }

    if (event.key === "Enter" && searchResults && searchResults.length > 0) {
      selectCustomer(searchResults[0].id);
    }
  }

  // ---- Select a customer (from search or right after creation) ----
  async function selectCustomer(customerId: string) {
    try {
      setSearchError("");

      const response = await fetch(`/api/customers/${customerId}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load customer");
      }

      setSelectedCustomer({
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        stats: {
          orderCount: data.stats.orderCount,
          outstandingBalance: data.stats.outstandingBalance,
        },
      });

      setGarments([blankGarmentLine(catalog)]);
      setTagPrintingEnabled(true);
      setCreateOrderError("");
      setQuery("");
      setSearchResults(null);
      setShowCreateCustomer(false);
      setStage("building");
    } catch (err) {
      console.error("Select customer error:", err);
      setSearchError(
        err instanceof Error ? err.message : "Failed to load customer"
      );
    }
  }

  function changeCustomer() {
    setSelectedCustomer(null);
    setGarments([]);
    setStage("search");
  }

  // ---- Create customer inline ----
  async function handleCreateCustomer() {
    if (creatingCustomerRef.current) return;

    try {
      setCreateCustomerError("");

      if (!newCustomer.firstName.trim() || !newCustomer.lastName.trim()) {
        setCreateCustomerError("First and last name are required.");
        return;
      }

      if (!newCustomer.phone.trim()) {
        setCreateCustomerError("Phone number is required.");
        return;
      }

      creatingCustomerRef.current = true;
      setCreatingCustomer(true);

      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: newCustomer.firstName.trim(),
          lastName: newCustomer.lastName.trim(),
          phone: newCustomer.phone.trim(),
          email: newCustomer.email.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to create customer");
      }

      setNewCustomer({ firstName: "", lastName: "", phone: "", email: "" });
      await selectCustomer(data.id);
    } catch (err) {
      console.error("Create customer error:", err);
      setCreateCustomerError(
        err instanceof Error ? err.message : "Failed to create customer"
      );
    } finally {
      creatingCustomerRef.current = false;
      setCreatingCustomer(false);
    }
  }

  // ---- Garment line editing ----
  function addGarment() {
    setGarments((current) => [...current, blankGarmentLine(catalog)]);
  }

  function removeGarment(index: number) {
    if (garments.length === 1) return;
    setGarments((current) => current.filter((_, i) => i !== index));
  }

  function updateGarment(
    index: number,
    field: keyof GarmentLine,
    value: string | number | boolean
  ) {
    setGarments((current) =>
      current.map((garment, i) => {
        if (i !== index) return garment;

        const updated = { ...garment, [field]: value } as GarmentLine;

        if (field === "name" || field === "service") {
          updated.price =
            catalog?.prices.find(
              (entry) =>
                entry.garmentType === updated.name &&
                entry.service === updated.service
            )?.price || 0;
        }

        return updated;
      })
    );
  }

  const orderTotal = calculateGarmentLinesTotal(garments);

  // ---- Create order ----
  async function createOrder() {
    if (!selectedCustomer || creatingOrderRef.current) return;

    try {
      setCreateOrderError("");

      const validGarments = garments.filter(
        (garment) => garment.name.trim() !== ""
      );

      if (validGarments.length === 0) {
        setCreateOrderError("Please add at least one garment.");
        return;
      }

      creatingOrderRef.current = true;
      setCreatingOrder(true);

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          status: "RECEIVED",
          tagPrintingEnabled,
          garments: validGarments.map((garment) => ({
            name: garment.name.trim(),
            service: garment.service,
            quantity: Number(garment.quantity),
            price: Number(garment.price),
            prepayDiscount: garment.prepayDiscount === true,
            printTag: garment.printTag !== false,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.details || data?.error || "Failed to create order"
        );
      }

      // Re-fetch the canonical shape (with paymentSummary) rather than
      // re-deriving payment math here — same source of truth as every
      // other page.
      const orderResponse = await fetch(`/api/orders/${data.id}`, {
        cache: "no-store",
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(orderData?.error || "Order created, but failed to load it");
      }

      setOrder(orderData);
      setStage("created");
    } catch (err) {
      console.error("Create order error:", err);
      setCreateOrderError(
        err instanceof Error ? err.message : "Failed to create order"
      );
    } finally {
      creatingOrderRef.current = false;
      setCreatingOrder(false);
    }
  }

  // ---- Payment ----
  function payRemainingBalance() {
    if (!order) return;
    setPaymentAmount(order.paymentSummary.balanceRemaining.toFixed(2));
  }

  async function recordPayment() {
    if (!order || recordingPaymentRef.current) return;

    try {
      setPaymentError("");

      const amount = Number(paymentAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        setPaymentError("Enter a valid payment amount.");
        return;
      }

      recordingPaymentRef.current = true;
      setRecordingPayment(true);

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
        throw new Error(
          data?.details || data?.error || "Failed to record payment"
        );
      }

      setOrder({
        ...order,
        payments: [data.payment, ...order.payments],
        paymentSummary: data.summary,
      });

      setPaymentAmount("");
      setPaymentNote("");
      setPaymentMethod("CASH");
    } catch (err) {
      console.error("Record payment error:", err);
      setPaymentError(
        err instanceof Error ? err.message : "Failed to record payment"
      );
    } finally {
      recordingPaymentRef.current = false;
      setRecordingPayment(false);
    }
  }

  function printTicket() {
    if (!order) return;
    window.open(`/orders/${order.id}/print`, "_blank");
  }

  function printGarmentTags() {
    if (!order) return;
    window.open(`/orders/${order.id}/tags`, "_blank");
  }

  function finishAndStartNext() {
    setStage("search");
    setQuery("");
    setSearchResults(null);
    setSearchError("");
    setShowCreateCustomer(false);
    setNewCustomer({ firstName: "", lastName: "", phone: "", email: "" });
    setCreateCustomerError("");
    setSelectedCustomer(null);
    setGarments([]);
    setCreateOrderError("");
    setOrder(null);
    setPaymentAmount("");
    setPaymentMethod("CASH");
    setPaymentNote("");
    setPaymentError("");
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Front Counter</h1>
        <p className="text-gray-500 mt-1">
          Find a customer, build the order, and take payment — all in one
          place.
        </p>
      </div>

      {/* ============ STAGE: SEARCH ============ */}
      {stage === "search" && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium mb-2">
            Find Customer
          </label>

          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search by name, phone, or email..."
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

          {!searchLoading && searchResults && searchResults.length > 0 && (
            <div className="mt-4 divide-y rounded-lg border">
              {searchResults.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => selectCustomer(customer.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">
                      {customer.firstName} {customer.lastName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {customer.phone}
                      {customer.email ? ` — ${customer.email}` : ""}
                    </div>
                  </div>

                  <div className="text-right text-sm text-gray-500 shrink-0">
                    <div>
                      {customer.orderCount}{" "}
                      {customer.orderCount === 1 ? "order" : "orders"}
                    </div>
                    {customer.latestOrder && (
                      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs mt-1">
                        {formatStatus(customer.latestOrder.status)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searchLoading &&
            searchResults &&
            searchResults.length === 0 &&
            query.trim().length >= 2 && (
              <div className="mt-4 rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm text-gray-500 mb-3">
                  No customer found for &ldquo;{query.trim()}&rdquo;.
                </p>

                <button
                  onClick={() => setShowCreateCustomer(true)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  + Create New Customer
                </button>
              </div>
            )}

          {!showCreateCustomer && (
            <div className="mt-4">
              <button
                onClick={() => setShowCreateCustomer(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                + New Customer
              </button>
            </div>
          )}

          {showCreateCustomer && (
            <div className="mt-5 rounded-lg border bg-gray-50 p-5">
              <h3 className="font-bold mb-4">Create New Customer</h3>

              {createCustomerError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {createCustomerError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input
                  value={newCustomer.firstName}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      firstName: e.target.value,
                    })
                  }
                  placeholder="First Name"
                  className="rounded-lg border px-3 py-2"
                />

                <input
                  value={newCustomer.lastName}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      lastName: e.target.value,
                    })
                  }
                  placeholder="Last Name"
                  className="rounded-lg border px-3 py-2"
                />

                <input
                  value={newCustomer.phone}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, phone: e.target.value })
                  }
                  placeholder="Phone"
                  className="rounded-lg border px-3 py-2"
                />

                <input
                  value={newCustomer.email}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, email: e.target.value })
                  }
                  placeholder="Email (optional)"
                  className="rounded-lg border px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCreateCustomer(false);
                    setCreateCustomerError("");
                  }}
                  disabled={creatingCustomer}
                  className="rounded-lg border px-4 py-2 font-medium hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  onClick={handleCreateCustomer}
                  disabled={creatingCustomer}
                  className="rounded-lg bg-black px-5 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {creatingCustomer
                    ? "Creating..."
                    : "Create & Continue"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ STAGE: BUILDING ============ */}
      {stage === "building" && selectedCustomer && (
        <div>
          {/* CUSTOMER SUMMARY */}
          <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="font-bold text-lg">
                {selectedCustomer.firstName} {selectedCustomer.lastName}
              </div>
              <div className="text-sm text-gray-500">
                {selectedCustomer.phone}
                {selectedCustomer.email ? ` — ${selectedCustomer.email}` : ""}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs text-gray-500">Orders</div>
                <div className="font-medium">
                  {selectedCustomer.stats.orderCount}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-500">
                  Outstanding Balance
                </div>
                <div className="font-medium">
                  ${selectedCustomer.stats.outstandingBalance.toFixed(2)}
                </div>
              </div>

              <button
                onClick={changeCustomer}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Change Customer
              </button>
            </div>
          </div>

          {/* ORDER BUILDER */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            {createOrderError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                {createOrderError}
              </div>
            )}

            <GarmentLineEditor
              garments={garments}
              catalog={catalog}
              onUpdate={updateGarment}
              onRemove={removeGarment}
              onAdd={addGarment}
            />

            <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={tagPrintingEnabled}
                  onChange={(e) => setTagPrintingEnabled(e.target.checked)}
                />
                Print Garment Tags
              </label>

              <div className="w-full md:w-80 rounded-lg bg-gray-50 p-5">
                <div className="flex justify-between text-lg font-bold">
                  <span>Order Total</span>
                  <span>${orderTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={createOrder}
                disabled={creatingOrder}
                className="rounded-lg bg-black px-6 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {creatingOrder ? "Creating..." : "Create Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ STAGE: CREATED ============ */}
      {stage === "created" && order && (
        <div>
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-6">
            <div className="text-sm font-medium text-green-700 mb-1">
              Order Created
            </div>
            <div className="text-2xl font-bold">{order.orderNumber}</div>
            <div className="text-gray-600 mt-1">
              {order.customer.firstName} {order.customer.lastName}
            </div>
          </div>

          {/* PAYMENT */}
          <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-5">Payment</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-5">
              <div>
                <div className="text-sm text-gray-500">Amount Due</div>
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
                <div className="text-sm text-gray-500">
                  Balance Remaining
                </div>
                <div className="text-xl font-bold mt-1">
                  ${order.paymentSummary.balanceRemaining.toFixed(2)}
                </div>
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

            {order.paymentSummary.balanceRemaining > 0 && (
              <div className="rounded-lg border p-5 bg-gray-50">
                {paymentError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {paymentError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder={order.paymentSummary.balanceRemaining.toFixed(
                          2
                        )}
                        className="w-full rounded-lg border pl-7 pr-3 py-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Method
                    </label>
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
                      placeholder="e.g. Deposit"
                      className="w-full rounded-lg border px-3 py-2"
                    />
                  </div>

                  <button
                    onClick={recordPayment}
                    disabled={recordingPayment}
                    className="rounded-lg bg-black px-5 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {recordingPayment ? "Saving..." : "Record Payment"}
                  </button>
                </div>

                <button
                  onClick={payRemainingBalance}
                  disabled={recordingPayment}
                  className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  Pay Remaining Balance (${order.paymentSummary.balanceRemaining.toFixed(2)})
                </button>
              </div>
            )}
          </div>

          {/* ACTIONS */}
          <div className="rounded-xl border bg-white p-6 shadow-sm flex flex-wrap items-center gap-3">
            <button
              onClick={printTicket}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
            >
              🖨️ Print Ticket
            </button>

            {order.tagPrintingEnabled &&
            order.garments.some((g) => g.printTag) ? (
              <button
                onClick={printGarmentTags}
                className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
              >
                🏷️ Print Garment Tags
              </button>
            ) : (
              <span className="text-sm text-gray-400 italic">
                Garment Tags: Printing Disabled
              </span>
            )}

            <a
              href={`/orders/${order.id}`}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
            >
              View Order
            </a>

            <a
              href={`/customers/${order.customer.id}`}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
            >
              View Customer
            </a>

            <div className="flex-1" />

            <button
              onClick={finishAndStartNext}
              className="rounded-lg bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
            >
              Finish &amp; Start Next Customer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
