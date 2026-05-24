"use client";

import { useState } from "react";

import { clsx } from "clsx";
import { AlertTriangle, X } from "lucide-react";

import type { ChatAction } from "@/store/appStore";
import type { WatchlistEntry } from "@shared/types";

type ThesisAnswer = "yes" | "partially" | "no";

export function PreTradeChecklist({
  act,
  watchlistEntry,
  onConfirm,
  onCancel,
}: {
  act: ChatAction;
  watchlistEntry?: WatchlistEntry | null;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}) {
  const [thesis, setThesis] = useState<ThesisAnswer | null>(null);
  const [exitPlan, setExitPlan] = useState(() => {
    if (!watchlistEntry) return "";
    const parts: string[] = [];
    if (watchlistEntry.target_price) parts.push(`Target: $${watchlistEntry.target_price}`);
    if (watchlistEntry.stop_price) parts.push(`Stop: $${watchlistEntry.stop_price}`);
    return parts.join(", ");
  });

  function handleSubmit() {
    onConfirm(JSON.stringify({ thesis_match: thesis, exit_plan: exitPlan || null }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              Quick check
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              {act.ticker} @ ${act.entry_price}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              Does this still match your original thesis?
            </p>
            <div className="flex gap-2">
              {(["yes", "partially", "no"] as ThesisAnswer[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setThesis(opt)}
                  className={clsx(
                    "flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                    thesis === opt
                      ? opt === "yes"
                        ? "bg-green-50 border-green-400 text-green-700"
                        : opt === "partially"
                          ? "bg-amber-50 border-amber-400 text-amber-700"
                          : "bg-red-50 border-red-400 text-red-600"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  {opt === "yes" ? "✓ Yes" : opt === "partially" ? "~ Partially" : "✗ No"}
                </button>
              ))}
            </div>
          </div>

          {thesis === "no" && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">
                You said this doesn&apos;t match your thesis. Logging anyway adds to your
                behavioral pattern data.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Exit plan{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={exitPlan}
              onChange={(e) => setExitPlan(e.target.value)}
              placeholder="Target, stop, or time-based exit…"
              rows={2}
              className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={thesis === null}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Log Trade
          </button>
        </div>
      </div>
    </div>
  );
}
