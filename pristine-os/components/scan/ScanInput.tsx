"use client";

import { useRef, useState } from "react";

// A single reusable scan-capable text field. Keyboard-wedge scanners just
// type characters into whatever's focused and finish with Enter, so a
// plain controlled input that submits on Enter already supports scanning
// with zero special-case rapid-keystroke detection — and since it only
// acts on its own onKeyDown, it never interferes with typing in any other
// field on the page. A synchronous ref lock (same pattern as the rest of
// the app's double-click guards) collapses duplicate Enter/scan events.
export default function ScanInput({
  onScan,
  placeholder,
  autoFocus,
  disabled,
  label,
}: {
  onScan: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [value, setValue] = useState("");
  const submittingRef = useRef(false);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || submittingRef.current) return;

    submittingRef.current = true;
    onScan(trimmed);
    setValue("");

    setTimeout(() => {
      submittingRef.current = false;
    }, 250);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium mb-2">{label}</label>
      )}

      <input
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Scan or type, then press Enter"}
        className="w-full rounded-lg border px-4 py-3 text-lg font-mono disabled:opacity-50 disabled:bg-gray-50"
      />
    </div>
  );
}
