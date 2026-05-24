"use client";

import { clsx } from "clsx";

import { useInsights, type TagStat, type ExitBehaviorStat, type TrendStat } from "@/hooks/useInsights";
import { useTrades } from "@/hooks/useTrades";
import type { Trade } from "@shared/types";

// ─── Sub-components ──────────────────────────────────────────────────────────

function HeroMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="text-right">
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
        {label}
      </p>
      <p
        className={clsx(
          "text-2xl font-bold tabular-nums mt-0.5",
          color ?? "text-slate-900"
        )}
      >
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
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
        {label}
      </p>
      <p
        className={clsx(
          "text-xl font-extrabold tracking-tight",
          color ?? "text-slate-900"
        )}
      >
        {ticker}
      </p>
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
        <p className="text-[10.5px] text-slate-400 truncate">
          Entry ${(trade.entry_price ?? 0).toFixed(2)}
        </p>
      </div>
      <span className="text-xs text-slate-400 capitalize">
        {trade.time_horizon}
      </span>
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
        ${(trade.entry_price ?? 0).toFixed(2)}
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
  body,
}: {
  type: PatternType;
  body: string;
}) {
  const styles: Record<
    PatternType,
    { border: string; icon: string; text: string; symbol: string }
  > = {
    strength: {
      border: "border-l-green-500",
      icon: "bg-green-50",
      text: "text-green-600",
      symbol: "↑",
    },
    warning: {
      border: "border-l-amber-500",
      icon: "bg-amber-50",
      text: "text-amber-600",
      symbol: "⚠",
    },
    danger: {
      border: "border-l-red-500",
      icon: "bg-red-50",
      text: "text-red-500",
      symbol: "↓",
    },
    insight: {
      border: "border-l-brand",
      icon: "bg-brand-light",
      text: "text-brand",
      symbol: "→",
    },
  };
  const s = styles[type];
  return (
    <div
      className={clsx(
        "bg-white border border-brand-subtle border-l-4 rounded-xl p-4 flex gap-3",
        s.border
      )}
    >
      <div
        className={clsx(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
          s.icon
        )}
      >
        <span className={clsx("text-base font-bold", s.text)}>{s.symbol}</span>
      </div>
      <div className="space-y-1 min-w-0">
        <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function BreakdownRow({
  stat,
  maxTotal,
}: {
  stat: TagStat;
  maxTotal: number;
}) {
  const winRate = stat.total > 0 ? (stat.wins / stat.total) * 100 : 0;
  const barWidth = maxTotal > 0 ? (stat.total / maxTotal) * 100 : 0;
  const isPositive = stat.avg_return >= 0;
  const label = stat.tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-brand-subtle last:border-0">
      <div className="w-28 shrink-0">
        <p className="text-xs font-semibold text-slate-700 capitalize">{label}</p>
        <p className="text-[10px] text-slate-400">{stat.total} trade{stat.total !== 1 ? "s" : ""}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={clsx("h-full rounded-full", winRate >= 50 ? "bg-green-400" : "bg-red-400")}
            style={{ width: `${winRate}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5">{winRate.toFixed(0)}% win rate</p>
      </div>
      <div className="w-16 shrink-0 text-right">
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-0.5">
          <div
            className="h-full bg-slate-200 rounded-full"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span
          className={clsx(
            "text-xs font-bold tabular-nums",
            isPositive ? "text-green-600" : "text-red-500"
          )}
        >
          {isPositive ? "+" : ""}
          {stat.avg_return.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("bg-slate-100 rounded animate-pulse", className)} />
  );
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

  const byConfidence = insights?.by_confidence_tag ?? [];
  const byExitReason = insights?.by_exit_reason ?? [];
  const byHorizon = insights?.by_time_horizon ?? [];
  const exitBehavior: ExitBehaviorStat | null = insights?.exit_behavior ?? null;
  const trend: TrendStat | null = insights?.trend ?? null;

  function patternType(insight: string): PatternType {
    const lower = insight.toLowerCase();
    if (lower.includes("strong") || lower.includes("well") || lower.includes("great") || lower.includes("excellent"))
      return "strength";
    if (lower.includes("warning") || lower.includes("consider") || lower.includes("watch") || lower.includes("tend"))
      return "warning";
    if (lower.includes("loss") || lower.includes("losing") || lower.includes("avoid") || lower.includes("poor"))
      return "danger";
    return "insight";
  }

  const bestPct = summary?.best_trade_pct;
  const bestDisplay =
    bestPct != null
      ? `${bestPct >= 0 ? "+" : ""}${bestPct.toFixed(1)}`
      : "—";

  return (
    <div className="px-8 py-10 space-y-10 max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
            Performance view
          </p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Stats
          </h1>
          <p className="text-sm text-slate-500">
            Summarise positions without losing the story behind them.
          </p>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Best performer"
            ticker={summary?.best_trade_ticker ?? "—"}
            body={
              bestPct != null
                ? `${bestPct >= 0 ? "Up" : "Down"} ${Math.abs(bestPct).toFixed(1)}% — thesis held and position closed cleanly.`
                : "No closed trades yet."
            }
            color="text-green-600"
          />
          <SummaryCard
            label="Weakest performer"
            ticker={summary?.worst_trade_ticker ?? "—"}
            body={
              summary?.worst_trade_pct != null
                ? `Down ${Math.abs(summary.worst_trade_pct).toFixed(1)}% — worth reviewing the exit decision.`
                : "No closed trades yet."
            }
            color="text-red-500"
          />
          <SummaryCard
            label="Open watch"
            ticker={open[0]?.ticker ?? "—"}
            body={
              open[0]
                ? `Entry at $${(open[0].entry_price ?? 0).toFixed(2)}. Position still running.`
                : "No open positions."
            }
          />
        </div>
      )}

      {/* Stats row */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Closed trades",
              value: String(closed.length),
              unit: "",
              color: undefined,
            },
            {
              label: "Win rate",
              value: winRate.toFixed(0),
              unit: "%",
              color:
                winRate >= 50
                  ? "text-green-600"
                  : closed.length > 0
                    ? "text-red-500"
                    : undefined,
            },
            {
              label: "Avg return",
              value: `${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(1)}`,
              unit: "%",
              color: avgReturn >= 0 ? "text-green-600" : "text-red-500",
            },
            {
              label: "Best trade",
              value: bestDisplay,
              unit: bestPct != null ? "%" : "",
              color: "text-green-600",
            },
          ].map(({ label, value, unit, color }) => (
            <div
              key={label}
              className="bg-white border border-brand-subtle rounded-xl p-4 space-y-1"
            >
              <p
                className={clsx(
                  "text-2xl font-bold tabular-nums",
                  color ?? "text-slate-900"
                )}
              >
                {value}
                <span className="text-base font-semibold">{unit}</span>
              </p>
              <p className="text-xs font-semibold text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Split grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white border border-brand-subtle rounded-xl p-5 space-y-1">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            Open positions
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : open.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              No open positions.
            </p>
          ) : (
            open.map((t) => <HoldingRow key={t.id} trade={t} />)
          )}
        </section>

        <section className="bg-white border border-brand-subtle rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            Recent performance
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : closed.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              No closed trades yet.
            </p>
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
                {closed.slice(0, 10).map((t) => (
                  <TradeRow key={t.id} trade={t} />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Performance breakdowns */}
      {!isLoading && closed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* By confidence */}
          <section className="bg-white border border-brand-subtle rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-1">By confidence</h2>
            <p className="text-[10.5px] text-slate-400 mb-3">How conviction affects outcomes</p>
            {byConfidence.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">No data yet.</p>
            ) : (
              byConfidence.map((s) => (
                <BreakdownRow
                  key={s.tag}
                  stat={s}
                  maxTotal={Math.max(...byConfidence.map((x) => x.total))}
                />
              ))
            )}
          </section>

          {/* By exit reason */}
          <section className="bg-white border border-brand-subtle rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-1">By exit reason</h2>
            <p className="text-[10.5px] text-slate-400 mb-3">How you close affects returns</p>
            {byExitReason.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">No data yet.</p>
            ) : (
              byExitReason.map((s) => (
                <BreakdownRow
                  key={s.tag}
                  stat={s}
                  maxTotal={Math.max(...byExitReason.map((x) => x.total))}
                />
              ))
            )}
          </section>

          {/* By time horizon */}
          <section className="bg-white border border-brand-subtle rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-1">By time horizon</h2>
            <p className="text-[10.5px] text-slate-400 mb-3">Which style works best for you</p>
            {byHorizon.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">No data yet.</p>
            ) : (
              byHorizon.map((s) => (
                <BreakdownRow
                  key={s.tag}
                  stat={s}
                  maxTotal={Math.max(...byHorizon.map((x) => x.total))}
                />
              ))
            )}
          </section>
        </div>
      )}

      {/* Exit behavior + Trend */}
      {!isLoading && (exitBehavior || trend) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {exitBehavior && (
            <section className="bg-white border border-brand-subtle rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Exit behavior</h2>
                <p className="text-[10.5px] text-slate-400 mt-0.5">
                  How discipline affects your returns
                </p>
              </div>
              <div className="space-y-2">
                {(
                  [
                    { key: "disciplined_exits", label: "Disciplined", avg: exitBehavior.disciplined_avg_return, color: "bg-green-400" },
                    { key: "override_exits", label: "Override", avg: exitBehavior.override_avg_return, color: "bg-amber-400" },
                    { key: "emotional_exits", label: "Emotional", avg: exitBehavior.emotional_avg_return, color: "bg-red-400" },
                    { key: "forced_exits", label: "Forced", avg: exitBehavior.forced_avg_return, color: "bg-slate-300" },
                  ] as { key: keyof ExitBehaviorStat; label: string; avg: number | null; color: string }[]
                ).map(({ key, label, avg, color }) => {
                  const count = exitBehavior[key] as number;
                  const total = exitBehavior.disciplined_exits + exitBehavior.override_exits + exitBehavior.emotional_exits + exitBehavior.forced_exits;
                  const barPct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-20 shrink-0">
                        <p className="text-xs font-semibold text-slate-700">{label}</p>
                        <p className="text-[10px] text-slate-400">{count} exit{count !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={clsx("h-full rounded-full", color)} style={{ width: `${barPct}%` }} />
                      </div>
                      <div className="w-12 text-right">
                        {avg != null ? (
                          <span className={clsx("text-xs font-bold tabular-nums", avg >= 0 ? "text-green-600" : "text-red-500")}>
                            {avg >= 0 ? "+" : ""}{avg.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {exitBehavior.override_rate > 0.25 && (
                <p className="text-[10.5px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {(exitBehavior.override_rate * 100).toFixed(0)}% of exits deviate from your plan — review whether overrides improved outcomes.
                </p>
              )}
            </section>
          )}

          {trend && (
            <section className="bg-white border border-brand-subtle rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Performance trend</h2>
                <p className="text-[10.5px] text-slate-400 mt-0.5">
                  First half vs most recent trades
                </p>
              </div>
              <div className="space-y-4">
                {(
                  [
                    { label: "Win rate", first: trend.first_half_win_rate * 100, recent: trend.recent_half_win_rate * 100, unit: "%" },
                    { label: "Avg return", first: trend.first_half_avg_return, recent: trend.recent_half_avg_return, unit: "%" },
                  ]
                ).map(({ label, first, recent, unit }) => {
                  const delta = recent - first;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-slate-700">{label}</p>
                        <span className={clsx("text-xs font-bold tabular-nums", delta >= 0 ? "text-green-600" : "text-red-500")}>
                          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}{unit}
                        </span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-300 rounded-full" style={{ width: `${Math.min(Math.abs(first), 100)}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400 w-10 text-right tabular-nums">{first >= 0 ? "+" : ""}{first.toFixed(1)}{unit}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className={clsx("h-full rounded-full", delta >= 0 ? "bg-green-400" : "bg-red-400")} style={{ width: `${Math.min(Math.abs(recent), 100)}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400 w-10 text-right tabular-nums">{recent >= 0 ? "+" : ""}{recent.toFixed(1)}{unit}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-1">
                        <span className="text-[9px] text-slate-300">Earlier</span>
                        <span className="text-[9px] text-slate-300">Recent</span>
                      </div>
                    </div>
                  );
                })}
                <div className={clsx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold",
                  trend.improving ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"
                )}>
                  <span>{trend.improving ? "↑" : "↓"}</span>
                  {trend.improving ? "Your recent trades are outperforming your earlier ones." : "Recent performance is lagging your earlier trades — consider a review."}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Pattern intelligence */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold text-slate-900">
          Pattern intelligence
        </h2>
        {insightsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : insights?.coaching_insights &&
          insights.coaching_insights.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {insights.coaching_insights.map((text, i) => (
              <PatternCard key={i} type={patternType(text)} body={text} />
            ))}
          </div>
        ) : closed.length === 0 ? (
          <div className="bg-white border border-brand-subtle rounded-xl p-6 text-center">
            <p className="text-sm text-slate-500">
              Log and close some trades to unlock AI pattern insights.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
