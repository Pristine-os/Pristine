"use client";

import { use, useEffect, useState } from "react";
import CodeBarcode from "@/components/barcode/CodeBarcode";

type Rack = {
  id: string;
  name: string;
  barcodeValue: string;
  active: boolean;
};

export default function RackLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [rack, setRack] = useState<Rack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRack() {
      try {
        const response = await fetch(`/api/racks/${id}`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load rack");
        }

        setRack(data);
      } catch (err) {
        console.error("Rack label error:", err);
        setError(err instanceof Error ? err.message : "Failed to load rack");
      } finally {
        setLoading(false);
      }
    }

    if (id) loadRack();
  }, [id]);

  useEffect(() => {
    if (rack) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [rack]);

  if (loading) return <div className="p-8 text-center">Loading label...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!rack) return <div className="p-8 text-center">Rack not found.</div>;

  return (
    <>
      <div className="min-h-screen bg-gray-100 py-8 print:hidden">
        <button
          onClick={() => window.print()}
          className="mx-auto block rounded-lg bg-black px-6 py-3 text-white font-medium"
        >
          🖨️ Print Rack Label
        </button>
      </div>

      <div className="mx-auto w-[300px] bg-white p-8 text-center">
        <p className="text-sm font-bold tracking-widest text-gray-500">
          PRISTINE
        </p>

        <h1 className="text-3xl font-bold mt-2">{rack.name.toUpperCase()}</h1>

        <div className="mt-6 flex flex-col items-center">
          <CodeBarcode value={rack.barcodeValue} height={55} />
          <p className="text-sm font-mono tracking-wide mt-2">
            {rack.barcodeValue}
          </p>
        </div>

        {!rack.active && (
          <p className="mt-4 text-xs text-red-600 font-medium">INACTIVE</p>
        )}
      </div>

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
        }
      `}</style>
    </>
  );
}
