"use client";

import { use, useEffect, useRef, useState } from "react";

type TagEntry = {
  id: string;
  tagNumber: string;
  sequence: number;
  position: number;
  totalTags: number;
  eligible: boolean;
  garment: {
    id: string;
    name: string;
    service: string;
    prepayDiscount: boolean;
    printTag: boolean;
  };
};

type TagsResponse = {
  order: {
    id: string;
    orderNumber: string;
    tagPrintingEnabled: boolean;
    customer: { firstName: string; lastName: string };
  };
  totalTags: number;
  tags: TagEntry[];
};

export default function GarmentTagsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [data, setData] = useState<TagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabling, setEnabling] = useState(false);

  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    new Set()
  );
  const [printTrigger, setPrintTrigger] = useState(0);
  const initializedSelection = useRef(false);

  async function loadTags() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/orders/${id}/tags`, {
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json?.details || json?.error || "Failed to load garment tags"
        );
      }

      setData(json);

      if (!initializedSelection.current) {
        const eligibleIds = json.tags
          .filter((tag: TagEntry) => tag.eligible)
          .map((tag: TagEntry) => tag.id);
        setSelectedTagIds(new Set(eligibleIds));
        initializedSelection.current = true;
      }
    } catch (err) {
      console.error("Load garment tags error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load garment tags"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) {
      loadTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (printTrigger > 0) {
      window.print();
    }
  }, [printTrigger]);

  async function enableTagPrinting() {
    try {
      setEnabling(true);
      setError("");

      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagPrintingEnabled: true }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json?.details || json?.error || "Failed to enable tag printing"
        );
      }

      initializedSelection.current = false;
      await loadTags();
    } catch (err) {
      console.error("Enable tag printing error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to enable tag printing"
      );
    } finally {
      setEnabling(false);
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }

  function printAllEligible() {
    if (!data) return;
    const eligibleIds = data.tags
      .filter((tag) => tag.eligible)
      .map((tag) => tag.id);
    setSelectedTagIds(new Set(eligibleIds));
    setPrintTrigger((n) => n + 1);
  }

  function printSelected() {
    setPrintTrigger((n) => n + 1);
  }

  function reprintOne(tagId: string) {
    setSelectedTagIds(new Set([tagId]));
    setPrintTrigger((n) => n + 1);
  }

  if (loading) {
    return <div className="p-8">Loading garment tags...</div>;
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8">Order not found.</div>;
  }

  const { order, tags } = data;
  const eligibleCount = tags.filter((tag) => tag.eligible).length;
  const excludedCount = tags.length - eligibleCount;

  return (
    <div className="p-8">
      <div className="print:hidden mb-8">
        <a
          href={`/orders/${order.id}`}
          className="mb-3 inline-block text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back to Order
        </a>

        <h1 className="text-3xl font-bold">Garment Tags</h1>
        <p className="text-gray-500 mt-1">
          {order.orderNumber} — {order.customer.firstName}{" "}
          {order.customer.lastName}
        </p>
      </div>

      {error && (
        <div className="print:hidden mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!order.tagPrintingEnabled ? (
        <div className="print:hidden rounded-xl border bg-white p-8 text-center">
          <p className="text-gray-600 mb-4">
            Garment tag printing is disabled for this order.
          </p>
          <button
            onClick={enableTagPrinting}
            disabled={enabling}
            className="rounded-lg bg-black px-5 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {enabling ? "Enabling..." : "Enable Tag Printing"}
          </button>
        </div>
      ) : (
        <>
          <div className="print:hidden mb-6 rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="text-sm text-gray-600">
                {tags.length} physical garment
                {tags.length === 1 ? "" : "s"} · {selectedTagIds.size} tag
                {selectedTagIds.size === 1 ? "" : "s"} selected for printing
                {excludedCount > 0 && (
                  <> · {excludedCount} garment{excludedCount === 1 ? "" : "s"} excluded</>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={printAllEligible}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium hover:bg-gray-50"
                >
                  Print All Eligible Tags
                </button>

                <button
                  onClick={printSelected}
                  disabled={selectedTagIds.size === 0}
                  className="rounded-lg bg-black px-4 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  🏷️ Print Selected ({selectedTagIds.size})
                </button>
              </div>
            </div>

            {tags.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                No garments on this order.
              </div>
            ) : (
              <div className="divide-y">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="py-2 flex items-center justify-between gap-4"
                  >
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedTagIds.has(tag.id)}
                        onChange={() => toggleTag(tag.id)}
                      />
                      <span className={tag.eligible ? "" : "text-gray-400"}>
                        <span className="font-medium">{tag.tagNumber}</span>{" "}
                        — {tag.garment.name} ({tag.garment.service})
                        {!tag.eligible && " · excluded"}
                      </span>
                    </label>

                    <button
                      onClick={() => reprintOne(tag.id)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 shrink-0"
                    >
                      Reprint
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PRINTABLE TAG GRID */}
          <div className="tag-grid">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className={`tag-card ${
                  selectedTagIds.has(tag.id) ? "" : "hidden print:hidden"
                }`}
              >
                <div className="tag-brand">PRISTINE</div>

                <div className="tag-order">{order.orderNumber}</div>
                <div className="tag-customer">
                  {order.customer.lastName.toUpperCase()}
                </div>

                <div className="tag-garment">
                  {tag.garment.name.toUpperCase()}
                </div>
                <div className="tag-service">
                  {tag.garment.service.toUpperCase()}
                </div>

                {tag.garment.prepayDiscount && (
                  <div className="tag-discount">20% Prepay Discount</div>
                )}

                <div className="tag-position">
                  {tag.position} OF {tag.totalTags}
                </div>

                <div className="tag-number">TAG {tag.tagNumber}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            margin: 0;
          }

          @page {
            size: auto;
            margin: 0.3in;
          }
        }

        .tag-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }

        .tag-card {
          border: 1.5px dashed #999;
          border-radius: 6px;
          padding: 10px 12px;
          background: white;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .tag-brand {
          font-weight: 800;
          font-size: 0.8rem;
          letter-spacing: 0.1em;
          margin-bottom: 4px;
        }

        .tag-order {
          font-weight: 700;
          font-size: 0.9rem;
        }

        .tag-customer {
          font-size: 0.85rem;
          margin-bottom: 6px;
        }

        .tag-garment {
          font-weight: 700;
          font-size: 1rem;
        }

        .tag-service {
          font-size: 0.85rem;
          color: #444;
        }

        .tag-discount {
          margin-top: 4px;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .tag-position {
          margin-top: 6px;
          font-size: 0.75rem;
          color: #444;
        }

        .tag-number {
          margin-top: 2px;
          font-size: 0.7rem;
          font-weight: 600;
          border-top: 1px dashed #ccc;
          padding-top: 4px;
        }
      `}</style>
    </div>
  );
}
