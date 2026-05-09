"use client";

import { useEffect, useState } from "react";

import { clsx } from "clsx";

const KNOWN_TICKERS = new Set([
  "NVDA", "AAPL", "MSFT", "VGT", "GOOGL", "AMZN", "TSLA",
  "META", "SPY", "QQQ", "MSFT", "NFLX", "AMD", "INTC",
]);

interface Props {
  value: string;
  onChange: (value: string) => void;
  onValidate?: (valid: boolean) => void;
  placeholder?: string;
}

export function TickerInput({ value, onChange, onValidate, placeholder = "NVDA" }: Props) {
  const [status, setStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!value) {
      setStatus("idle");
      setName("");
      onValidate?.(false);
      return;
    }
    // TODO: replace with debounced call to GET /api/stock/validate?ticker=
    const isFormatValid = /^[A-Z]{1,10}$/.test(value);
    const isKnown = KNOWN_TICKERS.has(value);
    const valid = isFormatValid;
    setStatus(valid ? "valid" : "invalid");
    setName(isKnown ? `${value} (verified)` : isFormatValid ? `${value}` : "");
    onValidate?.(valid);
  }, [value, onValidate]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          placeholder={placeholder}
          maxLength={10}
          className={clsx(
            "w-full bg-zinc-800 border rounded-md px-3 py-2 text-sm font-mono text-zinc-100 placeholder:text-zinc-600",
            "focus:outline-none focus:ring-1 transition-colors",
            status === "valid" && "border-emerald-500 focus:ring-emerald-500/30",
            status === "invalid" && "border-red-500 focus:ring-red-500/30",
            status === "idle" && "border-zinc-700 focus:ring-zinc-500/30"
          )}
        />
        {status === "valid" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs">
            ✓
          </span>
        )}
        {status === "invalid" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-xs">
            ✗
          </span>
        )}
      </div>
      {status === "valid" && name && <p className="text-xs text-zinc-500">{name}</p>}
      {status === "invalid" && <p className="text-xs text-red-500">Invalid ticker symbol</p>}
    </div>
  );
}
