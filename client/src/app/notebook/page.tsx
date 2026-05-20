"use client";

import { useState } from "react";

import { clsx } from "clsx";

import { useNotes } from "@/hooks/useNotes";
import { useTriggers } from "@/hooks/useTriggers";
import { MOCK_TRADES } from "@/mocks/trades";
import type { PriceTrigger, Trade, UserNote } from "@shared/types";

type Filter = "active" | "triggered" | "trades";

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  sub,
  active,
  onClick,
}: {
  value: number;
  label: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "text-left p-4 rounded-xl border transition-all",
        active
          ? "border-brand bg-brand-light"
          : "border-brand-subtle bg-white hover:border-brand-border"
      )}
    >
      <p className={clsx("text-2xl font-bold tabular-nums", active ? "text-brand" : "text-slate-900")}>
        {value}
      </p>
      <p className="text-xs font-semibold text-slate-600 mt-0.5">{label}</p>
      {sub && <p className="text-[10.5px] text-slate-400 mt-0.5">{sub}</p>}
    </button>
  );
}

// ─── Watchlist-style card (active / triggered alerts) ────────────────────────

function WatchCard({ trigger }: { trigger: PriceTrigger }) {
  const conditionWord = trigger.condition === "above" ? "Above" : "Below";
  const firedAt = trigger.last_triggered_at
    ? new Date(trigger.last_triggered_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <article className="bg-white border border-brand-subtle rounded-xl p-4 space-y-3 hover:border-brand-border transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">Ticker</p>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight">{trigger.ticker}</p>
        </div>
        <span
          className={clsx(
            "text-[10.5px] font-semibold px-2.5 py-1 rounded-full shrink-0",
            trigger.is_active
              ? "bg-brand-light text-brand"
              : "bg-blue-50 text-blue-700"
          )}
        >
          {trigger.is_active ? "Active" : "Triggered"}
        </span>
      </div>

      {/* Level */}
      <p className="text-sm font-semibold text-slate-700">
        {conditionWord}{" "}
        <span className="text-slate-900">${trigger.target_price.toFixed(2)}</span>
      </p>

      {/* Note / meta */}
      <p className="text-xs text-slate-500 leading-relaxed">
        {trigger.is_active
          ? trigger.auto_disarm
            ? "Watching — disarms on fire."
            : `Repeating · ${trigger.cooldown_hours}h cooldown`
          : firedAt
          ? `Fired ${firedAt}`
          : "Triggered."}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1 border-t border-brand-subtle">
        {!trigger.is_active && (
          <button className="text-xs font-medium text-brand hover:text-brand-hover transition-colors">
            Log trade
          </button>
        )}
        {trigger.is_active && (
          <button className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
            Re-arm
          </button>
        )}
        <button className="text-xs text-slate-400 hover:text-slate-600 transition-colors ml-auto">
          Archive
        </button>
      </div>
    </article>
  );
}

// ─── Note row ────────────────────────────────────────────────────────────────

function NoteRow({ note }: { note: UserNote }) {
  const date = new Date(note.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <article className="bg-white border border-brand-subtle rounded-xl p-4 space-y-2 hover:border-brand-border transition-colors">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-brand bg-brand-light px-2 py-0.5 rounded">
          {note.ticker}
        </span>
        <span className="text-[10.5px] text-slate-400">{date}</span>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">{note.content}</p>
    </article>
  );
}

// ─── Trade card ──────────────────────────────────────────────────────────────

function TradeCard({ trade }: { trade: Trade }) {
  const isWin = (trade.return_pct ?? 0) > 0;
  const loggedAt = new Date(trade.logged_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="bg-white border border-brand-subtle rounded-xl p-4 space-y-3 hover:border-brand-border transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-slate-900">{trade.ticker}</span>
            {trade.status === "open" && (
              <span className="text-[10.5px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Open
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{trade.pre_trade_notes}</p>
        </div>
        {trade.return_pct != null && (
          <span
            className={clsx(
              "text-base font-bold tabular-nums shrink-0",
              isWin ? "text-green-600" : "text-red-500"
            )}
          >
            {isWin ? "+" : ""}
            {trade.return_pct.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-brand-subtle">
        <span className="text-[10.5px] text-slate-400">
          {trade.exit_price
            ? `$${trade.entry_price.toFixed(2)} → $${trade.exit_price.toFixed(2)} · ${loggedAt}`
            : `Entry $${trade.entry_price.toFixed(2)} · ${loggedAt}`}
        </span>
        {trade.status === "open" && (
          <button className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors">
            Close trade
          </button>
        )}
      </div>
    </article>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NotebookPage() {
  const { data: triggers = [] } = useTriggers();
  const { data: notes = [] } = useNotes();
  const trades = MOCK_TRADES;

  const activeTriggers = triggers.filter((t) => t.is_active);
  const firedTriggers = triggers.filter((t) => !t.is_active);
  const openTrades = trades.filter((t) => t.status === "open");

  const [filter, setFilter] = useState<Filter>("active");

  const stats = [
    { key: "active" as Filter, value: activeTriggers.length, label: "Active alerts", sub: "watching" },
    { key: "triggered" as Filter, value: firedTriggers.length, label: "Triggered", sub: "ready to act" },
    { key: "trades" as Filter, value: trades.length, label: "Total trades", sub: "logged" },
    { key: "trades" as Filter, value: openTrades.length, label: "Open positions", sub: "not yet closed" },
  ];

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "active", label: "Active", count: activeTriggers.length },
    { key: "triggered", label: "Triggered", count: firedTriggers.length },
    { key: "trades", label: "Trade history", count: trades.length },
  ];

  return (
    <div className="px-8 py-10 space-y-8 max-w-4xl">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">Journal</p>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Notebook</h1>
        <p className="text-sm text-slate-500">
          Keep every setup visible and easy to act on.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <StatCard
            key={i}
            value={s.value}
            label={s.label}
            sub={s.sub}
            active={filter === s.key && (s.key !== "trades" || i >= 2)}
            onClick={() => setFilter(s.key)}
          />
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-brand-subtle">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              filter === key
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {label}
            <span
              className={clsx(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                filter === key ? "bg-brand text-white" : "bg-slate-100 text-slate-500"
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {filter === "active" && (
        <>
          {activeTriggers.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">
              No active alerts. Go to Chat and tell me what levels to watch.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeTriggers.map((t) => (
                <WatchCard key={t.id} trigger={t} />
              ))}
            </div>
          )}
        </>
      )}

      {filter === "triggered" && (
        <>
          {firedTriggers.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No triggered alerts yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {firedTriggers.map((t) => (
                <WatchCard key={t.id} trigger={t} />
              ))}
            </div>
          )}
        </>
      )}

      {filter === "trades" && (
        <>
          {trades.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">
              No trades logged. Use &quot;Log trade&quot; on a triggered alert.
            </p>
          ) : (
            <div className="space-y-6">
              {openTrades.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
                    Open positions
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {openTrades.map((t) => (
                      <TradeCard key={t.id} trade={t} />
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
                  Closed trades
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {trades
                    .filter((t) => t.status === "closed")
                    .map((t) => (
                      <TradeCard key={t.id} trade={t} />
                    ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
