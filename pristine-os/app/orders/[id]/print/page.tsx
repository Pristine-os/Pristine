"use client";

import { use, useEffect, useState } from "react";
import CodeBarcode from "@/components/barcode/CodeBarcode";
import { STORE_DEFAULTS, customerFacingName } from "@/lib/storeSettings";

type StoreProfile = {
  displayName: string | null;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  businessHours: string | null;
  receiptFooter: string | null;
};

type Customer = {
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
  prepayDiscount: boolean;
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

export default function PrintOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [order, setOrder] =
    useState<Order | null>(null);

  const [loading, setLoading] =
    useState(true);

  // Unset fields (or a failed load) fall back to the original receipt text.
  const [store, setStore] =
    useState<StoreProfile | null>(null);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function loadOrder() {
      const storeRequest = fetch("/api/store", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);

      try {
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
            `Invalid server response. HTTP ${response.status}`
          );
        }

        if (!response.ok) {
          throw new Error(
            data?.details ||
              data?.error ||
              "Failed to load order"
          );
        }

        // Store first, so the auto-print below never fires before the
        // store details are on the page.
        setStore(await storeRequest);
        setOrder(data);
      } catch (error) {
        console.error(
          "Print order error:",
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

    if (id) {
      loadOrder();
    }
  }, [id]);

  useEffect(() => {
    if (order) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [order]);

  if (loading) {
    return (
      <div className="p-8 text-center">
        Loading ticket...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        {error}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center">
        Order not found.
      </div>
    );
  }

  const calculatedTotal =
    order.garments?.reduce(
      (sum, garment) =>
        sum +
        Number(garment.price || 0) *
          Number(garment.quantity || 1),
      0
    ) || Number(order.total || 0);

  const storeName = customerFacingName(store);

  const storeContactLines = [
    store?.addressLine1,
    store?.addressLine2,
    [store?.city, [store?.region, store?.postalCode].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
    [store?.phone, store?.email].filter(Boolean).join(" · "),
  ].filter((line): line is string => Boolean(line));

  return (
    <>
      <div className="min-h-screen bg-gray-100 py-8">

        <div className="mx-auto w-[380px] bg-white p-8 shadow-lg print:shadow-none">

          {/* BUSINESS NAME */}

          <div className="text-center border-b pb-5">

            <h1 className="text-2xl font-bold">
              {storeName.toUpperCase()}
            </h1>

            <p className="text-sm text-gray-500 mt-1">
              {store?.tagline || STORE_DEFAULTS.tagline}
            </p>

            {storeContactLines.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                {storeContactLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}

          </div>


          {/* ORDER */}

          <div className="py-5 border-b">

            <div className="flex justify-between">

              <div>
                <p className="text-xs text-gray-500">
                  ORDER
                </p>

                <p className="font-bold text-lg">
                  {order.orderNumber}
                </p>
              </div>

              <div className="text-right">

                <p className="text-xs text-gray-500">
                  STATUS
                </p>

                <p className="font-bold">
                  {formatStatus(
                    order.status
                  )}
                </p>

              </div>

            </div>

            <p className="text-sm text-gray-500 mt-3">
              {new Date(
                order.createdAt
              ).toLocaleString()}
            </p>

            <div className="mt-4 flex flex-col items-center">
              <CodeBarcode value={order.orderNumber} height={45} />
              <p className="text-sm font-mono tracking-wide mt-1">
                {order.orderNumber}
              </p>
            </div>

          </div>


          {/* CUSTOMER */}

          <div className="py-5 border-b">

            <p className="text-xs text-gray-500">
              CUSTOMER
            </p>

            <p className="font-bold text-lg">
              {order.customer.firstName}{" "}
              {order.customer.lastName}
            </p>

            <p className="text-sm">
              {order.customer.phone}
            </p>

            {order.customer.email && (
              <p className="text-sm">
                {order.customer.email}
              </p>
            )}

          </div>


          {/* GARMENTS */}

          <div className="py-5 border-b">

            <p className="text-xs text-gray-500 mb-3">
              ITEMS
            </p>

            {order.garments.map(
              (garment) => {

                const lineTotal =
                  Number(
                    garment.price || 0
                  ) *
                  Number(
                    garment.quantity || 1
                  );

                return (
                  <div
                    key={garment.id}
                    className="mb-4"
                  >

                    <div className="flex justify-between">

                      <div className="font-medium">
                        {garment.quantity} ×{" "}
                        {garment.name}
                      </div>

                      <div className="font-medium">
                        $
                        {lineTotal.toFixed(
                          2
                        )}
                      </div>

                    </div>

                    <div className="text-sm text-gray-500">
                      {garment.service}
                    </div>

                    {garment.prepayDiscount && (
                      <div className="text-sm font-medium">
                        20% Prepay Discount
                      </div>
                    )}

                  </div>
                );
              }
            )}

          </div>


          {/* TOTAL */}

          <div className="py-5">

            <div className="flex justify-between text-xl font-bold">

              <span>
                TOTAL
              </span>

              <span>
                $
                {calculatedTotal.toFixed(
                  2
                )}
              </span>

            </div>

          </div>


          {/* FOOTER */}

          <div className="border-t pt-5 text-center text-xs text-gray-500">

            <p className="font-medium text-gray-700">
              Thank you for choosing{" "}
              {storeName}
            </p>

            <p className="mt-2 whitespace-pre-line">
              {store?.receiptFooter || STORE_DEFAULTS.receiptFooter}
            </p>

            {store?.businessHours && (
              <p className="mt-2 whitespace-pre-line">
                {store.businessHours}
              </p>
            )}

            <p className="mt-3">
              {order.orderNumber}
            </p>

          </div>

        </div>

      </div>


      {/* PRINT STYLES */}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            margin: 0;
          }

          @page {
            size: auto;
            margin: 0.4in;
          }

          .print\\:shadow-none {
            box-shadow: none !important;
          }
        }
      `}</style>
    </>
  );
}