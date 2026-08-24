"use client";

import { use, useEffect, useState } from "react";

type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  paymentSummary: {
    amountDue: number;
    amountPaid: number;
    balanceRemaining: number;
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  };
};

type CustomerStats = {
  orderCount: number;
  lifetimeSpending: number;
  totalPaid: number;
  outstandingBalance: number;
  mostRecentOrder: OrderSummary | null;
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  createdAt: string;
  orders: OrderSummary[];
  stats: CustomerStats;
};

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(
      /\w\S*/g,
      (word) =>
        word.charAt(0).toUpperCase() + word.substring(1).toLowerCase()
    );
}

function paymentStatusClasses(status: string) {
  if (status === "PAID") return "bg-green-100 text-green-700";
  if (status === "PARTIAL") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

export default function CustomerDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });

  async function loadCustomer() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/customers/${id}`, {
        cache: "no-store",
      });

      const text = await response.text();
      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Customer API returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.details || data?.error || "Failed to load customer"
        );
      }

      setCustomer(data);
      setForm({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email || "",
      });
    } catch (err) {
      console.error("Failed to load customer:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load customer"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) {
      loadCustomer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveCustomer() {
    if (!customer) return;

    try {
      setSaveError("");
      setSaving(true);

      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const text = await response.text();
      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Update API returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.details || data?.error || "Failed to update customer"
        );
      }

      setCustomer({ ...customer, ...data });
      setEditing(false);
    } catch (err) {
      console.error("Failed to update customer:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to update customer"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8">Loading customer...</div>;
  }

  if (error && !customer) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!customer) {
    return <div className="p-8">Customer not found.</div>;
  }

  const { stats } = customer;

  return (
    <div className="p-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <button
            onClick={() => (window.location.href = "/customers")}
            className="mb-3 text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to Customers
          </button>

          <h1 className="text-3xl font-bold">
            {customer.firstName} {customer.lastName}
          </h1>

          <p className="text-gray-500 mt-1">
            Customer since{" "}
            {new Date(customer.createdAt).toLocaleDateString()}
          </p>
        </div>

        <button
          onClick={() => {
            setSaveError("");
            setForm({
              firstName: customer.firstName,
              lastName: customer.lastName,
              phone: customer.phone,
              email: customer.email || "",
            });
            setEditing(!editing);
          }}
          className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium hover:bg-gray-50"
        >
          {editing ? "Cancel" : "Edit Customer"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* CONTACT / EDIT */}
      <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-5">Contact Information</h2>

        {editing ? (
          <div>
            {saveError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  First Name
                </label>
                <input
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Last Name
                </label>
                <input
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Phone
                </label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Email
                </label>
                <input
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveCustomer}
                disabled={saving}
                className="rounded-lg bg-black px-6 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <div className="text-sm text-gray-500">Full Name</div>
              <div className="font-medium mt-1">
                {customer.firstName} {customer.lastName}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">Phone</div>
              <div className="font-medium mt-1">{customer.phone || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-gray-500">Email</div>
              <div className="font-medium mt-1">
                {customer.email || "-"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STATS */}
      <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-5">Account Summary</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          <div>
            <div className="text-sm text-gray-500">Orders</div>
            <div className="text-xl font-bold mt-1">{stats.orderCount}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500">Lifetime Spending</div>
            <div className="text-xl font-bold mt-1">
              ${stats.lifetimeSpending.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">Total Paid</div>
            <div className="text-xl font-bold mt-1">
              ${stats.totalPaid.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">Outstanding Balance</div>
            <div className="text-xl font-bold mt-1">
              ${stats.outstandingBalance.toFixed(2)}
            </div>
          </div>

          <div className="col-span-2">
            <div className="text-sm text-gray-500">Most Recent Order</div>
            {stats.mostRecentOrder ? (
              <a
                href={`/orders/${stats.mostRecentOrder.id}`}
                className="font-medium mt-1 block text-blue-600 hover:text-blue-800"
              >
                {stats.mostRecentOrder.orderNumber} —{" "}
                {new Date(
                  stats.mostRecentOrder.createdAt
                ).toLocaleDateString()}
              </a>
            ) : (
              <div className="font-medium mt-1">-</div>
            )}
          </div>
        </div>
      </div>

      {/* ORDER HISTORY */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-lg font-bold">Order History</h2>
        </div>

        {customer.orders.length ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Order</th>
                <th className="text-left p-4">Date</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4">Total</th>
                <th className="text-right p-4">Paid</th>
                <th className="text-right p-4">Remaining</th>
                <th className="text-left p-4">Payment</th>
              </tr>
            </thead>

            <tbody>
              {customer.orders.map((order) => (
                <tr key={order.id} className="border-t hover:bg-gray-50">
                  <td className="p-4 font-medium">
                    <a
                      href={`/orders/${order.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {order.orderNumber}
                    </a>
                  </td>

                  <td className="p-4 text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>

                  <td className="p-4">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm">
                      {formatStatus(order.status)}
                    </span>
                  </td>

                  <td className="p-4 text-right">
                    ${order.paymentSummary.amountDue.toFixed(2)}
                  </td>

                  <td className="p-4 text-right">
                    ${order.paymentSummary.amountPaid.toFixed(2)}
                  </td>

                  <td className="p-4 text-right">
                    ${order.paymentSummary.balanceRemaining.toFixed(2)}
                  </td>

                  <td className="p-4">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${paymentStatusClasses(
                        order.paymentSummary.paymentStatus
                      )}`}
                    >
                      {order.paymentSummary.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No orders found.
          </div>
        )}
      </div>
    </div>
  );
}
