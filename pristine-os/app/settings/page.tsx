"use client";

import { useEffect, useState } from "react";
import {
  STORE_NAME_MAX_LENGTH,
  STORE_PROFILE_FIELDS,
  type StoreProfileField,
} from "@/lib/storeSettings";

type StoreSettings = Record<StoreProfileField, string | null> & {
  name: string;
  readyNotificationsEnabled: boolean;
  defaults: Record<string, string>;
  canEdit: boolean;
};

type Form = Record<StoreProfileField | "name", string> & {
  readyNotificationsEnabled: boolean;
};

const SECTIONS: { title: string; fields: StoreProfileField[] }[] = [
  { title: "Receipts and customer messages", fields: ["displayName", "tagline", "receiptFooter"] },
  { title: "Contact", fields: ["phone", "email"] },
  { title: "Address", fields: ["addressLine1", "addressLine2", "city", "region", "postalCode"] },
  { title: "Business hours", fields: ["businessHours"] },
];

function toForm(store: StoreSettings): Form {
  const form = { name: store.name, readyNotificationsEnabled: store.readyNotificationsEnabled } as Form;
  for (const section of SECTIONS) {
    for (const field of section.fields) form[field] = store[field] ?? "";
  }
  return form;
}

export default function SettingsPage() {
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/store", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Failed to load store settings");
        setStore(data);
        setForm(toForm(data));
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load store settings")
      );
  }, []);

  function update<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setSaved(false);
  }

  async function save() {
    if (!form) return;

    try {
      setError("");
      setSaved(false);
      setSaving(true);

      const response = await fetch("/api/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save store settings");
      }

      setStore(data);
      setForm(toForm(data));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save store settings");
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !store?.canEdit;

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Store Settings</h1>
        <p className="text-gray-500 mt-1">
          {store?.canEdit
            ? "Store-wide details used across the app, on receipts and in customer messages. Leave a field blank to use the default."
            : "Store-wide details. Only an Owner can make changes."}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
          Store settings saved.
        </div>
      )}

      {store === null || form === null ? (
        <div className="rounded-xl border bg-white p-6 shadow-sm text-gray-500">
          Loading store settings...
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-4">Store</h2>
            <label htmlFor="store-name" className="block text-sm font-medium mb-1">
              Store name
            </label>
            <input
              id="store-name"
              value={form.name}
              maxLength={STORE_NAME_MAX_LENGTH}
              readOnly={readOnly}
              onChange={(e) => update("name", e.target.value)}
              className="w-full rounded-lg border px-4 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">Shown in the app sidebar for all staff.</p>
          </section>

          {SECTIONS.map((section) => (
            <section key={section.title} className="rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold mb-4">{section.title}</h2>
              <div className="space-y-4">
                {section.fields.map((field) => {
                  const spec = STORE_PROFILE_FIELDS[field];
                  const placeholder = store.defaults[field] ?? "";
                  const common = {
                    id: `store-${field}`,
                    value: form[field],
                    maxLength: spec.max,
                    readOnly,
                    placeholder,
                    className: "w-full rounded-lg border px-4 py-2",
                  };

                  return (
                    <div key={field}>
                      <label htmlFor={common.id} className="block text-sm font-medium mb-1">
                        {spec.label}
                      </label>
                      {"multiline" in spec && spec.multiline ? (
                        <textarea
                          {...common}
                          rows={3}
                          onChange={(e) => update(field, e.target.value)}
                        />
                      ) : (
                        <input {...common} onChange={(e) => update(field, e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-4">Notifications</h2>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.readyNotificationsEnabled}
                disabled={readOnly}
                onChange={(e) => update("readyNotificationsEnabled", e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">
                  Automatically notify customers when an order is ready
                </span>
                <span className="block text-sm text-gray-500">
                  When off, staff can still send the ready message manually from the order.
                </span>
              </span>
            </label>
          </section>

          {store.canEdit && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-black px-5 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
