"use client";

import { useState } from "react";

import { clsx } from "clsx";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";

import {
  IDEA_SOURCE_LABELS,
  useCreateWatchlistEntry,
  useDeleteWatchlistEntry,
  useUpdateWatchlistEntry,
  useWatchlist,
} from "@/hooks/useWatchlist";
import { useUndoStore } from "@/store/undoStore";
import type {
  IdeaSource,
  TimeHorizon,
  WatchlistEntry,
  WatchlistStatus,
} from "@shared/types";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<WatchlistStatus, { badge: string; label: string }> =
  {
    watching: { badge: "bg-slate-100 text-slate-600", label: "Watching" },
    active_trade: { badge: "bg-brand-light text-brand", label: "Active trade" },
    completed: { badge: "bg-green-50 text-green-700", label: "Completed" },
    expired: { badge: "bg-red-50 text-red-500", label: "Expired" },
  };

const HORIZON_LABELS: Record<TimeHorizon, string> = {
  intraday: "Intraday",
  swing: "Swing",
  position: "Position",
};

type FilterTab = "all" | WatchlistStatus;

// ─── Entry modal ──────────────────────────────────────────────────────────────

function EntryModal({
  entry,
  onClose,
}: {
  entry?: WatchlistEntry;
  onClose: () => void;
}) {
  const isEdit = !!entry;
  const [ticker, setTicker] = useState(entry?.ticker ?? "");
  const [reasoning, setReasoning] = useState(entry?.reasoning ?? "");
  const [ideaSource, setIdeaSource] = useState<IdeaSource>(
    entry?.idea_source ?? "own_research"
  );
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>(
    entry?.time_horizon ?? "swing"
  );
  const [entryPrice, setEntryPrice] = useState(
    entry?.entry_price ? String(entry.entry_price) : ""
  );
  const [targetPrice, setTargetPrice] = useState(
    entry?.target_price ? String(entry.target_price) : ""
  );
  const [stopPrice, setStopPrice] = useState(
    entry?.stop_price ? String(entry.stop_price) : ""
  );
  const [status, setStatus] = useState<WatchlistStatus>(
    entry?.status ?? "watching"
  );

  const { mutate: create, isPending: creating } = useCreateWatchlistEntry();
  const { mutate: update, isPending: updating } = useUpdateWatchlistEntry();
  const isPending = creating || updating;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      reasoning,
      idea_source: ideaSource,
      time_horizon: timeHorizon,
      entry_price: entryPrice ? parseFloat(entryPrice) : null,
      target_price: targetPrice ? parseFloat(targetPrice) : null,
      stop_price: stopPrice ? parseFloat(stopPrice) : null,
    };
    if (isEdit) {
      update({ id: entry.id, ...payload, status }, { onSuccess: onClose });
    } else {
      create(
        { ticker: ticker.toUpperCase(), ...payload },
        { onSuccess: onClose }
      );
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          {isEdit ? `Edit ${entry.ticker}` : "Add watchlist idea"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Ticker
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g. NVDA"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase font-semibold focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Thesis / reasoning
            </label>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              rows={3}
              required
              placeholder="Why are you watching this…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Idea source
              </label>
              <select
                value={ideaSource}
                onChange={(e) => setIdeaSource(e.target.value as IdeaSource)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {(Object.keys(IDEA_SOURCE_LABELS) as IdeaSource[]).map((s) => (
                  <option key={s} value={s}>
                    {IDEA_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Time horizon
              </label>
              <select
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(e.target.value as TimeHorizon)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {(Object.keys(HORIZON_LABELS) as TimeHorizon[]).map((h) => (
                  <option key={h} value={h}>
                    {HORIZON_LABELS[h]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Entry $", val: entryPrice, set: setEntryPrice },
              { label: "Target $", val: targetPrice, set: setTargetPrice },
              { label: "Stop $", val: stopPrice, set: setStopPrice },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {label}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  placeholder="—"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
            ))}
          </div>

          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WatchlistStatus)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {(Object.keys(STATUS_STYLES) as WatchlistStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_STYLES[s].label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2 text-sm font-semibold bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {isPending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Add to watchlist"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Watchlist card ───────────────────────────────────────────────────────────

function WatchlistCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: WatchlistEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const styles = STATUS_STYLES[entry.status];

  return (
    <article className="bg-white border border-brand-subtle rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-extrabold text-slate-900 tracking-tight">
            {entry.ticker}
          </span>
          <span
            className={clsx(
              "text-[10.5px] font-semibold px-2 py-0.5 rounded-full",
              styles.badge
            )}
          >
            {styles.label}
          </span>
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {IDEA_SOURCE_LABELS[entry.idea_source]}
          </span>
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {HORIZON_LABELS[entry.time_horizon]}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded-md text-slate-300 hover:text-brand transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-md text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">
        {entry.reasoning}
      </p>

      {/* Price levels */}
      {(entry.entry_price || entry.target_price || entry.stop_price) && (
        <div className="flex items-center gap-4 pt-1">
          {entry.entry_price && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                Entry
              </p>
              <p className="text-sm font-bold text-slate-700 tabular-nums">
                ${entry.entry_price.toFixed(2)}
              </p>
            </div>
          )}
          {entry.target_price && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                Target
              </p>
              <p className="text-sm font-bold text-green-600 tabular-nums">
                ${entry.target_price.toFixed(2)}
              </p>
            </div>
          )}
          {entry.stop_price && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                Stop
              </p>
              <p className="text-sm font-bold text-red-500 tabular-nums">
                ${entry.stop_price.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-[10.5px] text-slate-400">
        Added{" "}
        {new Date(entry.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
    </article>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS: Array<{ key: FilterTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "watching", label: "Watching" },
  { key: "active_trade", label: "Active trade" },
  { key: "completed", label: "Completed" },
];

export default function WatchlistPage() {
  const [tab, setTab] = useState<FilterTab>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<WatchlistEntry | null>(null);

  const { data: entries = [], isLoading } = useWatchlist(
    tab === "all" ? undefined : { status: tab as WatchlistStatus }
  );
  const { mutateAsync: deleteEntry } = useDeleteWatchlistEntry();
  const { mutateAsync: createEntry } = useCreateWatchlistEntry();
  const { push: pushUndo } = useUndoStore();

  function handleDelete(entry: WatchlistEntry) {
    const snap = { ...entry };
    const ids = { current: snap.id };
    deleteEntry(ids.current);
    pushUndo({
      label: `Deleted ${snap.ticker} watchlist idea`,
      undo: async () => {
        const created = await createEntry({
          ticker: snap.ticker,
          reasoning: snap.reasoning,
          idea_source: snap.idea_source,
          time_horizon: snap.time_horizon,
          entry_price: snap.entry_price,
          target_price: snap.target_price,
          stop_price: snap.stop_price,
        });
        ids.current = created.id;
      },
      redo: async () => {
        await deleteEntry(ids.current);
      },
    });
  }

  const watching = entries.filter((e) => e.status === "watching").length;
  const active = entries.filter((e) => e.status === "active_trade").length;

  return (
    <div className="px-8 py-10 max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between gap-6 mb-8">
        <div className="space-y-1">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
            Ideas & setups
          </p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Watchlist
          </h1>
          <p className="text-sm text-slate-500">
            {watching > 0 && `${watching} watching`}
            {watching > 0 && active > 0 && " · "}
            {active > 0 && `${active} active trade${active !== 1 ? "s" : ""}`}
            {watching === 0 && active === 0 && "Track your ideas and setups"}
          </p>
        </div>
        <button
          onClick={() => {
            setEditEntry(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-hover transition-colors"
        >
          <Plus size={15} />
          Add idea
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
              tab === key
                ? "bg-brand text-white"
                : "text-slate-500 hover:bg-brand-light hover:text-brand"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-brand-subtle rounded-xl p-4 h-40 animate-pulse"
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <Eye size={32} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No ideas yet</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Tell the chat "I like NVDA for an earnings play" and it'll appear
            here automatically.
          </p>
          <button
            onClick={() => {
              setEditEntry(null);
              setModalOpen(true);
            }}
            className="mt-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-hover transition-colors"
          >
            Add manually
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {entries.map((entry) => (
            <WatchlistCard
              key={entry.id}
              entry={entry}
              onEdit={() => {
                setEditEntry(entry);
                setModalOpen(true);
              }}
              onDelete={() => handleDelete(entry)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <EntryModal
          entry={editEntry ?? undefined}
          onClose={() => {
            setModalOpen(false);
            setEditEntry(null);
          }}
        />
      )}
    </div>
  );
}
