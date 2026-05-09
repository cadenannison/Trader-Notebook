"use client";

import { clsx } from "clsx";

import { MOCK_PRICES } from "@/mocks/prices";
import { MOCK_TRADES } from "@/mocks/trades";
import type { Trade } from "@shared/types";

// ─── Calculations ────────────────────────────────────────────────────────────

function calcStats(trades: Trade[]) {
  const closed = trades.filter((t) => t.status === "closed" && t.return_pct != null);
  const open = trades.filter((t) => t.status === "open");
  const wins = closed.filter((t) => (t.return_pct ?? 0) > 0);
  const avgReturn = closed.length
    ? closed.reduce((s, t) => s + (t.return_pct ?? 0), 0) / closed.length
    : 0;
  const best = closed.reduce<Trade | null>(
    (a, t) => (!a || (t.return_pct ?? 0) > (a.return_pct ?? 0) ? t : a),
    null
  );
  const worst = closed.reduce<Trade | null>(
    (a, t) => (!a || (t.return_pct ?? 0) < (a.return_pct ?? 0) ? t : a),
    null
  );

  // Unrealised P&L for open positions (per-share, no qty)
  const unrealisedPct = open.map((t) => {
    const current = MOCK_PRICES[t.ticker]?.price;
    if (!current) return 0;
    return ((current - t.entry_price) / t.entry_price) * 100;
  });
  const netUnrealisedPct = unrealisedPct.reduce((s, v) => s + v, 0);

  return { closed, open, wins, avgReturn, best, worst, netUnrealisedPct };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function HeroMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-right">
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">{label}</p>
      <p className={clsx("text-2xl font-bold tabular-nums mt-0.5", color ?? "text-slate-900")}>
        {value}
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  ticker,
  body,
  color,
}: {
  label: string;
  ticker: string;
  body: string;
  color?: string;
}) {
  return (
    <article className="bg-white border border-brand-subtle rounded-xl p-4 space-y-2">
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">{label}</p>
      <p className={clsx("text-xl font-extrabold tracking-tight", color ?? "text-slate-900")}>
        {ticker}
      </p>
      <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
    </article>
  );
}

function HoldingRow({ trade }: { trade: Trade }) {
  const current = MOCK_PRICES[trade.ticker]?.price;
  const pct = current ? ((current - trade.entry_price) / trade.entry_price) * 100 : null;
  const initials = trade.ticker.slice(0, 2);

  return (
    <div className="flex items-center gap-3 py-3 border-b border-brand-subtle last:border-0">
      <div className="w-10 h-10 rounded-lg bg-brand-light flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-brand">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900">{trade.ticker}</p>
        <p className="text-[10.5px] text-slate-400 truncate">Entry ${trade.entry_price.toFixed(2)}</p>
      </div>
      {pct != null && (
        <span
          className={clsx(
            "text-sm font-bold tabular-nums",
            pct >= 0 ? "text-green-600" : "text-red-500"
          )}
        >
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isWin = (trade.return_pct ?? 0) > 0;
  const date = new Date(trade.logged_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <tr className="border-b border-brand-subtle last:border-0">
      <td className="py-2.5 pr-4">
        <span className="text-sm font-bold text-slate-900">{trade.ticker}</span>
      </td>
      <td className="py-2.5 pr-4 text-xs text-slate-500 tabular-nums">
        ${trade.entry_price.toFixed(2)}
      </td>
      <td className="py-2.5 pr-4 text-xs text-slate-500 tabular-nums">
        {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : "—"}
      </td>
      <td className="py-2.5 pr-4">
        {trade.return_pct != null && (
          <span
            className={clsx(
              "text-sm font-bold tabular-nums",
              isWin ? "text-green-600" : "text-red-500"
            )}
          >
            {isWin ? "+" : ""}
            {trade.return_pct.toFixed(1)}%
          </span>
        )}
      </td>
      <td className="py-2.5 text-[10.5px] text-slate-400">{date}</td>
    </tr>
  );
}

type PatternType = "strength" | "warning" | "danger" | "insight";

function PatternCard({
  type,
  title,
  value,
  body,
}: {
  type: PatternType;
  title: string;
  value: string;
  body: string;
}) {
  const styles: Record<PatternType, { border: string; icon: string; text: string }> = {
    strength: { border: "border-l-green-500", icon: "bg-green-50", text: "text-green-600" },
    warning: { border: "border-l-amber-500", icon: "bg-amber-50", text: "text-amber-600" },
    danger: { border: "border-l-red-500", icon: "bg-red-50", text: "text-red-500" },
    insight: { border: "border-l-brand", icon: "bg-brand-light", text: "text-brand" },
  };
  const s = styles[type];

  return (
    <div
      className={clsx(
        "bg-white border border-brand-subtle border-l-4 rounded-xl p-4 flex gap-3",
        s.border
      )}
    >
      <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", s.icon)}>
        <span className={clsx("text-base font-bold", s.text)}>
          {type === "strength" ? "↑" : type === "warning" ? "⚠" : type === "danger" ? "↓" : "→"}
        </span>
      </div>
      <div className="space-y-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <span className={clsx("text-sm font-bold tabular-nums", s.text)}>{value}</span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const trades = MOCK_TRADES;
  const { closed, open, wins, avgReturn, best, worst, netUnrealisedPct } = calcStats(trades);

  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;

  const patterns: Array<{ type: PatternType; title: string; value: string; body: string }> = [
    {
      type: "strength",
      title: "Notes correlate with wins",
      value: "100%",
      body: "Every winning trade had an attached note. Thesis discipline is paying off.",
    },
    {
      type: "warning",
      title: "Loss held longer than win",
      value: "1.5×",
      body: "Your losing trade stayed open longer than your win. Consider tighter exit rules.",
    },
    {
      type: "insight",
      title: "All trades are long",
      value: "4 : 0",
      body: "No short positions logged. Worth tracking short setups for full portfolio context.",
    },
  ];

  return (
    <div className="px-8 py-10 space-y-10 max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
            Performance view
          </p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Stats</h1>
          <p className="text-sm text-slate-500">
            Summarise positions without losing the story behind them.
          </p>
        </div>
        <div className="flex items-end gap-8">
          <HeroMetric
            label="Unrealised P&L"
            value={`${netUnrealisedPct >= 0 ? "+" : ""}${netUnrealisedPct.toFixed(1)}%`}
            color={netUnrealisedPct >= 0 ? "text-green-600" : "text-red-500"}
          />
          <HeroMetric label="Open positions" value={String(open.length)} />
        </div>
      </div>

      {/* Summary snapshot cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Best performer"
          ticker={best?.ticker ?? "—"}
          body={
            best
              ? `Up ${best.return_pct?.toFixed(1)}% — thesis held and position closed cleanly.`
              : "No closed trades yet."
          }
          color="text-green-600"
        />
        <SummaryCard
          label="Weakest performer"
          ticker={worst?.ticker ?? "—"}
          body={
            worst
              ? `Down ${Math.abs(worst.return_pct ?? 0).toFixed(1)}% — worth reviewing the exit decision.`
              : "No closed trades yet."
          }
          color="text-red-500"
        />
        <SummaryCard
          label="Open watch"
          ticker={open[0]?.ticker ?? "—"}
          body={
            open[0]
              ? `Entry at $${open[0].entry_price.toFixed(2)}. Position still running.`
              : "No open positions."
          }
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Closed trades", value: closed.length, unit: "" },
          {
            label: "Win rate",
            value: winRate.toFixed(0),
            unit: "%",
            color: winRate >= 50 ? "text-green-600" : "text-red-500",
          },
          {
            label: "Avg return",
            value: `${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(1)}`,
            unit: "%",
            color: avgReturn >= 0 ? "text-green-600" : "text-red-500",
          },
          {
            label: "Best trade",
            value: best ? `+${best.return_pct?.toFixed(1)}` : "—",
            unit: best ? "%" : "",
            color: "text-green-600",
          },
        ].map(({ label, value, unit, color }) => (
          <div key={label} className="bg-white border border-brand-subtle rounded-xl p-4 space-y-1">
            <p className={clsx("text-2xl font-bold tabular-nums", color ?? "text-slate-900")}>
              {value}
              <span className="text-base font-semibold">{unit}</span>
            </p>
            <p className="text-xs font-semibold text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Split grid: Holdings + Trade history */}
      <div className="grid grid-cols-2 gap-6">
        {/* Open holdings */}
        <section className="bg-white border border-brand-subtle rounded-xl p-5 space-y-1">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Open positions</h2>
          {open.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No open positions.</p>
          ) : (
            open.map((t) => <HoldingRow key={t.id} trade={t} />)
          )}
        </section>

        {/* Closed trade history table */}
        <section className="bg-white border border-brand-subtle rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Recent performance</h2>
          {closed.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No closed trades yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-subtle">
                  {["Ticker", "Entry", "Exit", "Return", "Date"].map((h) => (
                    <th
                      key={h}
                      className="pb-2 text-left text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em] pr-4 last:pr-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closed.map((t) => (
                  <TradeRow key={t.id} trade={t} />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Pattern intelligence */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Pattern intelligence</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {patterns.map((p) => (
            <PatternCard key={p.title} {...p} />
          ))}
        </div>
      </section>
    </div>
  );
}
