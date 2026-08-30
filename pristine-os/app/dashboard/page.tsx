"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/components/auth/LogoutButton";

type OrderCard = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
  };
  paymentSummary: {
    amountDue: number;
    amountPaid: number;
    balanceRemaining: number;
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  };
};

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  createdAt: string;
  order: { id: string; orderNumber: string };
  customer: { id: string; firstName: string; lastName: string };
};

type DashboardData = {
  metrics: {
    ordersToday: number;
    ordersReceived: number;
    ordersProcessing: number;
    ordersReady: number;
    ordersPickedUpToday: number;
    revenueToday: number;
    outstandingBalance: number;
    customersServedToday: number;
  };
  recentOrders: OrderCard[];
  readyQueue: OrderCard[];
  processingQueue: OrderCard[];
  requiringPayment: OrderCard[];
  recentPayments: PaymentRow[];
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

function statusClasses(status: string) {
  if (status === "READY") return "bg-blue-100 text-blue-700";
  if (status === "PROCESSING") return "bg-yellow-100 text-yellow-700";
  if (status === "PICKED_UP") return "bg-green-100 text-green-700";
  if (status === "CANCELLED") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

function paymentStatusClasses(status: string) {
  if (status === "PAID") return "bg-green-100 text-green-700";
  if (status === "PARTIAL") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function CustomerLink({
  customer,
}: {
  customer: { id: string; firstName: string; lastName: string };
}) {
  return (
    <a
      href={`/customers/${customer.id}`}
      className="text-blue-600 hover:text-blue-800"
    >
      {customer.firstName} {customer.lastName}
    </a>
  );
}

function OrderLink({ order }: { order: { id: string; orderNumber: string } }) {
  return (
    <a
      href={`/orders/${order.id}`}
      className="font-medium text-blue-600 hover:text-blue-800"
    >
      {order.orderNumber}
    </a>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/dashboard", {
        cache: "no-store",
      });

      const text = await response.text();
      let json: any;

      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Dashboard API returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          json?.details || json?.error || "Failed to load dashboard"
        );
      }

      setData(json);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { metrics } = data;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Today's snapshot of orders, pickups, and payments.
          </p>
        </div>

        <LogoutButton />
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* PRIMARY METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Orders Today" value={metrics.ordersToday} />
        <StatCard label="Received" value={metrics.ordersReceived} />
        <StatCard label="Processing" value={metrics.ordersProcessing} />
        <StatCard label="Ready for Pickup" value={metrics.ordersReady} />
        <StatCard
          label="Picked Up Today"
          value={metrics.ordersPickedUpToday}
        />
        <StatCard
          label="Revenue Today"
          value={`$${metrics.revenueToday.toFixed(2)}`}
        />
        <StatCard
          label="Outstanding Balance"
          value={`$${metrics.outstandingBalance.toFixed(2)}`}
        />
        <StatCard
          label="Customers Served Today"
          value={metrics.customersServedToday}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* READY FOR PICKUP */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b">
            <h2 className="text-lg font-bold">Ready for Pickup</h2>
          </div>

          {data.readyQueue.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No orders are waiting for pickup.
            </div>
          ) : (
            <div className="divide-y">
              {data.readyQueue.map((order) => (
                <div
                  key={order.id}
                  className="p-4 flex items-center justify-between"
                >
                  <div>
                    <OrderLink order={order} />
                    <div className="text-sm text-gray-500">
                      <CustomerLink customer={order.customer} />
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-medium">
                      ${order.total.toFixed(2)}
                    </div>
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium mt-1 ${paymentStatusClasses(
                        order.paymentSummary.paymentStatus
                      )}`}
                    >
                      {order.paymentSummary.paymentStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PROCESSING */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b">
            <h2 className="text-lg font-bold">Currently Processing</h2>
          </div>

          {data.processingQueue.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No orders are currently processing.
            </div>
          ) : (
            <div className="divide-y">
              {data.processingQueue.map((order) => (
                <div
                  key={order.id}
                  className="p-4 flex items-center justify-between"
                >
                  <div>
                    <OrderLink order={order} />
                    <div className="text-sm text-gray-500">
                      <CustomerLink customer={order.customer} />
                    </div>
                  </div>

                  <div className="text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* REQUIRING PAYMENT */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b">
            <h2 className="text-lg font-bold">Orders Requiring Payment</h2>
          </div>

          {data.requiringPayment.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              All orders are fully paid.
            </div>
          ) : (
            <div className="divide-y">
              {data.requiringPayment.map((order) => (
                <div
                  key={order.id}
                  className="p-4 flex items-center justify-between"
                >
                  <div>
                    <OrderLink order={order} />
                    <div className="text-sm text-gray-500">
                      <CustomerLink customer={order.customer} />
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-medium">
                      ${order.paymentSummary.balanceRemaining.toFixed(2)} due
                    </div>
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium mt-1 ${paymentStatusClasses(
                        order.paymentSummary.paymentStatus
                      )}`}
                    >
                      {order.paymentSummary.paymentStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RECENT PAYMENTS */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b">
            <h2 className="text-lg font-bold">Recent Payments</h2>
          </div>

          {data.recentPayments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No payments recorded yet.
            </div>
          ) : (
            <div className="divide-y">
              {data.recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="p-4 flex items-center justify-between"
                >
                  <div>
                    <OrderLink order={payment.order} />
                    <div className="text-sm text-gray-500">
                      <CustomerLink customer={payment.customer} /> —{" "}
                      {payment.method}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-medium">
                      ${Number(payment.amount).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(payment.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RECENT ORDERS */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">Recent Orders</h2>
        </div>

        {data.recentOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No orders found.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Order</th>
                <th className="text-left p-4">Customer</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4">Total</th>
                <th className="text-left p-4">Payment</th>
                <th className="text-left p-4">Date</th>
              </tr>
            </thead>

            <tbody>
              {data.recentOrders.map((order) => (
                <tr key={order.id} className="border-t hover:bg-gray-50">
                  <td className="p-4">
                    <OrderLink order={order} />
                  </td>

                  <td className="p-4">
                    <CustomerLink customer={order.customer} />
                  </td>

                  <td className="p-4">
                    <span
                      className={`rounded-full px-3 py-1 text-sm ${statusClasses(
                        order.status
                      )}`}
                    >
                      {formatStatus(order.status)}
                    </span>
                  </td>

                  <td className="p-4 text-right font-medium">
                    ${order.total.toFixed(2)}
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

                  <td className="p-4 text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
