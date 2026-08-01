"use client";

import { useState } from "react";

export default function AddCustomerDialog() {
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });

  async function saveCustomer() {
    await fetch("/api/customers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    setOpen(false);
    window.location.reload();
  }

  return (
    <>
      <button
        className="bg-black text-white px-4 py-2 rounded"
        onClick={() => setOpen(true)}
      >
        Add Customer
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96">
            <h2 className="text-xl font-bold mb-4">
              Add Customer
            </h2>

            {Object.keys(form).map((field) => (
              <input
                key={field}
                className="border p-2 w-full mb-2"
                placeholder={field}
                value={(form as any)[field]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [field]: e.target.value,
                  })
                }
              />
            ))}

            <div className="flex gap-2 mt-4">
              <button
                className="bg-green-600 text-white px-4 py-2 rounded"
                onClick={saveCustomer}
              >
                Save
              </button>

              <button
                className="bg-gray-300 px-4 py-2 rounded"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}