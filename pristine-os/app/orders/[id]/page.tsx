"use client";

import { use, useEffect, useState } from "react";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
};

type Garment = {
  id: string;
  name: string;
  quantity: number;
  service: string;
  price?: number;
};

type Payment = {
  id: string;
  amount: number;
  method: string;
  note?: string | null;
  createdAt: string;
};

type PaymentSummary = {
  amountDue: number;
  amountPaid: number;
  balanceRemaining: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  garments: Garment[];
  payments: Payment[];
  paymentSummary: PaymentSummary;
};

const statuses = [
  "RECEIVED",
  "PROCESSING",
  "READY",
  "PICKED_UP",
  "CANCELLED",
];

const paymentMethods = ["CASH", "CARD", "OTHER"];

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(
      /\w\S*/g,
      (word) =>
        word.charAt(0).toUpperCase() +
        word.substring(1).toLowerCase()
    );
}

export default function OrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [order, setOrder] =
    useState<Order | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [updating, setUpdating] =
    useState(false);

  const [error, setError] =
    useState("");

  const [showPaymentForm, setShowPaymentForm] =
    useState(false);

  const [paymentAmount, setPaymentAmount] =
    useState("");

  const [paymentMethod, setPaymentMethod] =
    useState("CASH");

  const [paymentNote, setPaymentNote] =
    useState("");

  const [recordingPayment, setRecordingPayment] =
    useState(false);

  const [paymentError, setPaymentError] =
    useState("");

  async function loadOrder() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/orders/${id}`,
        {
          cache: "no-store",
        }
      );

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Order API returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.details ||
            data?.error ||
            "Failed to load order"
        );
      }

      setOrder(data);
    } catch (error) {
      console.error(
        "Failed to load order:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to load order"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) {
      loadOrder();
    }
  }, [id]);

  async function updateStatus(
    newStatus: string
  ) {
    if (!order) return;

    try {
      setUpdating(true);
      setError("");

      const response = await fetch(
        `/api/orders/${order.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Update API returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.details ||
            data?.error ||
            "Failed to update order"
        );
      }

      setOrder(data);
    } catch (error) {
      console.error(
        "Update status error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to update order"
      );
    } finally {
      setUpdating(false);
    }
  }

  async function recordPayment() {
    if (!order) return;

    try {
      setPaymentError("");

      const amount = Number(paymentAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        setPaymentError(
          "Enter a valid payment amount."
        );
        return;
      }

      setRecordingPayment(true);

      const response = await fetch(
        `/api/orders/${order.id}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount,
            method: paymentMethod,
            note: paymentNote,
          }),
        }
      );

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Payment API returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.details ||
            data?.error ||
            "Failed to record payment"
        );
      }

      setOrder({
        ...order,
        payments: [
          data.payment,
          ...order.payments,
        ],
        paymentSummary: data.summary,
      });

      setPaymentAmount("");
      setPaymentNote("");
      setPaymentMethod("CASH");
      setShowPaymentForm(false);
    } catch (error) {
      console.error(
        "Record payment error:",
        error
      );

      setPaymentError(
        error instanceof Error
          ? error.message
          : "Failed to record payment"
      );
    } finally {
      setRecordingPayment(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        Loading order...
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8">
        Order not found.
      </div>
    );
  }

  const total =
    order.garments?.reduce(
      (sum, garment) =>
        sum +
        Number(garment.price || 0) *
          Number(garment.quantity || 1),
      0
    ) || Number(order.total || 0);

  return (
    <div className="p-8">

      {/* HEADER */}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">

        <div>

          <button
            onClick={() =>
              (window.location.href =
                "/orders")
            }
            className="mb-3 text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to Orders
          </button>

          <h1 className="text-3xl font-bold">
            {order.orderNumber}
          </h1>

          <p className="text-gray-500 mt-1">
            Created{" "}
            {new Date(
              order.createdAt
            ).toLocaleString()}
          </p>

        </div>


        {/* PRINT BUTTON */}

        <button
          onClick={() =>
            window.open(
              `/orders/${order.id}/print`,
              "_blank"
            )
          }
          className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
        >
          🖨️ Print Ticket
        </button>

      </div>


      {/* ERROR */}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}


      {/* STATUS */}

      <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">

        <h2 className="text-lg font-bold mb-5">
          Order Status
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

          {statuses.map(
            (status) => {

              const active =
                order.status === status;

              return (
                <button
                  key={status}
                  disabled={updating}
                  onClick={() =>
                    updateStatus(
                      status
                    )
                  }
                  className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-black text-white border-black"
                      : "bg-white hover:bg-gray-50"
                  } ${
                    updating
                      ? "opacity-50"
                      : ""
                  }`}
                >
                  {formatStatus(
                    status
                  )}
                </button>
              );
            }
          )}

        </div>

      </div>


      {/* CUSTOMER + TOTAL */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        <div className="lg:col-span-2 rounded-xl border bg-white p-6 shadow-sm">

          <h2 className="text-lg font-bold mb-5">
            Customer
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <div>
              <div className="text-sm text-gray-500">
                Name
              </div>

              <div className="font-medium mt-1">
                {order.customer?.firstName}{" "}
                {order.customer?.lastName}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">
                Phone
              </div>

              <div className="font-medium mt-1">
                {order.customer?.phone ||
                  "-"}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">
                Email
              </div>

              <div className="font-medium mt-1">
                {order.customer?.email ||
                  "-"}
              </div>
            </div>

          </div>

        </div>


        <div className="rounded-xl border bg-white p-6 shadow-sm">

          <div className="text-sm text-gray-500">
            Order Total
          </div>

          <div className="text-4xl font-bold mt-2">
            $
            {total.toFixed(2)}
          </div>

          <div className="text-sm text-gray-500 mt-2">
            {order.garments?.length || 0} garments
          </div>

        </div>

      </div>


      {/* PAYMENT */}

      <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">

        <div className="flex items-center justify-between mb-5">

          <h2 className="text-lg font-bold">
            Payment
          </h2>

          {order.paymentSummary.balanceRemaining > 0 && (
            <button
              onClick={() =>
                setShowPaymentForm(
                  !showPaymentForm
                )
              }
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              {showPaymentForm
                ? "Cancel"
                : "+ Record Payment"}
            </button>
          )}

        </div>


        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-2">

          <div>
            <div className="text-sm text-gray-500">
              Total Due
            </div>
            <div className="text-xl font-bold mt-1">
              $
              {order.paymentSummary.amountDue.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              Amount Paid
            </div>
            <div className="text-xl font-bold mt-1">
              $
              {order.paymentSummary.amountPaid.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              Balance Remaining
            </div>
            <div className="text-xl font-bold mt-1">
              $
              {order.paymentSummary.balanceRemaining.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">
              Payment Status
            </div>
            <div className="mt-1">
              <span
                className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
                  order.paymentSummary.paymentStatus ===
                  "PAID"
                    ? "bg-green-100 text-green-700"
                    : order.paymentSummary
                        .paymentStatus === "PARTIAL"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {order.paymentSummary.paymentStatus}
              </span>
            </div>
          </div>

        </div>


        {showPaymentForm && (

          <div className="mt-5 rounded-lg border p-5 bg-gray-50">

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
                    onChange={(event) =>
                      setPaymentAmount(
                        event.target.value
                      )
                    }
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
                  onChange={(event) =>
                    setPaymentMethod(
                      event.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2 bg-white"
                >
                  {paymentMethods.map(
                    (method) => (
                      <option
                        key={method}
                        value={method}
                      >
                        {method}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs text-gray-500 mb-1">
                  Note (optional)
                </label>
                <input
                  value={paymentNote}
                  onChange={(event) =>
                    setPaymentNote(
                      event.target.value
                    )
                  }
                  placeholder="e.g. Deposit"
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <button
                onClick={recordPayment}
                disabled={recordingPayment}
                className="rounded-lg bg-black px-5 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {recordingPayment
                  ? "Saving..."
                  : "Save Payment"}
              </button>

            </div>

          </div>

        )}


        {order.payments?.length > 0 && (

          <div className="mt-6 border-t pt-5">

            <h3 className="text-sm font-bold text-gray-500 mb-3">
              Payment History
            </h3>

            <div className="space-y-2">

              {order.payments.map(
                (payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between text-sm border-b pb-2"
                  >
                    <div>
                      <span className="font-medium">
                        {payment.method}
                      </span>
                      {payment.note && (
                        <span className="text-gray-500">
                          {" "}
                          — {payment.note}
                        </span>
                      )}
                      <div className="text-xs text-gray-400">
                        {new Date(
                          payment.createdAt
                        ).toLocaleString()}
                      </div>
                    </div>

                    <div className="font-medium">
                      $
                      {Number(
                        payment.amount
                      ).toFixed(2)}
                    </div>
                  </div>
                )
              )}

            </div>

          </div>

        )}

      </div>


      {/* GARMENTS */}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">

        <div className="p-6 border-b">

          <h2 className="text-lg font-bold">
            Garments
          </h2>

        </div>

        {order.garments?.length ? (

          <table className="w-full">

            <thead className="bg-gray-50">

              <tr>

                <th className="text-left p-4">
                  Garment
                </th>

                <th className="text-left p-4">
                  Service
                </th>

                <th className="text-center p-4">
                  Qty
                </th>

                <th className="text-right p-4">
                  Price
                </th>

                <th className="text-right p-4">
                  Total
                </th>

              </tr>

            </thead>

            <tbody>

              {order.garments.map(
                (garment) => {

                  const lineTotal =
                    Number(
                      garment.price || 0
                    ) *
                    Number(
                      garment.quantity ||
                        1
                    );

                  return (
                    <tr
                      key={
                        garment.id
                      }
                      className="border-t"
                    >

                      <td className="p-4 font-medium">
                        {garment.name}
                      </td>

                      <td className="p-4">
                        {garment.service}
                      </td>

                      <td className="p-4 text-center">
                        {garment.quantity}
                      </td>

                      <td className="p-4 text-right">
                        $
                        {Number(
                          garment.price ||
                            0
                        ).toFixed(2)}
                      </td>

                      <td className="p-4 text-right font-medium">
                        $
                        {lineTotal.toFixed(
                          2
                        )}
                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

            <tfoot>

              <tr className="border-t bg-gray-50">

                <td
                  colSpan={4}
                  className="p-4 text-right font-bold"
                >
                  Total
                </td>

                <td className="p-4 text-right text-xl font-bold">
                  $
                  {total.toFixed(
                    2
                  )}
                </td>

              </tr>

            </tfoot>

          </table>

        ) : (

          <div className="p-8 text-center text-gray-500">
            No garments found.
          </div>

        )}

      </div>


      {/* QUICK ACTION */}

      <div className="mt-8 flex flex-wrap gap-3">

        {order.status ===
          "RECEIVED" && (
          <button
            onClick={() =>
              updateStatus(
                "PROCESSING"
              )
            }
            disabled={updating}
            className="rounded-lg bg-black px-5 py-3 text-white font-medium"
          >
            Start Processing
          </button>
        )}

        {order.status ===
          "PROCESSING" && (
          <button
            onClick={() =>
              updateStatus(
                "READY"
              )
            }
            disabled={updating}
            className="rounded-lg bg-black px-5 py-3 text-white font-medium"
          >
            Mark Ready
          </button>
        )}

        {order.status ===
          "READY" && (
          <button
            onClick={() =>
              updateStatus(
                "PICKED_UP"
              )
            }
            disabled={updating}
            className="rounded-lg bg-black px-5 py-3 text-white font-medium"
          >
            Mark Picked Up
          </button>
        )}

      </div>

    </div>
  );
}