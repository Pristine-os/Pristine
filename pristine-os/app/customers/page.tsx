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

  useEffect(() => {
    fetch("/api/customers")
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
      });
  }, []);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          Customers
        </h1>

        <AddCustomerDialog />
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
            {customers.length === 0 ? (
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
                  className="border-b hover:bg-gray-50"
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