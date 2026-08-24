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

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  garments: Garment[];
};

const statuses = [
  "RECEIVED",
  "PROCESSING",
  "READY",
  "PICKED_UP",
  "CANCELLED",
];

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