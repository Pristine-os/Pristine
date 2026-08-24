"use client";

import { useEffect, useState } from "react";

type PriceEntry = {
  garmentType: string;
  service: string;
  price: number;
  isCustom: boolean;
};

type PricingData = {
  garmentTypes: string[];
  services: string[];
  prices: PriceEntry[];
};

export default function GarmentsPage() {
  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState("");

  const [newGarmentType, setNewGarmentType] = useState("");
  const [newService, setNewService] = useState("");
  const [newPrice, setNewPrice] = useState("");

  async function loadPricing() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/pricing", {
        cache: "no-store",
      });

      const text = await response.text();
      let json: any;

      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Pricing API returned invalid JSON. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(json?.error || "Failed to load pricing.");
      }

      setData(json);

      if (!newGarmentType && json.garmentTypes?.length) {
        setNewGarmentType(json.garmentTypes[0]);
      }

      if (!newService && json.services?.length) {
        setNewService(json.services[0]);
      }
    } catch (err) {
      console.error("Failed to load pricing:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load pricing."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPricing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function keyFor(garmentType: string, service: string) {
    return `${garmentType}::${service}`;
  }

  async function savePrice(garmentType: string, service: string, price: number) {
    try {
      setSavingKey(keyFor(garmentType, service));
      setError("");

      const response = await fetch("/api/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ garmentType, service, price }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Failed to save price.");
      }

      await loadPricing();
    } catch (err) {
      console.error("Failed to save price:", err);
      setError(err instanceof Error ? err.message : "Failed to save price.");
    } finally {
      setSavingKey("");
    }
  }

  async function resetPrice(garmentType: string, service: string) {
    try {
      setSavingKey(keyFor(garmentType, service));
      setError("");

      const response = await fetch(
        `/api/pricing?garmentType=${encodeURIComponent(
          garmentType
        )}&service=${encodeURIComponent(service)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json?.error || "Failed to reset price.");
      }

      await loadPricing();
    } catch (err) {
      console.error("Failed to reset price:", err);
      setError(err instanceof Error ? err.message : "Failed to reset price.");
    } finally {
      setSavingKey("");
    }
  }

  async function addCustomPrice() {
    const price = Number(newPrice);

    if (!newGarmentType || !newService) {
      setError("Choose a garment type and service.");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid non-negative price.");
      return;
    }

    await savePrice(newGarmentType, newService, price);
    setNewPrice("");
  }

  if (loading) {
    return <div className="p-8">Loading pricing...</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Garments &amp; Pricing</h1>
        <p className="text-gray-500 mt-1">
          Set the default price for each garment and service combination.
          Prices here apply automatically when creating orders, but can
          still be overridden per line item.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="rounded-xl border bg-white overflow-hidden mb-8">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4">Garment</th>
                  <th className="text-left p-4">Service</th>
                  <th className="text-right p-4">Price</th>
                  <th className="text-left p-4">Source</th>
                  <th className="text-right p-4">Actions</th>
                </tr>
              </thead>

              <tbody>
                {data.prices
                  .slice()
                  .sort((a, b) =>
                    a.garmentType === b.garmentType
                      ? a.service.localeCompare(b.service)
                      : a.garmentType.localeCompare(b.garmentType)
                  )
                  .map((entry) => {
                    const key = keyFor(entry.garmentType, entry.service);
                    const busy = savingKey === key;

                    return (
                      <PriceRow
                        key={key}
                        entry={entry}
                        busy={busy}
                        onSave={(price) =>
                          savePrice(entry.garmentType, entry.service, price)
                        }
                        onReset={() =>
                          resetPrice(entry.garmentType, entry.service)
                        }
                      />
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-4">Add a Price</h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Garment
                </label>
                <select
                  value={newGarmentType}
                  onChange={(e) => setNewGarmentType(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 bg-white"
                >
                  {data.garmentTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Service
                </label>
                <select
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 bg-white"
                >
                  {data.services.map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </div>

              <div>
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
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full rounded-lg border pl-7 pr-3 py-2"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <button
                onClick={addCustomPrice}
                className="rounded-lg bg-black px-5 py-2 text-white font-medium hover:bg-gray-800"
              >
                Save Price
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PriceRow({
  entry,
  busy,
  onSave,
  onReset,
}: {
  entry: PriceEntry;
  busy: boolean;
  onSave: (price: number) => void;
  onReset: () => void;
}) {
  const [value, setValue] = useState(String(entry.price));

  useEffect(() => {
    setValue(String(entry.price));
  }, [entry.price]);

  const changed = Number(value) !== entry.price;

  return (
    <tr className="border-t">
      <td className="p-4 font-medium">{entry.garmentType}</td>
      <td className="p-4">{entry.service}</td>
      <td className="p-4 text-right">
        <div className="relative inline-block">
          <span className="absolute left-3 top-2 text-gray-500">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-28 rounded-lg border pl-7 pr-3 py-2 text-right"
          />
        </div>
      </td>
      <td className="p-4">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            entry.isCustom
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {entry.isCustom ? "Custom" : "Default"}
        </span>
      </td>
      <td className="p-4 text-right">
        <div className="flex justify-end gap-2">
          <button
            disabled={busy || !changed}
            onClick={() => onSave(Number(value))}
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
          >
            Save
          </button>

          {entry.isCustom && (
            <button
              disabled={busy}
              onClick={onReset}
              className="rounded-lg border px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Reset
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
