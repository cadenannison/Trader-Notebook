"use client";

import { useMemo, useState } from "react";

import { clsx } from "clsx";
import { RefreshCw, Search } from "lucide-react";

import { useTriggers } from "@/hooks/useTriggers";
import { useStockPrice } from "@/hooks/useStockPrice";
import { MOCK_PRICES } from "@/mocks/prices";
import type { PriceTrigger } from "@shared/types";

type Signal = "confluence" | "triggered" | "near" | "monitoring";
type SortMode = "alpha" | "signal" | "count";

function getProximityPct(trigger: PriceTrigger, currentPrice: number): number {
  if (trigger.condition === "above") {
    return ((trigger.target_price - currentPrice) / currentPrice) * 100;
  }
  return ((currentPrice - trigger.target_price) / currentPrice) * 100;
}

function getSignal(triggers: PriceTrigger[], currentPrice: number): Signal {
  const proximities = triggers.map((t) => getProximityPct(t, currentPrice));
  const triggered = proximities.filter((p) => p <= 0).length;
  const near = proximities.filter((p) => p > 0 && p <= 5).length;

  if ((triggered > 0 && near > 0) || triggered >= 2 || near >= 2) return "confluence";
  if (triggered > 0) return "triggered";
  if (near > 0) return "near";
  return "monitoring";
}

function getSmartAnalysis(triggers: PriceTrigger[], currentPrice: number): string {
  const active = triggers.filter((t) => t.is_active);
  const fired = triggers.filter((t) => !t.is_active);

  if (fired.length > 0 && active.length > 0) {
    return `${fired.length} level hit. ${active.length} still watching. Review your thesis before acting on the triggered alert.`;
  }
  if (fired.length > 0) {
    return `A watched level has been hit. Check if price is holding or reversing before logging a trade.`;
  }

  const parts = active.map((t) => {
    const pct = Math.abs(getProximityPct(t, currentPrice)).toFixed(1);
    return `${pct}% ${t.condition === "above" ? "below" : "above"} your $${t.target_price.toFixed(0)} ${t.condition} target`;
  });
  return parts.length > 0 ? `Price is ${parts.join(" and ")}.` : "Monitoring price action.";
}

const SIGNAL_STYLES: Record<Signal, { border: string; badge: string; label: string }> = {
  confluence: {
    border: "border-l-brand",
    badge: "bg-brand-light text-brand",
    label: "Confluence",
  },
  triggered: {
    border: "border-l-green-500",
    badge: "bg-green-50 text-green-700",
    label: "Triggered",
  },
  near: {
    border: "border-l-amber-500",
    badge: "bg-amber-50 text-amber-700",
    label: "Near",
  },
  monitoring: {
    border: "border-l-slate-200",
    badge: "bg-slate-100 text-slate-500",
    label: "Monitoring",
  },
};

function ProximityBar({ pct }: { pct: number }) {
  const fill = Math.max(0, Math.min(100, (1 - pct / 8) * 100));
  const color =
    pct <= 0
      ? "bg-green-500"
      : pct <= 2
      ? "bg-amber-500"
      : pct <= 5
      ? "bg-amber-400"
      : "bg-slate-300";

  return (
    <div className="h-1 bg-slate-100 rounded-full overflow-hidden w-24 shrink-0">
      <div className={clsx("h-full rounded-full transition-all", color)} style={{ width: `${fill}%` }} />
    </div>
  );
}

function AlertRow({ trigger, currentPrice }: { trigger: PriceTrigger; currentPrice: number }) {
  const pct = getProximityPct(trigger, currentPrice);
  const icon = trigger.condition === "above" ? "↑" : "↓";

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-slate-400 text-base w-4 shrink-0">{icon}</span>
      <span className="text-sm font-semibold text-slate-800 tabular-nums w-20 shrink-0">
        ${trigger.target_price.toFixed(2)}
      </span>
      <span className="text-xs text-slate-400 italic flex-1 truncate">
        {/* note placeholder — real alerts will have a `note` field */}
        {trigger.is_active ? "Watching…" : "Fired"}
      </span>
      <ProximityBar pct={pct} />
      <span
        className={clsx(
          "text-[10.5px] font-semibold tabular-nums w-16 text-right shrink-0",
          pct <= 0
            ? "text-green-600"
            : pct <= 5
            ? "text-amber-600"
            : "text-slate-400"
        )}
      >
        {pct <= 0 ? "Triggered" : `${pct.toFixed(1)}% away`}
      </span>
    </div>
  );
}

function TickerGroupCard({ ticker, triggers }: { ticker: string; triggers: PriceTrigger[] }) {
  const priceData = MOCK_PRICES[ticker];
  const currentPrice = priceData?.price ?? 0;
  const signal = getSignal(triggers, currentPrice);
  const styles = SIGNAL_STYLES[signal];
  const analysis = getSmartAnalysis(triggers, currentPrice);

  return (
    <div
      className={clsx(
        "bg-white rounded-xl border border-brand-subtle border-l-4 shadow-sm overflow-hidden transition-shadow hover:shadow-md",
        styles.border
      )}
    >
      {/* Group header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold text-slate-900 tracking-tight">{ticker}</span>
            {priceData ? (
              <>
                <span className="text-base font-semibold text-slate-700 tabular-nums">
                  ${priceData.price.toFixed(2)}
                </span>
                <span
                  className={clsx(
                    "text-xs font-medium",
                    priceData.change_pct >= 0 ? "text-green-600" : "text-red-500"
                  )}
                >
                  {priceData.change_pct >= 0 ? "+" : ""}
                  {priceData.change_pct.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-400">No price</span>
            )}
          </div>
          <p className="text-[10.5px] text-slate-400">
            {triggers.length} alert{triggers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <span className={clsx("text-[10.5px] font-semibold px-2.5 py-1 rounded-full shrink-0", styles.badge)}>
          {styles.label}
        </span>
      </div>

      {/* Alert rows */}
      <div className="px-4 divide-y divide-brand-subtle">
        {triggers.map((t) => (
          <AlertRow key={t.id} trigger={t} currentPrice={currentPrice} />
        ))}
      </div>

      {/* Smart analysis */}
      <div className="mx-4 mb-4 mt-3 bg-brand-light border border-brand-subtle rounded-lg px-3 py-2.5 flex items-start justify-between gap-3">
        <p className="text-xs text-slate-600 leading-relaxed flex-1">{analysis}</p>
        <button className="text-[10.5px] font-semibold text-brand hover:text-brand-hover whitespace-nowrap shrink-0 transition-colors">
          Dig deeper →
        </button>
      </div>
    </div>
  );
}

const SIGNAL_ORDER: Record<Signal, number> = {
  confluence: 0,
  triggered: 1,
  near: 2,
  monitoring: 3,
};

export default function AlertsPage() {
  const { data: triggers = [] } = useTriggers();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("signal");

  const groups = useMemo(() => {
    const map: Record<string, PriceTrigger[]> = {};
    for (const t of triggers) {
      if (!map[t.ticker]) map[t.ticker] = [];
      map[t.ticker].push(t);
    }

    let entries = Object.entries(map);

    if (search.trim()) {
      const q = search.toUpperCase();
      entries = entries.filter(([ticker]) => ticker.includes(q));
    }

    entries.sort(([aT, aTs], [bT, bTs]) => {
      if (sort === "alpha") return aT.localeCompare(bT);
      if (sort === "count") return bTs.length - aTs.length;
      // signal sort
      const aP = MOCK_PRICES[aT]?.price ?? 0;
      const bP = MOCK_PRICES[bT]?.price ?? 0;
      return SIGNAL_ORDER[getSignal(aTs, aP)] - SIGNAL_ORDER[getSignal(bTs, bP)];
    });

    return entries;
  }, [triggers, search, sort]);

  return (
    <div className="px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
            Execution feed
          </p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Alerts</h1>
          <p className="text-sm text-slate-500">Live proximity to every watched level.</p>
        </div>
        <button className="flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-hover border border-brand-border hover:border-brand rounded-lg px-3 py-2 transition-colors">
          <RefreshCw size={12} />
          Check prices
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticker…"
            className="pl-8 pr-3 py-1.5 text-sm border border-brand-border rounded-lg bg-white focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 text-slate-800 placeholder:text-slate-400 w-40"
          />
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              { key: "alpha", label: "A–Z" },
              { key: "signal", label: "By signal" },
              { key: "count", label: "By count" },
            ] as { key: SortMode; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={clsx(
                "text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                sort === key
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-slate-500 border-brand-border hover:border-brand hover:text-brand"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Groups grid */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="w-12 h-12 rounded-xl border border-brand-border flex items-center justify-center">
            <span className="text-brand font-bold text-base">tN</span>
          </div>
          <p className="text-sm font-medium text-slate-700">No alerts yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Head to Chat and tell me what levels to watch. I'll create alerts automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map(([ticker, tickerTriggers]) => (
            <TickerGroupCard key={ticker} ticker={ticker} triggers={tickerTriggers} />
          ))}
        </div>
      )}
    </div>
  );
}
