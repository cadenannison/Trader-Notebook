"use client";

import Link from "next/link";

import { clsx } from "clsx";

import { useDeleteTrigger, useRearmTrigger } from "@/hooks/useTriggers";
import type { PriceTrigger } from "@shared/types";

interface Props {
  trigger: PriceTrigger;
  showTicker?: boolean;
}

export function TriggerCard({ trigger, showTicker = true }: Props) {
  const rearm = useRearmTrigger();
  const del = useDeleteTrigger();

  const conditionLabel =
    trigger.condition === "above" ? "rises above" : "falls below";

  return (
    <div
      className={clsx(
        "border rounded-lg p-4 space-y-3 transition-colors",
        trigger.is_active
          ? "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
          : "bg-zinc-900/50 border-zinc-800/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          {showTicker && (
            <Link href={`/ticker/${trigger.ticker}`}>
              <span className="inline-block text-xs font-medium bg-zinc-800 text-emerald-400 px-2 py-0.5 rounded hover:bg-zinc-700 transition-colors cursor-pointer">
                {trigger.ticker}
              </span>
            </Link>
          )}
          <p className="text-zinc-200 text-sm">
            Alert when price {conditionLabel}{" "}
            <span className="font-semibold text-zinc-100">
              ${trigger.target_price.toFixed(2)}
            </span>
          </p>
          {!trigger.auto_disarm && (
            <p className="text-zinc-500 text-xs">
              Repeating · {trigger.cooldown_hours}h cooldown
            </p>
          )}
        </div>
        <span
          className={clsx(
            "text-xs font-medium px-2 py-0.5 rounded shrink-0",
            trigger.is_active
              ? "bg-emerald-400/10 text-emerald-400"
              : "bg-amber-400/10 text-amber-400"
          )}
        >
          {trigger.is_active ? "Active" : "Fired"}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-zinc-800">
        {!trigger.is_active && (
          <button
            onClick={() => rearm.mutate(trigger.id)}
            disabled={rearm.isPending}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors disabled:opacity-50"
          >
            Re-arm
          </button>
        )}
        <button
          onClick={() => del.mutate(trigger.id)}
          disabled={del.isPending}
          className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50 ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
