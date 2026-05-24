"use client";

import { useState } from "react";

import { clsx } from "clsx";
import { Star, X } from "lucide-react";

import type { ChatAction } from "@/store/appStore";

type ExitQuality = "planned" | "adjusted" | "impulsive";

export function PostTradeDebrief({
  act,
  onConfirm,
  onCancel,
}: {
  act: ChatAction;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}) {
  const [exitQuality, setExitQuality] = useState<ExitQuality | null>(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  function handleSubmit() {
    if (!exitQuality) return;
    onConfirm(
      JSON.stringify({
        exit_quality: exitQuality,
        notes: notes || null,
        rating: rating || null,
      })
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              Post-trade review
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              {act.ticker} @ ${act.exit_price}
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
          {/* Exit quality */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              Exit quality{" "}
              <span className="text-red-400 font-normal">*</span>
            </p>
            <div className="flex gap-2">
              {(
                [
                  { value: "planned", label: "Planned ✓" },
                  { value: "adjusted", label: "Adjusted ~" },
                  { value: "impulsive", label: "Impulsive ✗" },
                ] as { value: ExitQuality; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setExitQuality(value)}
                  className={clsx(
                    "flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                    exitQuality === value
                      ? value === "planned"
                        ? "bg-green-50 border-green-400 text-green-700"
                        : value === "adjusted"
                          ? "bg-amber-50 border-amber-400 text-amber-700"
                          : "bg-red-50 border-red-400 text-red-600"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* What happened textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              What happened{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What drove this exit? What would you do differently?"
              rows={2}
              className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand placeholder:text-slate-400"
            />
          </div>

          {/* Star rating */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-700">
              Rate this trade{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = (hoverRating ?? rating ?? 0) >= star;
                return (
                  <button
                    key={star}
                    onClick={() => setRating(star === rating ? null : star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="transition-colors"
                    aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
                  >
                    <Star
                      size={20}
                      className={clsx(
                        "transition-colors",
                        filled
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-300"
                      )}
                    />
                  </button>
                );
              })}
            </div>
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
            disabled={exitQuality === null}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save debrief
          </button>
        </div>
      </div>
    </div>
  );
}
