"use client";

import type { GarmentLine, PricingCatalog } from "@/lib/garmentLines";

type GarmentLineEditorProps = {
  garments: GarmentLine[];
  catalog: PricingCatalog | null;
  onUpdate: (
    index: number,
    field: keyof GarmentLine,
    value: string | number | boolean
  ) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

export default function GarmentLineEditor({
  garments,
  catalog,
  onUpdate,
  onRemove,
  onAdd,
}: GarmentLineEditorProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">Garments</h3>

        <button
          type="button"
          onClick={onAdd}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          + Add Garment
        </button>
      </div>

      <div className="space-y-4">
        {garments.map((garment, index) => (
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
                value={garment.name}
                onChange={(event) =>
                  onUpdate(index, "name", event.target.value)
                }
                className="w-full rounded-lg border px-3 py-2 bg-white"
              >
                {(catalog?.garmentTypes || []).map((garmentType) => (
                  <option key={garmentType} value={garmentType}>
                    {garmentType}
                  </option>
                ))}
              </select>
            </div>

            {/* SERVICE */}
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-500 mb-1">
                Service
              </label>
              <select
                value={garment.service}
                onChange={(event) =>
                  onUpdate(index, "service", event.target.value)
                }
                className="w-full rounded-lg border px-3 py-2 bg-white"
              >
                {(catalog?.services || []).map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </div>

            {/* QUANTITY */}
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Qty</label>
              <input
                type="number"
                min="1"
                value={garment.quantity}
                onChange={(event) =>
                  onUpdate(
                    index,
                    "quantity",
                    Math.max(1, Number(event.target.value))
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
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={garment.price}
                  onChange={(event) =>
                    onUpdate(
                      index,
                      "price",
                      Math.max(0, Number(event.target.value))
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
                onClick={() => onRemove(index)}
                disabled={garments.length === 1}
                className="w-full rounded-lg border px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                ×
              </button>
            </div>

            {/* PREPAY DISCOUNT NOTATION */}
            <div className="md:col-span-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={garment.prepayDiscount}
                  onChange={(event) =>
                    onUpdate(index, "prepayDiscount", event.target.checked)
                  }
                />
                20% Prepay Discount
              </label>
            </div>

            {/* PRINT TAG PREFERENCE */}
            <div className="md:col-span-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={garment.printTag}
                  onChange={(event) =>
                    onUpdate(index, "printTag", event.target.checked)
                  }
                />
                Print Tag
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
