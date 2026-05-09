"use client";

import { useState } from "react";

import { useCreateTrigger } from "@/hooks/useTriggers";

import { TickerInput } from "./TickerInput";

interface Props {
  defaultTicker?: string;
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-zinc-700 text-zinc-400 text-[10px] font-bold leading-none inline-flex items-center justify-center hover:bg-zinc-600 transition-colors"
        aria-label="More info"
      >
        i
      </button>
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 bg-zinc-800 border border-zinc-700 rounded-md p-3 text-xs text-zinc-300 shadow-xl z-20 pointer-events-none">
          {text}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-zinc-800 border-r border-b border-zinc-700 rotate-45 -mt-[5px]" />
        </div>
      )}
    </span>
  );
}

export function NewTriggerForm({ defaultTicker = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState(defaultTicker);
  const [tickerValid, setTickerValid] = useState(!!defaultTicker);
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoDisarm, setAutoDisarm] = useState(true);
  const [cooldownHours, setCooldownHours] = useState(4);
  const createTrigger = useCreateTrigger();

  const canSubmit = tickerValid && parseFloat(price) > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await createTrigger.mutateAsync({
      ticker,
      target_price: parseFloat(price),
      condition,
      auto_disarm: autoDisarm,
      cooldown_hours: cooldownHours,
    });
    setPrice("");
    if (!defaultTicker) setTicker("");
    setAutoDisarm(true);
    setCooldownHours(4);
    setShowAdvanced(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium border border-emerald-400/30 rounded px-2 py-1 hover:border-emerald-400/60 transition-colors"
      >
        + Trigger
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-300">New Trigger</p>
        <button
          onClick={() => setOpen(false)}
          className="text-zinc-600 hover:text-zinc-400 text-sm leading-none"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {!defaultTicker && (
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Ticker</label>
            <TickerInput value={ticker} onChange={setTicker} onValidate={setTickerValid} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Condition</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as "above" | "below")}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500/30"
            >
              <option value="above">Rises above</option>
              <option value="below">Falls below</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Target price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="900.00"
              step="0.01"
              min="0.01"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500/30"
            />
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="border-t border-zinc-800 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-zinc-500 hover:text-zinc-400 flex items-center gap-1.5 transition-colors"
          >
            <span
              className={`inline-block text-[8px] transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            Advanced settings
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4 bg-zinc-800/50 rounded-md p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-300">Keep trigger armed after firing</span>
                  <InfoTooltip text="By default, your trigger deactivates after it fires once and you must re-arm it manually. Enable this to keep it active and receive repeated alerts." />
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!autoDisarm}
                  onClick={() => setAutoDisarm(!autoDisarm)}
                  className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none shrink-0 ${
                    !autoDisarm ? "bg-emerald-500" : "bg-zinc-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      !autoDisarm ? "translate-x-4" : ""
                    }`}
                  />
                </button>
              </div>

              {!autoDisarm && (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-300">Cooldown period</span>
                    <InfoTooltip text="Minimum time between alerts for this trigger. Prevents repeated notifications if the price hovers near your target." />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      value={cooldownHours}
                      onChange={(e) =>
                        setCooldownHours(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      min="1"
                      max="168"
                      className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 text-center focus:outline-none focus:ring-1 focus:ring-zinc-500/30"
                    />
                    <span className="text-xs text-zinc-500">hours</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit || createTrigger.isPending}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-medium text-sm rounded-md py-2 transition-colors"
        >
          {createTrigger.isPending ? "Setting..." : "Set Trigger"}
        </button>
      </form>
    </div>
  );
}
