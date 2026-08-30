"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// Renders Code 128 locally via jsbarcode (SVG) — no remote barcode
// service involved. The human-readable value is displayed separately by
// the caller (displayValue: false here) to match the ticket/label layout.
export default function CodeBarcode({
  value,
  height = 50,
}: {
  value: string;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;

    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: false,
        height,
        margin: 0,
      });
    } catch (err) {
      console.error("Barcode render error:", err);
    }
  }, [value, height]);

  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />;
}
