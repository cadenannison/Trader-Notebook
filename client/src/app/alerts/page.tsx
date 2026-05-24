"use client";

import { useMemo, useState } from "react";

import { clsx } from "clsx";
import {
  Clock,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  useCreateTrigger,
  useDeleteTrigger,
  useUpdateTrigger,
  useTriggers,
} from "@/hooks/useTriggers";
import { useTriggerLogs } from "@/hooks/useTriggerLogs";
import { useStockPrices } from "@/hooks/useStockPrices";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useUndoStore } from "@/store/undoStore";
import type { Portfolio, PriceTrigger, TriggerLog } from "@shared/types";

type Signal = "confluence" | "triggered" | "near" | "monitoring";
type SortMode = "alpha" | "signal" | "count";

// ─── Proximity helpers ────────────────────────────────────────────────────────

function getProximityPct(trigger: PriceTrigger, currentPrice: number): number | null {
  if (trigger.trigger_type !== "price_level" && trigger.trigger_type != null) return null;
  if (trigger.target_price == null || trigger.condition == null) return null;
  if (trigger.condition === "above") {
    return ((trigger.target_price - currentPrice) / currentPrice) * 100;
  }
  return ((currentPrice - trigger.target_price) / currentPrice) * 100;
}

function getSignal(triggers: PriceTrigger[], currentPrice: number): Signal {
  const proximities = triggers
    .map((t) => getProximityPct(t, currentPrice))
    .filter((p): p is number => p !== null);
  const triggered = proximities.filter((p) => p <= 0).length;
  const near = proximities.filter((p) => p > 0 && p <= 5).length;
  if ((triggered > 0 && near > 0) || triggered >= 2 || near >= 2)
    return "confluence";
  if (triggered > 0) return "triggered";
  if (near > 0) return "near";
  return "monitoring";
}

function getSmartAnalysis(
  triggers: PriceTrigger[],
  currentPrice: number
): string {
  const active = triggers.filter((t) => t.is_active);
  const fired = triggers.filter((t) => !t.is_active);
  if (fired.length > 0 && active.length > 0) {
    return `${fired.length} level hit. ${active.length} still watching. Review your thesis before acting on the triggered alert.`;
  }
  if (fired.length > 0) {
    return `A watched level has been hit. Check if price is holding or reversing before logging a trade.`;
  }
  const parts = active
    .filter((t) => t.trigger_type === "price_level" || !t.trigger_type)
    .map((t) => {
      const pct = Math.abs(getProximityPct(t, currentPrice) ?? 0).toFixed(1);
      return `${pct}% ${t.condition === "above" ? "below" : "above"} your $${t.target_price!.toFixed(0)} ${t.condition} target`;
    });
  return parts.length > 0
    ? `Price is ${parts.join(" and ")}.`
    : "Monitoring price action.";
}

const SIGNAL_STYLES: Record<
  Signal,
  { border: string; badge: string; label: string }
> = {
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

// ─── Add / Edit alert modal ───────────────────────────────────────────────────

function AlertModal({
  trigger,
  onClose,
}: {
  trigger?: PriceTrigger;
  onClose: () => void;
}) {
  const isEdit = !!trigger;
  const [ticker, setTicker] = useState(trigger?.ticker ?? "");
  const [targetPrice, setTargetPrice] = useState(
    trigger?.target_price != null ? String(trigger.target_price) : ""
  );
  const [condition, setCondition] = useState<"above" | "below">(
    (trigger?.condition ?? "above") as "above" | "below"
  );
  const [autoDisarm, setAutoDisarm] = useState(trigger?.auto_disarm ?? true);
  const [cooldown, setCooldown] = useState(
    trigger ? String(trigger.cooldown_hours) : "4"
  );
  const [notes, setNotes] = useState(trigger?.notes ?? "");

  const { mutate: createTrigger, isPending: creating } = useCreateTrigger();
  const { mutate: updateTrigger, isPending: updating } = useUpdateTrigger();
  const isPending = creating || updating;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) return;

    if (isEdit) {
      updateTrigger(
        {
          id: trigger.id,
          target_price: price,
          condition,
          auto_disarm: autoDisarm,
          cooldown_hours: parseInt(cooldown) || 4,
          notes: notes || null,
        },
        { onSuccess: onClose }
      );
    } else {
      createTrigger(
        {
          ticker: ticker.toUpperCase(),
          target_price: price,
          condition,
          auto_disarm: autoDisarm,
          cooldown_hours: parseInt(cooldown) || 4,
        },
        { onSuccess: onClose }
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              {isEdit ? "Edit alert" : "New alert"}
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit ? trigger.ticker : "Add price alert"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Ticker
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g. NVDA"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase font-semibold focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                required
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Target price
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Direction
              </label>
              <select
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as "above" | "below")
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-700">
                Auto-disarm after firing
              </p>
              <p className="text-[10.5px] text-slate-400">
                Turns off after the first hit
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoDisarm(!autoDisarm)}
              className={clsx(
                "w-10 h-5.5 rounded-full transition-colors relative shrink-0",
                autoDisarm ? "bg-brand" : "bg-slate-200"
              )}
              style={{ height: "22px", width: "40px" }}
            >
              <span
                className={clsx(
                  "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                  autoDisarm ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {!autoDisarm && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Cooldown (hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Note{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Why this level matters…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Create alert"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Proximity bar ────────────────────────────────────────────────────────────

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
      <div
        className={clsx("h-full rounded-full transition-all", color)}
        style={{ width: `${fill}%` }}
      />
    </div>
  );
}

// ─── Portfolio assign dropdown ────────────────────────────────────────────────

function PortfolioAssign({
  trigger,
  portfolios,
}: {
  trigger: PriceTrigger;
  portfolios: Portfolio[];
}) {
  const [open, setOpen] = useState(false);
  const { mutate: updateTrigger } = useUpdateTrigger();
  const assigned = portfolios.find((p) => p.id === trigger.portfolio_id);

  function assign(portfolioId: string | null) {
    updateTrigger({ id: trigger.id, portfolio_id: portfolioId });
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={assigned ? `In "${assigned.name}"` : "Add to portfolio"}
        className={clsx(
          "p-1 rounded-md transition-colors",
          assigned
            ? "text-brand hover:text-brand-hover"
            : "text-slate-300 hover:text-brand"
        )}
      >
        <FolderOpen size={15} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm overflow-hidden">
            {portfolios.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">
                No portfolios yet
              </p>
            ) : (
              <>
                {portfolios.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      assign(trigger.portfolio_id === p.id ? null : p.id)
                    }
                    className={clsx(
                      "w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2 transition-colors",
                      trigger.portfolio_id === p.id
                        ? "text-brand font-semibold"
                        : "text-slate-700"
                    )}
                  >
                    <span className="truncate">{p.name}</span>
                    {trigger.portfolio_id === p.id && (
                      <span className="text-brand shrink-0">✓</span>
                    )}
                  </button>
                ))}
                {trigger.portfolio_id && (
                  <>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      onClick={() => assign(null)}
                      className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50 transition-colors"
                    >
                      Remove from portfolio
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({
  trigger,
  currentPrice,
  portfolios,
  logs,
  onEdit,
  onDelete,
}: {
  trigger: PriceTrigger;
  currentPrice: number;
  portfolios: Portfolio[];
  logs: TriggerLog[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const pct = getProximityPct(trigger, currentPrice);
  const tType = trigger.trigger_type ?? "price_level";
  const icon =
    tType === "pct_move" ? "%" : tType === "earnings_warning" ? "E" : trigger.condition === "above" ? "↑" : "↓";

  const priceLabel =
    tType === "pct_move"
      ? `±${trigger.threshold_pct}% move`
      : tType === "earnings_warning"
      ? "Earnings"
      : trigger.target_price != null
      ? `$${trigger.target_price.toFixed(2)}`
      : "—";

  return (
    <div>
      <div className="flex items-center gap-2 py-2.5 group pr-3">
        <span className="text-slate-400 text-base w-4 shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-slate-800 tabular-nums w-20 shrink-0">
          {priceLabel}
        </span>
        <span className="text-xs text-slate-400 italic flex-1 truncate min-w-0">
          {trigger.notes || (trigger.is_active ? "Watching…" : "Fired")}
        </span>
        {pct !== null ? <ProximityBar pct={pct} /> : <div className="w-20 shrink-0" />}
        <span
          className={clsx(
            "text-[10.5px] font-semibold tabular-nums w-16 text-right shrink-0",
            pct === null
              ? "text-slate-400"
              : pct <= 0
                ? "text-green-600"
                : pct <= 5
                  ? "text-amber-600"
                  : "text-slate-400"
          )}
        >
          {pct === null ? "Active" : pct <= 0 ? "Triggered" : `${pct.toFixed(1)}% away`}
        </span>

        <div className="flex items-center gap-0.5 shrink-0 mr-4">
          <button
            onClick={() => setShowHistory((v) => !v)}
            title="Fire history"
            className={clsx(
              "p-1 rounded-md transition-colors relative",
              showHistory ? "text-brand" : "text-slate-300 hover:text-slate-500"
            )}
          >
            <Clock size={14} />
            {logs.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-brand rounded-full text-[7px] text-white flex items-center justify-center leading-none">
                {logs.length > 9 ? "9" : logs.length}
              </span>
            )}
          </button>
          <PortfolioAssign trigger={trigger} portfolios={portfolios} />
          <button
            onClick={onEdit}
            title="Edit alert"
            className="p-1 rounded-md text-slate-300 hover:text-brand transition-colors"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            title="Delete alert"
            className="p-1 rounded-md text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="mb-2.5 ml-6 mr-4 rounded-lg border border-slate-100 bg-slate-50 divide-y divide-slate-100">
          {logs.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-slate-400 text-center">
              No fires recorded yet.
            </p>
          ) : (
            logs.slice(0, 5).map((log) => {
              const date = new Date(log.fired_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <div key={log.id} className="px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-semibold text-slate-600">{date}</span>
                    {log.price_at_fire != null && (
                      <span className="text-[10.5px] tabular-nums text-slate-500">
                        ${log.price_at_fire.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {log.summary && (
                    <p className="text-[10.5px] text-slate-400 leading-relaxed line-clamp-2">
                      {log.summary}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ticker group card ────────────────────────────────────────────────────────

function TickerGroupCard({
  ticker,
  triggers,
  portfolios,
  logs,
  priceData,
  onEditTrigger,
  onDeleteTrigger,
  onDeleteAll,
}: {
  ticker: string;
  triggers: PriceTrigger[];
  portfolios: Portfolio[];
  logs: TriggerLog[];
  priceData?: { price: number; change_pct: number };
  onEditTrigger: (t: PriceTrigger) => void;
  onDeleteTrigger: (t: PriceTrigger) => void;
  onDeleteAll: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currentPrice = priceData?.price ?? 0;
  const signal = getSignal(triggers, currentPrice);
  const styles = SIGNAL_STYLES[signal];
  const analysis = getSmartAnalysis(triggers, currentPrice);

  function handleDeleteAll() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDeleteAll();
    setConfirmDelete(false);
  }

  return (
    <div
      className={clsx(
        "bg-white rounded-xl border border-brand-subtle border-l-4 shadow-sm overflow-hidden transition-shadow hover:shadow-md",
        styles.border
      )}
    >
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold text-slate-900 tracking-tight">
              {ticker}
            </span>
            {priceData ? (
              <>
                <span className="text-base font-semibold text-slate-700 tabular-nums">
                  ${priceData.price.toFixed(2)}
                </span>
                <span
                  className={clsx(
                    "text-xs font-medium",
                    priceData.change_pct >= 0
                      ? "text-green-600"
                      : "text-red-500"
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
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={clsx(
              "text-[10.5px] font-semibold px-2.5 py-1 rounded-full",
              styles.badge
            )}
          >
            {styles.label}
          </span>
          {confirmDelete ? (
            <button
              onClick={handleDeleteAll}
              onBlur={() => setConfirmDelete(false)}
              className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-600 border border-red-200 hover:bg-red-200 transition-colors whitespace-nowrap"
            >
              Delete all {triggers.length}?
            </button>
          ) : (
            <button
              onClick={handleDeleteAll}
              title="Delete all alerts for this ticker"
              className="p-1 rounded-md text-slate-300 hover:text-red-500 transition-colors ml-1"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 divide-y divide-brand-subtle">
        {triggers.map((t) => (
          <AlertRow
            key={t.id}
            trigger={t}
            currentPrice={currentPrice}
            portfolios={portfolios}
            logs={logs.filter((l) => l.trigger_id === t.id)}
            onEdit={() => onEditTrigger(t)}
            onDelete={() => onDeleteTrigger(t)}
          />
        ))}
      </div>

      <div className="mx-4 mb-4 mt-3 bg-brand-light border border-brand-subtle rounded-lg px-3 py-2.5 flex items-start justify-between gap-3">
        <p className="text-xs text-slate-600 leading-relaxed flex-1">
          {analysis}
        </p>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { data: triggers = [], refetch } = useTriggers();
  const { data: portfolios = [] } = usePortfolios();
  const { data: triggerLogs = [] } = useTriggerLogs();

  const uniqueTickers = useMemo(
    () => Array.from(new Set(triggers.map((t) => t.ticker))),
    [triggers]
  );
  const { data: livePrices = {}, refetch: refetchPrices } = useStockPrices(uniqueTickers);
  const { mutate: deleteTrigger, mutateAsync: deleteTriggerAsync } =
    useDeleteTrigger();
  const { mutateAsync: createTrigger } = useCreateTrigger();
  const { push: pushUndo } = useUndoStore();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("signal");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<PriceTrigger | null>(
    null
  );

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
      const aP = livePrices[aT]?.price ?? 0;
      const bP = livePrices[bT]?.price ?? 0;
      return (
        SIGNAL_ORDER[getSignal(aTs, aP)] - SIGNAL_ORDER[getSignal(bTs, bP)]
      );
    });
    return entries;
  }, [triggers, search, sort, livePrices]);

  return (
    <>
      {showAddModal && <AlertModal onClose={() => setShowAddModal(false)} />}
      {editingTrigger && (
        <AlertModal
          trigger={editingTrigger}
          onClose={() => setEditingTrigger(null)}
        />
      )}

      <div className="px-8 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              Execution feed
            </p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Alerts
            </h1>
            <p className="text-sm text-slate-500">
              Live proximity to every watched level.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { refetch(); refetchPrices(); }}
              className="flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-hover border border-brand-border hover:border-brand rounded-lg px-3 py-2 transition-colors"
            >
              <RefreshCw size={12} />
              Check prices
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg px-3 py-2 transition-colors"
            >
              <Plus size={13} />
              Add alert
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
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

        {/* Grid */}
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-12 h-12 rounded-xl border border-brand-border flex items-center justify-center">
              <span className="text-brand font-bold text-base">tN</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700">
                No alerts yet
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                Use the chat or click <strong>Add alert</strong> to set price
                levels to watch.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg px-4 py-2 transition-colors"
            >
              <Plus size={13} />
              Add your first alert
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map(([ticker, tickerTriggers]) => (
              <TickerGroupCard
                key={ticker}
                ticker={ticker}
                triggers={tickerTriggers}
                portfolios={portfolios}
                logs={triggerLogs.filter((l) => l.ticker === ticker)}
                priceData={livePrices[ticker]}
                onEditTrigger={setEditingTrigger}
                onDeleteTrigger={(t) => {
                  const snap = { ...t };
                  // mutable ref so redo always uses the latest ID after undo re-creates
                  const ids = { current: snap.id };
                  deleteTrigger(t.id);
                  pushUndo({
                    label: t.trigger_type === "pct_move"
                      ? `Alert deleted: ${t.ticker} ±${t.threshold_pct}% move`
                      : t.trigger_type === "earnings_warning"
                      ? `Alert deleted: ${t.ticker} earnings warning`
                      : `Alert deleted: ${t.ticker} ${t.condition} $${t.target_price}`,
                    undo: async () => {
                      const created = await createTrigger({
                        ticker: snap.ticker,
                        target_price: snap.target_price,
                        condition: snap.condition,
                        auto_disarm: snap.auto_disarm,
                        cooldown_hours: snap.cooldown_hours,
                        notes: snap.notes ?? null,
                        portfolio_id: snap.portfolio_id ?? null,
                      });
                      ids.current = created.id;
                    },
                    redo: async () => {
                      await deleteTriggerAsync(ids.current);
                    },
                  });
                }}
                onDeleteAll={() => {
                  const snaps = tickerTriggers.map((t) => ({ ...t }));
                  // mutable map from original index → latest ID after undo re-creates
                  const ids = snaps.map((t) => ({ current: t.id }));
                  snaps.forEach((t) => deleteTrigger(t.id));
                  pushUndo({
                    label: `Deleted all ${ticker} alerts (${snaps.length})`,
                    undo: async () => {
                      for (let idx = 0; idx < snaps.length; idx++) {
                        const snap = snaps[idx];
                        const created = await createTrigger({
                          ticker: snap.ticker,
                          target_price: snap.target_price,
                          condition: snap.condition,
                          auto_disarm: snap.auto_disarm,
                          cooldown_hours: snap.cooldown_hours,
                          notes: snap.notes ?? null,
                          portfolio_id: snap.portfolio_id ?? null,
                        });
                        ids[idx].current = created.id;
                      }
                    },
                    redo: async () => {
                      for (const id of ids)
                        await deleteTriggerAsync(id.current);
                    },
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
