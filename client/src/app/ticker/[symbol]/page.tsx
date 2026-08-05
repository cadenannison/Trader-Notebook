"use client";

import { useParams, useRouter } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { ArrowLeft } from "lucide-react";

import api from "@/lib/api";
import { useNotes } from "@/hooks/useNotes";
import { useStockPrice } from "@/hooks/useStockPrice";
import { useTrades } from "@/hooks/useTrades";
import { useTriggers } from "@/hooks/useTriggers";
import { useWatchlist } from "@/hooks/useWatchlist";
import type { NewsArticle } from "@shared/types";

// ── helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("bg-white border border-brand-subtle rounded-xl p-5", className)}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em] mb-3">
      {children}
    </p>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("animate-pulse bg-slate-200 rounded", className)} />
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function TickerPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = (params.symbol as string).toUpperCase();

  const { data: price, isLoading: priceLoading } = useStockPrice(symbol);
  const { data: notes = [] } = useNotes(symbol);
  const { data: triggers = [] } = useTriggers(symbol);
  const { data: openTrades = [] } = useTrades({ ticker: symbol, status: "open" });
  const { data: closedTrades = [] } = useTrades({ ticker: symbol, status: "closed" });
  const { data: watchlistEntries = [] } = useWatchlist({ ticker: symbol });

  const watchlistEntry = watchlistEntries[0] ?? null;

  const { data: newsData = [], isError: newsError } = useQuery({
    queryKey: ["news", symbol],
    queryFn: async (): Promise<NewsArticle[]> => {
      const res = await api.get("/api/news", { params: { ticker: symbol } });
      return res.data;
    },
  });

  const activeTriggers = triggers.filter((t) => t.is_active);

  // Avg return_pct across closed trades
  const closedWithReturn = closedTrades.filter((t) => t.return_pct != null);
  const avgReturn =
    closedWithReturn.length > 0
      ? closedWithReturn.reduce((sum, t) => sum + (t.return_pct ?? 0), 0) /
        closedWithReturn.length
      : null;

  const sortedClosed = [...closedTrades].sort((a, b) => {
    const aTime = a.closed_at ? new Date(a.closed_at).getTime() : 0;
    const bTime = b.closed_at ? new Date(b.closed_at).getTime() : 0;
    return bTime - aTime;
  });

  const recentNews = newsData.slice(0, 5);

  return (
    <div className="px-8 py-10 space-y-8 max-w-4xl">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft size={15} />
        Back
      </button>

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-4 flex-wrap">
          <h1 className="text-xl font-bold text-slate-900">{symbol}</h1>
          {priceLoading ? (
            <Skeleton className="h-5 w-28" />
          ) : price ? (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                ${price.price.toFixed(2)}
              </span>
              <span
                className={clsx(
                  "text-sm font-semibold px-2 py-0.5 rounded-full",
                  price.change_pct >= 0
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-600"
                )}
              >
                {price.change_pct >= 0 ? "+" : ""}
                {price.change_pct.toFixed(2)}%
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Open trades
          </p>
          <p className="text-2xl font-bold text-slate-900">{openTrades.length}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Alerts active
          </p>
          <p className="text-2xl font-bold text-slate-900">{activeTriggers.length}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Notes
          </p>
          <p className="text-2xl font-bold text-slate-900">{notes.length}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Avg return
          </p>
          <p
            className={clsx(
              "text-2xl font-bold",
              avgReturn == null
                ? "text-slate-400"
                : avgReturn >= 0
                  ? "text-green-600"
                  : "text-red-500"
            )}
          >
            {avgReturn == null ? "—" : `${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(1)}%`}
          </p>
        </Card>
      </div>

      {/* Open positions */}
      {openTrades.length > 0 && (
        <Card>
          <SectionTitle>Open positions</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-2 text-xs font-semibold text-slate-400 pr-4">
                    Entry price
                  </th>
                  <th className="pb-2 text-xs font-semibold text-slate-400 pr-4">
                    Horizon
                  </th>
                  <th className="pb-2 text-xs font-semibold text-slate-400 pr-4">
                    Confidence
                  </th>
                  <th className="pb-2 text-xs font-semibold text-slate-400">
                    Days held
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {openTrades.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-4 font-medium text-slate-800 tabular-nums">
                      ${t.entry_price.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full capitalize">
                        {t.time_horizon}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={clsx(
                          "text-xs px-2 py-0.5 rounded-full capitalize",
                          t.confidence_tag === "confident"
                            ? "bg-green-50 text-green-700"
                            : t.confidence_tag === "fomo"
                              ? "bg-red-50 text-red-600"
                              : t.confidence_tag === "uncertain"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {t.confidence_tag}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600 tabular-nums">
                      {daysSince(t.logged_at)}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* All alerts */}
      <Card>
        <SectionTitle>All alerts</SectionTitle>
        {triggers.length === 0 ? (
          <p className="text-sm text-slate-400">No alerts set.</p>
        ) : (
          <div className="space-y-2">
            {triggers.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-4 py-2 border-b border-slate-50 last:border-0"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium text-slate-800">
                    {t.condition === "above" ? "Above" : t.condition === "below" ? "Below" : ""}{" "}
                    {t.target_price != null ? `$${t.target_price.toFixed(2)}` : "—"}
                  </p>
                  {t.notes && (
                    <p className="text-xs text-slate-400 truncate">{t.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={clsx(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      t.is_active
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {t.is_active ? "Active" : "Fired"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Watchlist entry */}
      {watchlistEntry && (
        <Card>
          <SectionTitle>Watchlist entry</SectionTitle>
          <div className="space-y-3">
            <p className="text-sm text-slate-700 leading-relaxed">
              {watchlistEntry.reasoning}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              {watchlistEntry.idea_source && (
                <span>
                  Source:{" "}
                  <span className="font-medium text-slate-700 capitalize">
                    {watchlistEntry.idea_source.replace(/_/g, " ")}
                  </span>
                </span>
              )}
              {watchlistEntry.time_horizon && (
                <span>
                  Horizon:{" "}
                  <span className="font-medium text-slate-700 capitalize">
                    {watchlistEntry.time_horizon}
                  </span>
                </span>
              )}
              {watchlistEntry.target_price != null && (
                <span>
                  Target:{" "}
                  <span className="font-medium text-green-600">
                    ${watchlistEntry.target_price.toFixed(2)}
                  </span>
                </span>
              )}
              {watchlistEntry.stop_price != null && (
                <span>
                  Stop:{" "}
                  <span className="font-medium text-red-500">
                    ${watchlistEntry.stop_price.toFixed(2)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Trade history */}
      <Card>
        <SectionTitle>Trade history</SectionTitle>
        {sortedClosed.length === 0 ? (
          <p className="text-sm text-slate-400">No closed trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-2 text-xs font-semibold text-slate-400 pr-4">Entry</th>
                  <th className="pb-2 text-xs font-semibold text-slate-400 pr-4">Exit</th>
                  <th className="pb-2 text-xs font-semibold text-slate-400 pr-4">Return</th>
                  <th className="pb-2 text-xs font-semibold text-slate-400 pr-4">Reason</th>
                  <th className="pb-2 text-xs font-semibold text-slate-400">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedClosed.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-700">
                      ${t.entry_price.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-700">
                      {t.exit_price != null ? `$${t.exit_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums font-semibold">
                      {t.return_pct != null ? (
                        <span
                          className={
                            t.return_pct >= 0 ? "text-green-600" : "text-red-500"
                          }
                        >
                          {t.return_pct >= 0 ? "+" : ""}
                          {fmt(t.return_pct)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {t.exit_reason ? (
                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                          {t.exit_reason.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-500 text-xs">
                      {t.closed_at
                        ? new Date(t.closed_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Journal notes */}
      <Card>
        <SectionTitle>Journal notes</SectionTitle>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-400">No notes yet.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <div
                key={n.id}
                className="py-2 border-b border-slate-50 last:border-0 space-y-1"
              >
                <p className="text-xs text-slate-400">
                  {new Date(n.created_at).toLocaleDateString()}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                  {n.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent news */}
      <Card>
        <SectionTitle>Recent news</SectionTitle>
        {newsError ? (
          <p className="text-sm text-slate-400">Couldn&apos;t load news right now.</p>
        ) : recentNews.length === 0 ? (
          <p className="text-sm text-slate-400">No recent news.</p>
        ) : (
          <div className="space-y-3">
            {recentNews.map((item, i) => (
              <div
                key={i}
                className="py-2 border-b border-slate-50 last:border-0 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-800 hover:text-brand transition-colors leading-snug"
                  >
                    {item.headline}
                  </a>
                  <span
                    className={clsx(
                      "shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      item.sentiment === "bullish"
                        ? "bg-green-50 text-green-700"
                        : item.sentiment === "bearish"
                          ? "bg-red-50 text-red-600"
                          : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {item.sentiment}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {item.source} &middot;{" "}
                  {new Date(item.published_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
