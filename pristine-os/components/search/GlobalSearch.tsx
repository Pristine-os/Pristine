"use client";

import { useEffect, useRef, useState } from "react";

type CustomerResult = {
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

type OrderResult = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
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

type SearchResponse = {
  query: string;
  customers: CustomerResult[];
  orders: OrderResult[];
};

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

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults(null);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

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

        setResults(data);
        setOpen(true);
      } catch (err) {
        console.error("Search error:", err);
        setError(
          err instanceof Error ? err.message : "Search failed"
        );
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function goTo(path: string) {
    setOpen(false);
    setQuery("");
    setResults(null);
    window.location.href = path;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      setResults(null);
      return;
    }

    if (event.key === "Enter") {
      const topCustomer = results?.customers[0];
      const topOrder = results?.orders[0];

      if (topCustomer) {
        goTo(`/customers/${topCustomer.id}`);
      } else if (topOrder) {
        goTo(`/orders/${topOrder.id}`);
      }
    }
  }

  const trimmedQuery = query.trim();
  const hasResults =
    !!results && (results.customers.length > 0 || results.orders.length > 0);
  const showNoResults =
    open && !loading && !!results && trimmedQuery.length >= 2 && !hasResults;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search customers or orders — name, phone, email, order #"
        className="w-full rounded-lg border px-4 py-2 bg-white"
      />

      {open && (loading || error || hasResults || showNoResults) && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border bg-white shadow-lg max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="p-4 text-sm text-gray-500">Searching...</div>
          )}

          {!loading && error && (
            <div className="p-4 text-sm text-red-600">{error}</div>
          )}

          {!loading && !error && hasResults && (
            <>
              {results!.customers.length > 0 && (
                <div className="border-b">
                  <div className="px-4 pt-3 pb-1 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Customers
                  </div>

                  {results!.customers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => goTo(`/customers/${customer.id}`)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-t first:border-t-0 flex items-center justify-between gap-4"
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

              {results!.orders.length > 0 && (
                <div>
                  <div className="px-4 pt-3 pb-1 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Orders
                  </div>

                  {results!.orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => goTo(`/orders/${order.id}`)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-t first:border-t-0 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-medium">{order.orderNumber}</div>
                        <div className="text-sm text-gray-500">
                          {order.customer.firstName} {order.customer.lastName}
                          {" — "}
                          {new Date(order.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="text-right text-sm shrink-0">
                        <div className="font-medium">
                          ${order.total.toFixed(2)}
                        </div>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs mt-1 ${paymentStatusClasses(
                            order.paymentSummary.paymentStatus
                          )}`}
                        >
                          {order.paymentSummary.paymentStatus}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {showNoResults && (
            <div className="p-4">
              <div className="text-sm text-gray-500 mb-3">
                No matches for &ldquo;{trimmedQuery}&rdquo;.
              </div>

              <a
                href="/customers"
                className="inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                + Create New Customer
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
