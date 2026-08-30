"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
};

type Garment = {
  name: string;
  service: string;
  quantity: number;
  price: number;
  prepayDiscount: boolean;
};

type PriceEntry = {
  garmentType: string;
  service: string;
  price: number;
};

type PricingCatalog = {
  garmentTypes: string[];
  services: string[];
  prices: PriceEntry[];
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
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

export default function OrdersPage() {
  const [orders, setOrders] =
    useState<Order[]>([]);

  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  const [error, setError] =
    useState("");

  const [showForm, setShowForm] =
    useState(false);

  const [customerId, setCustomerId] =
    useState("");

  const [status, setStatus] =
    useState("RECEIVED");

  const [garments, setGarments] =
    useState<Garment[]>([
      {
        name: "",
        service: "",
        quantity: 1,
        price: 0,
        prepayDiscount: false,
      },
    ]);

  const [catalog, setCatalog] =
    useState<PricingCatalog | null>(null);

  function lookupPrice(
    garmentType: string,
    service: string
  ): number {
    const match = catalog?.prices.find(
      (entry) =>
        entry.garmentType === garmentType &&
        entry.service === service
    );

    return match ? match.price : 0;
  }

  function blankGarment(): Garment {
    const name = catalog?.garmentTypes[0] || "";
    const service = catalog?.services[0] || "";

    return {
      name,
      service,
      quantity: 1,
      price: lookupPrice(name, service),
      prepayDiscount: false,
    };
  }


  /*
   * Load customers
   */

  async function loadCustomers() {
    try {
      const response =
        await fetch(
          "/api/customers",
          {
            cache: "no-store",
          }
        );

      const text =
        await response.text();

      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          "Customer API returned invalid JSON."
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load customers."
        );
      }

      if (Array.isArray(data)) {
        setCustomers(data);
      } else {
        setCustomers([]);
      }

    } catch (error) {
      console.error(
        "Failed to load customers:",
        error
      );
    }
  }


  /*
   * Load orders
   */

  async function loadOrders() {
    try {
      setLoading(true);

      const response =
        await fetch(
          "/api/orders",
          {
            cache: "no-store",
          }
        );

      const text =
        await response.text();

      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Orders API returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.details ||
            data?.error ||
            "Failed to load orders."
        );
      }

      if (Array.isArray(data)) {
        setOrders(data);
      } else {
        setOrders([]);
      }

    } catch (error) {
      console.error(
        "Failed to load orders:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to load orders."
      );

    } finally {
      setLoading(false);
    }
  }


  /*
   * Load pricing catalog
   */

  async function loadPricing() {
    try {
      const response =
        await fetch(
          "/api/pricing",
          {
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load pricing."
        );
      }

      setCatalog(data);

      const garmentType =
        data.garmentTypes?.[0] || "";

      const service =
        data.services?.[0] || "";

      setGarments((current) =>
        current.length === 1 &&
        !current[0].name &&
        !current[0].service
          ? [
              {
                name: garmentType,
                service,
                quantity: 1,
                price: data.prices?.find(
                  (entry: PriceEntry) =>
                    entry.garmentType ===
                      garmentType &&
                    entry.service === service
                )?.price || 0,
                prepayDiscount: false,
              },
            ]
          : current
      );

    } catch (error) {
      console.error(
        "Failed to load pricing:",
        error
      );
    }
  }


  useEffect(() => {
    loadCustomers();
    loadOrders();
    loadPricing();
  }, []);


  /*
   * Add garment
   */

  function addGarment() {
    setGarments([
      ...garments,
      blankGarment(),
    ]);
  }


  /*
   * Remove garment
   */

  function removeGarment(
    index: number
  ) {
    if (garments.length === 1) {
      return;
    }

    setGarments(
      garments.filter(
        (_, i) => i !== index
      )
    );
  }


  /*
   * Update garment
   */

  function updateGarment(
    index: number,
    field: keyof Garment,
    value: string | number | boolean
  ) {
    setGarments(
      garments.map((garment, i) => {
        if (i !== index) {
          return garment;
        }

        const updated = {
          ...garment,
          [field]: value,
        };

        /*
         * Re-price the line whenever the
         * garment or service changes so the
         * catalog default is always applied
         * first — the price field itself can
         * still be edited afterward as an
         * override.
         */

        if (field === "name" || field === "service") {
          updated.price = lookupPrice(
            updated.name,
            updated.service
          );
        }

        return updated;
      })
    );
  }


  /*
   * Calculate total
   */

  const orderTotal =
    garments.reduce(
      (total, garment) =>
        total +
        Number(garment.quantity) *
          Number(garment.price),
      0
    );


  /*
   * Create order
   */

  async function createOrder() {
    try {
      setError("");

      if (!customerId) {
        setError(
          "Please select a customer."
        );
        return;
      }

      const validGarments =
        garments.filter(
          (garment) =>
            garment.name.trim() !== ""
        );

      if (
        validGarments.length === 0
      ) {
        setError(
          "Please add at least one garment."
        );
        return;
      }

      setCreating(true);

      const response =
        await fetch(
          "/api/orders",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              customerId,
              status,
              garments:
                validGarments.map(
                  (garment) => ({
                    name:
                      garment.name.trim(),

                    service:
                      garment.service,

                    quantity:
                      Number(
                        garment.quantity
                      ),

                    price:
                      Number(
                        garment.price
                      ),

                    prepayDiscount:
                      garment.prepayDiscount === true,
                  })
                ),
            }),
          }
        );

      const text =
        await response.text();

      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Create order returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.details ||
            data?.error ||
            "Failed to create order."
        );
      }

      /*
       * Reset form
       */

      setCustomerId("");

      setStatus("RECEIVED");

      setGarments([
        {
          name: "",
          service: "Dry Clean",
          quantity: 1,
          price: 0,
          prepayDiscount: false,
        },
      ]);

      setShowForm(false);

      /*
       * Reload orders
       */

      await loadOrders();

      /*
       * Open newly created order
       */

      if (data?.id) {
        window.location.href =
          `/orders/${data.id}`;
      }

    } catch (error) {
      console.error(
        "Create order error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to create order."
      );

    } finally {
      setCreating(false);
    }
  }


  return (
    <div className="p-8">

      {/* HEADER */}

      <div className="flex items-center justify-between mb-8">

        <div>

          <h1 className="text-3xl font-bold">
            Orders
          </h1>

          <p className="text-gray-500 mt-1">
            Manage customer orders
          </p>

        </div>


        <button
          onClick={() =>
            setShowForm(
              !showForm
            )
          }
          className="rounded-lg bg-black px-5 py-3 text-white font-medium hover:bg-gray-800"
        >
          {showForm
            ? "Cancel"
            : "+ New Order"}
        </button>

      </div>


      {/* ERROR */}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}


      {/* NEW ORDER FORM */}

      {showForm && (
        <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">

          <h2 className="text-xl font-bold mb-6">
            Create New Order
          </h2>


          {/* CUSTOMER */}

          <div className="mb-6">

            <label className="block text-sm font-medium mb-2">
              Customer
            </label>

            <select
              value={customerId}
              onChange={(event) =>
                setCustomerId(
                  event.target.value
                )
              }
              className="w-full rounded-lg border px-4 py-3 bg-white"
            >

              <option value="">
                Select customer
              </option>

              {customers.map(
                (customer) => (
                  <option
                    key={customer.id}
                    value={customer.id}
                  >
                    {customer.firstName}{" "}
                    {customer.lastName}{" "}
                    —{" "}
                    {customer.phone}
                  </option>
                )
              )}

            </select>

          </div>


          {/* STATUS */}

          <div className="mb-6">

            <label className="block text-sm font-medium mb-2">
              Status
            </label>

            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value
                )
              }
              className="rounded-lg border px-4 py-3 bg-white"
            >

              {statuses.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item.replace(
                      "_",
                      " "
                    )}
                  </option>
                )
              )}

            </select>

          </div>


          {/* GARMENTS */}

          <div>

            <div className="flex items-center justify-between mb-4">

              <h3 className="font-bold">
                Garments
              </h3>

              <button
                type="button"
                onClick={
                  addGarment
                }
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                + Add Garment
              </button>

            </div>


            <div className="space-y-4">

              {garments.map(
                (
                  garment,
                  index
                ) => (

                  <div
                    key={index}
                    className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-lg border p-4"
                  >

                    {/* NAME */}

                    <div className="md:col-span-4">

                      <label className="block text-xs text-gray-500 mb-1">
                        Garment
                      </label>

                      <select
                        value={
                          garment.name
                        }
                        onChange={(
                          event
                        ) =>
                          updateGarment(
                            index,
                            "name",
                            event.target
                              .value
                          )
                        }
                        className="w-full rounded-lg border px-3 py-2 bg-white"
                      >

                        {(catalog?.garmentTypes || []).map(
                          (garmentType) => (
                            <option
                              key={
                                garmentType
                              }
                              value={
                                garmentType
                              }
                            >
                              {garmentType}
                            </option>
                          )
                        )}

                      </select>

                    </div>


                    {/* SERVICE */}

                    <div className="md:col-span-3">

                      <label className="block text-xs text-gray-500 mb-1">
                        Service
                      </label>

                      <select
                        value={
                          garment.service
                        }
                        onChange={(
                          event
                        ) =>
                          updateGarment(
                            index,
                            "service",
                            event.target
                              .value
                          )
                        }
                        className="w-full rounded-lg border px-3 py-2 bg-white"
                      >

                        {(catalog?.services || []).map(
                          (service) => (
                            <option
                              key={
                                service
                              }
                              value={
                                service
                              }
                            >
                              {service}
                            </option>
                          )
                        )}

                      </select>

                    </div>


                    {/* QUANTITY */}

                    <div className="md:col-span-2">

                      <label className="block text-xs text-gray-500 mb-1">
                        Qty
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={
                          garment.quantity
                        }
                        onChange={(
                          event
                        ) =>
                          updateGarment(
                            index,
                            "quantity",
                            Math.max(
                              1,
                              Number(
                                event.target
                                  .value
                              )
                            )
                          )
                        }
                        className="w-full rounded-lg border px-3 py-2"
                      />

                    </div>


                    {/* PRICE */}

                    <div className="md:col-span-2">

                      <label className="block text-xs text-gray-500 mb-1">
                        Price
                      </label>

                      <div className="relative">

                        <span className="absolute left-3 top-2 text-gray-500">
                          $
                        </span>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            garment.price
                          }
                          onChange={(
                            event
                          ) =>
                            updateGarment(
                              index,
                              "price",
                              Math.max(
                                0,
                                Number(
                                  event
                                    .target
                                    .value
                                )
                              )
                            )
                          }
                          className="w-full rounded-lg border pl-7 pr-3 py-2"
                        />

                      </div>

                    </div>


                    {/* REMOVE */}

                    <div className="md:col-span-1 flex items-end">

                      <button
                        type="button"
                        onClick={() =>
                          removeGarment(
                            index
                          )
                        }
                        className="w-full rounded-lg border px-3 py-2 text-red-600 hover:bg-red-50"
                      >
                        ×
                      </button>

                    </div>


                    {/* PREPAY DISCOUNT NOTATION */}

                    <div className="md:col-span-12">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={garment.prepayDiscount}
                          onChange={(event) =>
                            updateGarment(
                              index,
                              "prepayDiscount",
                              event.target.checked
                            )
                          }
                        />
                        20% Prepay Discount
                      </label>
                    </div>

                  </div>

                )
              )}

            </div>

          </div>


          {/* TOTAL */}

          <div className="mt-6 flex justify-end">

            <div className="w-full md:w-80 rounded-lg bg-gray-50 p-5">

              <div className="flex justify-between text-lg font-bold">

                <span>
                  Order Total
                </span>

                <span>
                  $
                  {orderTotal.toFixed(
                    2
                  )}
                </span>

              </div>

            </div>

          </div>


          {/* CREATE */}

          <div className="mt-6 flex justify-end">

            <button
              type="button"
              onClick={
                createOrder
              }
              disabled={creating}
              className="rounded-lg bg-black px-6 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {creating
                ? "Creating..."
                : "Create Order"}
            </button>

          </div>

        </div>
      )}


      {/* ORDERS TABLE */}

      <div className="rounded-xl border bg-white overflow-hidden">

        {loading ? (

          <div className="p-8 text-center text-gray-500">
            Loading orders...
          </div>

        ) : orders.length === 0 ? (

          <div className="p-8 text-center">

            <p className="text-gray-500">
              No orders found.
            </p>

            <button
              onClick={() =>
                setShowForm(true)
              }
              className="mt-4 text-blue-600 font-medium"
            >
              Create your first order
            </button>

          </div>

        ) : (

          <table className="w-full">

            <thead className="bg-gray-50">

              <tr>

                <th className="text-left p-4">
                  Order
                </th>

                <th className="text-left p-4">
                  Customer
                </th>

                <th className="text-left p-4">
                  Status
                </th>

                <th className="text-left p-4">
                  Items
                </th>

                <th className="text-right p-4">
                  Total
                </th>

                <th className="text-left p-4">
                  Date
                </th>

              </tr>

            </thead>


            <tbody>

              {orders.map(
                (order) => (

                  <tr
                    key={order.id}
                    onClick={() =>
                      window.location.href =
                        `/orders/${order.id}`
                    }
                    className="border-t hover:bg-gray-50 cursor-pointer"
                  >

                    <td className="p-4 font-medium">
                      {order.orderNumber}
                    </td>

                    <td className="p-4">

                      {order.customer
                        ?.firstName}{" "}

                      {order.customer
                        ?.lastName}

                    </td>

                    <td className="p-4">

                      <span className="rounded-full bg-gray-100 px-3 py-1 text-sm">
                        {order.status.replace(
                          "_",
                          " "
                        )}
                      </span>

                    </td>

                    <td className="p-4">
                      {order.garments
                        ?.length || 0}
                    </td>

                    <td className="p-4 text-right font-medium">
                      $
                      {Number(
                        order.total || 0
                      ).toFixed(2)}
                    </td>

                    <td className="p-4 text-gray-500">

                      {new Date(
                        order.createdAt
                      ).toLocaleDateString()}

                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        )}

      </div>

    </div>
  );
}