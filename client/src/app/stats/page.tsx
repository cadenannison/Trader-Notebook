"use client";

import { clsx } from "clsx";

import { useInsights } from "@/hooks/useInsights";
import { useTrades } from "@/hooks/useTrades";
import type { Trade } from "@shared/types";

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

function SummaryCard({ label, ticker, body, color }: { label: string; ticker: string; body: string; color?: string }) {
  return (
    <article className="bg-white border border-brand-subtle rounded-xl p-4 space-y-2">
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">{label}</p>
      <p className={clsx("text-xl font-extrabold tracking-tight", color ?? "text-slate-900")}>{ticker}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
    </article>
  );
}

function HoldingRow({ trade }: { trade: Trade }) {
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
      <span className="text-xs text-slate-400 capitalize">{trade.time_horizon}</span>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isWin = (trade.return_pct ?? 0) > 0;
  const date = new Date(trade.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <tr className="border-b border-brand-subtle last:border-0">
      <td className="py-2.5 pr-4"><span className="text-sm font-bold text-slate-900">{trade.ticker}</span></td>
      <td className="py-2.5 pr-4 text-xs text-slate-500 tabular-nums">${trade.entry_price.toFixed(2)}</td>
      <td className="py-2.5 pr-4 text-xs text-slate-500 tabular-nums">
        {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : "—"}
      </td>
      <td className="py-2.5 pr-4">
        {trade.return_pct != null && (
          <span className={clsx("text-sm font-bold tabular-nums", isWin ? "text-green-600" : "text-red-500")}>
            {isWin ? "+" : ""}{trade.return_pct.toFixed(1)}%
          </span>
        )}
      </td>
      <td className="py-2.5 text-[10.5px] text-slate-400">{date}</td>
    </tr>
  );
}

type PatternType = "strength" | "warning" | "danger" | "insight";

function PatternCard({ type, title, body }: { type: PatternType; title?: string; body: string }) {
  const styles: Record<PatternType, { border: string; icon: string; text: string; symbol: string }> = {
    strength: { border: "border-l-green-500", icon: "bg-green-50",   text: "text-green-600", symbol: "↑" },
    warning:  { border: "border-l-amber-500", icon: "bg-amber-50",   text: "text-amber-600", symbol: "⚠" },
    danger:   { border: "border-l-red-500",   icon: "bg-red-50",     text: "text-red-500",   symbol: "↓" },
    insight:  { border: "border-l-brand",     icon: "bg-brand-light",text: "text-brand",     symbol: "→" },
  };
  const s = styles[type];
  return (
    <div className={clsx("bg-white border border-brand-subtle border-l-4 rounded-xl p-4 flex gap-3", s.border)}>
      <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", s.icon)}>
        <span className={clsx("text-base font-bold", s.text)}>{s.symbol}</span>
      </div>
      <div className="space-y-1 min-w-0">
        {title && <p className="text-sm font-bold text-slate-900">{title}</p>}
        <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("bg-slate-100 rounded animate-pulse", className)} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const { data: tradesData, isLoading: tradesLoading } = useTrades();
  const { data: insights, isLoading: insightsLoading } = useInsights();

  const isLoading = tradesLoading || insightsLoading;

  const trades = tradesData ?? [];
  const open = trades.filter((t) => t.status === "open");
  const closed = trades.filter((t) => t.status === "closed");

  const summary = insights?.summary;
  const winRate = summary?.win_rate ?? 0;
  const avgReturn = summary?.avg_return ?? 0;

  // Coaching insight type heuristic
  function patternType(insight: string): PatternType {
    const lower = insight.toLowerCase();
    if (lower.includes("strong") || lower.includes("well") || lower.includes("great") || lower.includes("excellent")) return "strength";
    if (lower.includes("warning") || lower.includes("consider") || lower.includes("watch") || lower.includes("tend")) return "warning";
    if (lower.includes("loss") || lower.includes("losing") || lower.includes("avoid") || lower.includes("poor")) return "danger";
    return "insight";
  }

  return (
    <div className="px-8 py-10 space-y-10 max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">Performance view</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Stats</h1>
          <p className="text-sm text-slate-500">Summarise positions without losing the story behind them.</p>
        </div>
        <div className="flex items-end gap-8">
          {isLoading ? (
            <>
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-16" />
            </>
          ) : (
            <>
              <HeroMetric label="Open positions" value={String(open.length)} />
              <HeroMetric label="Closed trades" value={String(closed.length)} />
            </>
          )}
        </div>
      </div>

      {/* Summary snapshot */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard
            label="Best performer"
            ticker={summary?.best_trade_ticker ?? "—"}
            body={summary?.best_trade_pct != null
              ? `Up ${summary.best_trade_pct.toFixed(1)}% — thesis held and position closed cleanly.`
              : "No closed trades yet."}
            color="text-green-600"
          />
          <SummaryCard
            label="Weakest performer"
            ticker={summary?.worst_trade_ticker ?? "—"}
            body={summary?.worst_trade_pct != null
              ? `Down ${Math.abs(summary.worst_trade_pct).toFixed(1)}% — worth reviewing the exit decision.`
              : "No closed trades yet."}
            color="text-red-500"
          />
          <SummaryCard
            label="Open watch"
            ticker={open[0]?.ticker ?? "—"}
            body={open[0]
              ? `Entry at $${open[0].entry_price.toFixed(2)}. Position still running.`
              : "No open positions."}
          />
        </div>
      )}

      {/* Stats row */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Closed trades", value: String(closed.length), unit: "", color: undefined },
            {
              label: "Win rate",
              value: winRate.toFixed(0), unit: "%",
              color: winRate >= 50 ? "text-green-600" : closed.length > 0 ? "text-red-500" : undefined,
            },
            {
              label: "Avg return",
              value: `${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(1)}`, unit: "%",
              color: avgReturn >= 0 ? "text-green-600" : "text-red-500",
            },
            {
              label: "Best trade",
              value: summary?.best_trade_pct != null ? `+${summary.best_trade_pct.toFixed(1)}` : "—",
              unit: summary?.best_trade_pct != null ? "%" : "",
              color: "text-green-600",
            },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className="bg-white border border-brand-subtle rounded-xl p-4 space-y-1">
              <p className={clsx("text-2xl font-bold tabular-nums", color ?? "text-slate-900")}>
                {value}<span className="text-base font-semibold">{unit}</span>
              </p>
              <p className="text-xs font-semibold text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Split grid */}
      <div className="grid grid-cols-2 gap-6">
        <section className="bg-white border border-brand-subtle rounded-xl p-5 space-y-1">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Open positions</h2>
          {isLoading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : open.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No open positions.</p>
          ) : (
            open.map((t) => <HoldingRow key={t.id} trade={t} />)
          )}
        </section>

        <section className="bg-white border border-brand-subtle rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Recent performance</h2>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : closed.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No closed trades yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-subtle">
                  {["Ticker", "Entry", "Exit", "Return", "Date"].map((h) => (
                    <th key={h} className="pb-2 text-left text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em] pr-4 last:pr-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closed.slice(0, 10).map((t) => <TradeRow key={t.id} trade={t} />)}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Pattern intelligence */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Pattern intelligence</h2>
        {insightsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : insights?.coaching_insights && insights.coaching_insights.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {insights.coaching_insights.map((text, i) => (
              <PatternCard key={i} type={patternType(text)} body={text} />
            ))}
          </div>
        ) : closed.length === 0 ? (
          <div className="bg-white border border-brand-subtle rounded-xl p-6 text-center">
            <p className="text-sm text-slate-500">Log and close some trades to unlock AI pattern insights.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
