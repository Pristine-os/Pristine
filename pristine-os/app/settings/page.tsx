"use client";

import { useEffect, useState } from "react";
import { STORE_NAME_MAX_LENGTH } from "@/lib/storeSettings";

type StoreSettings = {
  name: string;
  canEdit: boolean;
};

export default function SettingsPage() {
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/store", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Failed to load store settings");
        setStore(data);
        setName(data.name);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load store settings")
      );
  }, []);

  async function save() {
    try {
      setError("");
      setSaved(false);
      setSaving(true);

      const response = await fetch("/api/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save store settings");
      }

      setStore(data);
      setName(data.name);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save store settings");
    } finally {
      setSaving(false);
    }
  }

  const changed = store !== null && name.trim() !== store.name;

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Store Settings</h1>
        <p className="text-gray-500 mt-1">
          {store?.canEdit
            ? "Store-wide details for your business."
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

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        {store === null ? (
          <div className="text-gray-500">Loading store settings...</div>
        ) : (
          <>
            <label htmlFor="store-name" className="block text-sm font-medium mb-2">
              Store name
            </label>
            <input
              id="store-name"
              value={name}
              maxLength={STORE_NAME_MAX_LENGTH}
              readOnly={!store.canEdit}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-lg border px-4 py-3"
            />
            <p className="mt-2 text-xs text-gray-500">
              Shown in the app sidebar for all staff.
            </p>

            {store.canEdit && (
              <button
                onClick={save}
                disabled={saving || !changed}
                className="mt-5 rounded-lg bg-black px-5 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
