"use client";

import { useEffect, useState } from "react";
import AddCustomerDialog from "@/components/customers/AddCustomerDialog";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);

      const query = search.trim()
        ? `?search=${encodeURIComponent(search.trim())}`
        : "";

      fetch(`/api/customers${query}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setCustomers(data);
          } else {
            console.error("Customer API error:", data);
            setCustomers([]);
          }
        })
        .catch((error) => {
          console.error("Failed to load customers:", error);
          setCustomers([]);
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          Customers
        </h1>

        <AddCustomerDialog />
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email"
          className="w-full max-w-md rounded-lg border px-4 py-2"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr className="border-b">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Phone</th>
              <th className="text-left p-3">Email</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={3}
                  className="p-6 text-center text-gray-500"
                >
                  Loading customers...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="p-6 text-center text-gray-500"
                >
                  No customers found.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() =>
                    (window.location.href = `/customers/${customer.id}`)
                  }
                  className="border-b hover:bg-gray-50 cursor-pointer"
                >
                  <td className="p-3">
                    {customer.firstName} {customer.lastName}
                  </td>

                  <td className="p-3">
                    {customer.phone}
                  </td>

                  <td className="p-3">
                    {customer.email || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
