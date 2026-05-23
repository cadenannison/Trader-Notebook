"use client";

import { useState } from "react";

import { clsx } from "clsx";
import { FolderOpen, Plus, Trash2, X } from "lucide-react";

import { useCreateNote, useNotes } from "@/hooks/useNotes";
import {
  usePortfolios,
  useCreatePortfolio,
  useUpdatePortfolio,
  useDeletePortfolio,
} from "@/hooks/usePortfolios";
import {
  useTrades,
  useCloseTrade,
  useUpdateTrade,
  EXIT_REASON_LABELS,
  TIME_HORIZON_LABELS,
} from "@/hooks/useTrades";
import { useTriggers, useUpdateTrigger } from "@/hooks/useTriggers";
import {
  useJournalNotes,
  useCreateJournalNote,
  useUpdateJournalNote,
  useDeleteJournalNote,
} from "@/hooks/useJournalNotes";
import type {
  ConfidenceTag,
  ExitReason,
  JournalNote,
  Portfolio,
  PriceTrigger,
  Trade,
  UserNote,
} from "@shared/types";

const CONFIDENCE_COLORS: Record<ConfidenceTag, string> = {
  confident: "bg-emerald-50 text-emerald-700",
  neutral: "bg-slate-100 text-slate-600",
  uncertain: "bg-amber-50 text-amber-700",
  fomo: "bg-red-50 text-red-600",
};

type Filter = "active" | "triggered" | "trades" | "portfolios" | "notes";

// ─── Close trade modal ────────────────────────────────────────────────────────

function CloseTradeModal({
  trade,
  onClose,
}: {
  trade: Trade;
  onClose: () => void;
}) {
  const [exitPrice, setExitPrice] = useState(String(trade.entry_price));
  const [exitReason, setExitReason] = useState<ExitReason>("hit_target");
  const { mutate: closeTrade, isPending } = useCloseTrade();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(exitPrice);
    if (isNaN(price) || price <= 0) return;
    closeTrade(
      { id: trade.id, exit_price: price, exit_reason: exitReason },
      { onSuccess: onClose }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              Close position
            </p>
            <h2 className="text-lg font-bold text-slate-900">{trade.ticker}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Exit price
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="e.g. 145.50"
              required
            />
            {trade.entry_price && parseFloat(exitPrice) > 0 && (
              <p
                className={clsx(
                  "text-[10.5px] font-medium",
                  parseFloat(exitPrice) >= trade.entry_price
                    ? "text-emerald-600"
                    : "text-red-500"
                )}
              >
                {(
                  ((parseFloat(exitPrice) - trade.entry_price) /
                    trade.entry_price) *
                  100
                ).toFixed(2)}
                % vs entry ${trade.entry_price.toFixed(2)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Exit reason
            </label>
            <select
              value={exitReason}
              onChange={(e) => setExitReason(e.target.value as ExitReason)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
            >
              {(
                Object.entries(EXIT_REASON_LABELS) as [ExitReason, string][]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {isPending ? "Closing…" : "Close trade"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Edit trade modal ─────────────────────────────────────────────────────────

function EditTradeModal({
  trade,
  onClose,
}: {
  trade: Trade;
  onClose: () => void;
}) {
  const [entryPrice, setEntryPrice] = useState(String(trade.entry_price));
  const [timeHorizon, setTimeHorizon] = useState(trade.time_horizon);
  const [confidenceTag, setConfidenceTag] = useState(trade.confidence_tag);
  const [shares, setShares] = useState(
    trade.shares != null ? String(trade.shares) : ""
  );
  const [costBasis, setCostBasis] = useState(
    trade.cost_basis != null ? String(trade.cost_basis) : ""
  );
  const [notes, setNotes] = useState(trade.pre_trade_notes ?? "");
  const [exitPrice, setExitPrice] = useState(
    trade.exit_price != null ? String(trade.exit_price) : ""
  );
  const [exitReason, setExitReason] = useState<ExitReason>(
    (trade.exit_reason as ExitReason) ?? "hit_target"
  );

  const { mutate: updateTrade, isPending } = useUpdateTrade();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Parameters<typeof updateTrade>[0] = { id: trade.id };

    const ep = parseFloat(entryPrice);
    if (!isNaN(ep) && ep > 0) payload.entry_price = ep;
    payload.time_horizon = timeHorizon as import("@shared/types").TimeHorizon;
    payload.confidence_tag =
      confidenceTag as import("@shared/types").ConfidenceTag;
    payload.shares = shares ? parseFloat(shares) : null;
    payload.cost_basis = costBasis ? parseFloat(costBasis) : null;
    payload.pre_trade_notes = notes || null;

    if (trade.status === "closed") {
      const xp = parseFloat(exitPrice);
      if (!isNaN(xp) && xp > 0) payload.exit_price = xp;
      payload.exit_reason = exitReason;
    }

    updateTrade(payload, { onSuccess: onClose });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              Edit trade
            </p>
            <h2 className="text-lg font-bold text-slate-900">{trade.ticker}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Entry price */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Entry price
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              required
            />
          </div>

          {/* Time horizon + confidence side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Horizon
              </label>
              <select
                value={timeHorizon}
                onChange={(e) =>
                  setTimeHorizon(e.target.value as Trade["time_horizon"])
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white"
              >
                {(
                  Object.entries(TIME_HORIZON_LABELS) as [
                    Trade["time_horizon"],
                    string,
                  ][]
                ).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Confidence
              </label>
              <select
                value={confidenceTag}
                onChange={(e) =>
                  setConfidenceTag(e.target.value as Trade["confidence_tag"])
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white capitalize"
              >
                {(
                  [
                    "confident",
                    "neutral",
                    "uncertain",
                    "fomo",
                  ] as Trade["confidence_tag"][]
                ).map((v) => (
                  <option key={v} value={v} className="capitalize">
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Shares + cost basis side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Shares
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="Optional"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Cost basis ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
                placeholder="Optional"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          {/* Pre-trade notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Your thesis, setup, reasoning…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

          {/* Closed trade fields */}
          {trade.status === "closed" && (
            <>
              <div className="border-t border-slate-100 pt-4 space-y-4">
                <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
                  Closed trade details
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">
                    Exit price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                  {exitPrice && entryPrice && (
                    <p
                      className={clsx(
                        "text-[10.5px] font-medium",
                        parseFloat(exitPrice) >= parseFloat(entryPrice)
                          ? "text-emerald-600"
                          : "text-red-500"
                      )}
                    >
                      {(
                        ((parseFloat(exitPrice) - parseFloat(entryPrice)) /
                          parseFloat(entryPrice)) *
                        100
                      ).toFixed(2)}
                      % return
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">
                    Exit reason
                  </label>
                  <select
                    value={exitReason}
                    onChange={(e) =>
                      setExitReason(e.target.value as ExitReason)
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    {(
                      Object.entries(EXIT_REASON_LABELS) as [
                        ExitReason,
                        string,
                      ][]
                    ).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Portfolio modals ─────────────────────────────────────────────────────────

function PortfolioModal({
  portfolio,
  onClose,
}: {
  portfolio?: Portfolio;
  onClose: () => void;
}) {
  const [name, setName] = useState(portfolio?.name ?? "");
  const [thesis, setThesis] = useState(portfolio?.thesis ?? "");
  const { mutate: create, isPending: creating } = useCreatePortfolio();
  const { mutate: update, isPending: updating } = useUpdatePortfolio();
  const isPending = creating || updating;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (portfolio) {
      update(
        { id: portfolio.id, name, thesis: thesis || undefined },
        { onSuccess: onClose }
      );
    } else {
      create({ name, thesis: thesis || undefined }, { onSuccess: onClose });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              {portfolio ? "Edit portfolio" : "New portfolio"}
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              {portfolio ? portfolio.name : "Create group"}
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
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Portfolio name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Infrastructure plays"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Thesis{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              rows={4}
              placeholder="Your overall strategy, thesis, or idea for this group…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {isPending
              ? "Saving…"
              : portfolio
                ? "Save changes"
                : "Create portfolio"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Portfolio detail (expanded view) ────────────────────────────────────────

function PortfolioDetail({
  portfolio,
  triggers,
  onEdit,
  onClose,
}: {
  portfolio: Portfolio;
  triggers: PriceTrigger[];
  onEdit: () => void;
  onClose: () => void;
}) {
  const { mutate: updateTrigger } = useUpdateTrigger();
  const { mutate: createNote, isPending: savingNote } = useCreateNote();
  const { data: allNotes = [] } = useNotes();
  const [noteInput, setNoteInput] = useState("");
  const [noteTicker, setNoteTicker] = useState(triggers[0]?.ticker ?? "");
  const { mutate: deletePortfolio } = useDeletePortfolio();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const portfolioTickers = Array.from(new Set(triggers.map((t) => t.ticker)));
  const portfolioNotes = allNotes.filter((n) =>
    portfolioTickers.includes(n.ticker)
  );

  function removeFromPortfolio(triggerId: string) {
    updateTrigger({ id: triggerId, portfolio_id: null });
  }

  function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteInput.trim() || !noteTicker) return;
    createNote(
      { ticker: noteTicker, content: noteInput.trim() },
      { onSuccess: () => setNoteInput("") }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              Portfolio
            </p>
            <h2 className="text-lg font-bold text-slate-900 truncate">
              {portfolio.name}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onEdit}
              className="text-xs font-medium text-slate-500 hover:text-brand border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Thesis */}
          {portfolio.thesis && (
            <div className="bg-brand-light border border-brand-border rounded-xl p-4">
              <p className="text-[10.5px] font-bold text-brand uppercase tracking-[0.07em] mb-1.5">
                Thesis
              </p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {portfolio.thesis}
              </p>
            </div>
          )}

          {/* Alerts in this portfolio */}
          <div className="space-y-3">
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              Alerts ({triggers.length})
            </p>
            {triggers.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No alerts in this portfolio. Edit an alert and assign it here.
              </p>
            ) : (
              <div className="space-y-2">
                {triggers.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2.5"
                  >
                    <span className="text-[10.5px] font-bold text-brand bg-brand-light px-2 py-0.5 rounded-full">
                      {t.ticker}
                    </span>
                    <span className="text-sm text-slate-700">
                      {t.condition === "above" ? "↑" : "↓"} $
                      {t.target_price.toFixed(2)}
                    </span>
                    {t.notes && (
                      <span className="text-xs text-slate-400 italic flex-1 truncate">
                        {t.notes}
                      </span>
                    )}
                    <span
                      className={clsx(
                        "text-[10.5px] font-semibold px-2 py-0.5 rounded-full ml-auto",
                        t.is_active
                          ? "bg-brand-light text-brand"
                          : "bg-green-50 text-green-700"
                      )}
                    >
                      {t.is_active ? "Active" : "Fired"}
                    </span>
                    <button
                      onClick={() => removeFromPortfolio(t.id)}
                      className="text-slate-300 hover:text-red-400 transition-colors"
                      title="Remove from portfolio"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Note history for tickers in this portfolio */}
          {portfolioNotes.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
                Note history
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {portfolioNotes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white border border-slate-100 rounded-lg px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10.5px] font-bold text-brand bg-brand-light px-1.5 py-0.5 rounded">
                        {note.ticker}
                      </span>
                      <span className="text-[10.5px] text-slate-400">
                        {new Date(note.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {note.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add note */}
          {portfolioTickers.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
                Add note
              </p>
              <form onSubmit={submitNote} className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={noteTicker}
                    onChange={(e) => setNoteTicker(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    {portfolioTickers.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    rows={2}
                    placeholder="Add a note to this ticker…"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingNote || !noteInput.trim()}
                  className="w-full border border-brand text-brand rounded-lg py-2 text-xs font-semibold hover:bg-brand-light transition-colors disabled:opacity-40"
                >
                  {savingNote ? "Saving…" : "Save note"}
                </button>
              </form>
            </div>
          )}

          {/* Delete portfolio */}
          <div className="border-t border-slate-100 pt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={12} />
                Delete portfolio
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-xs text-slate-500 flex-1">
                  Delete &ldquo;{portfolio.name}&rdquo;? Alerts will not be
                  deleted.
                </p>
                <button
                  onClick={() => {
                    deletePortfolio(portfolio.id);
                    onClose();
                  }}
                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Portfolio card ───────────────────────────────────────────────────────────

function PortfolioCard({
  portfolio,
  triggers,
  onOpen,
}: {
  portfolio: Portfolio;
  triggers: PriceTrigger[];
  onOpen: () => void;
}) {
  const tickers = Array.from(new Set(triggers.map((t) => t.ticker)));
  const active = triggers.filter((t) => t.is_active).length;

  return (
    <button
      onClick={onOpen}
      className="text-left bg-white border border-brand-subtle rounded-xl p-4 space-y-3 hover:border-brand hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={14} className="text-brand shrink-0" />
            <span className="text-sm font-bold text-slate-900 truncate">
              {portfolio.name}
            </span>
          </div>
          <p className="text-[10.5px] text-slate-400">
            {triggers.length} alert{triggers.length !== 1 ? "s" : ""} · {active}{" "}
            active
          </p>
        </div>
      </div>

      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tickers.slice(0, 5).map((t) => (
            <span
              key={t}
              className="text-[10.5px] font-semibold text-brand bg-brand-light px-1.5 py-0.5 rounded"
            >
              {t}
            </span>
          ))}
          {tickers.length > 5 && (
            <span className="text-[10.5px] text-slate-400">
              +{tickers.length - 5} more
            </span>
          )}
        </div>
      )}

      {portfolio.thesis && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
          {portfolio.thesis}
        </p>
      )}

      <p className="text-[10.5px] font-semibold text-brand group-hover:underline">
        Open →
      </p>
    </button>
  );
}

// ─── Journal note modal ───────────────────────────────────────────────────────

function JournalNoteModal({
  note,
  onClose,
}: {
  note?: JournalNote;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [tagInput, setTagInput] = useState(note?.tags.join(", ") ?? "");
  const { mutate: create, isPending: creating } = useCreateJournalNote();
  const { mutate: update, isPending: updating } = useUpdateJournalNote();
  const isPending = creating || updating;

  function parseTags(raw: string): string[] {
    return raw
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    const tags = parseTags(tagInput);
    if (note) {
      update(
        { id: note.id, title: title || undefined, content, tags },
        { onSuccess: onClose }
      );
    } else {
      create(
        { title: title || undefined, content, tags },
        { onSuccess: onClose }
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
              {note ? "Edit note" : "New note"}
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              {note ? note.title || "Untitled note" : "Write a note"}
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
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Title{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly market review"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Note</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Write your thoughts, thesis, observations…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Company tags{" "}
              <span className="font-normal text-slate-400">
                (comma separated)
              </span>
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. NVDA, MSFT, AMD"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent uppercase"
            />
            {tagInput.trim() && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tagInput
                  .split(/[\s,]+/)
                  .filter(Boolean)
                  .map((t) => (
                    <span
                      key={t}
                      className="text-[10.5px] font-semibold bg-brand-light text-brand px-2 py-0.5 rounded-full"
                    >
                      {t.toUpperCase()}
                    </span>
                  ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending || !content.trim()}
            className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {isPending ? "Saving…" : note ? "Save changes" : "Save note"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Journal note card ────────────────────────────────────────────────────────

function JournalNoteCard({
  note,
  onEdit,
}: {
  note: JournalNote;
  onEdit: () => void;
}) {
  const { mutate: deleteNote } = useDeleteJournalNote();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const date = new Date(note.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="bg-white border border-brand-subtle rounded-xl p-4 space-y-3 hover:border-brand-border transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          {note.title && (
            <p className="text-sm font-semibold text-slate-900 truncate">
              {note.title}
            </p>
          )}
          <p className="text-[10.5px] text-slate-400">{date}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="text-xs text-slate-400 hover:text-brand transition-colors"
          >
            Edit
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => deleteNote(note.id)}
                className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed line-clamp-4 whitespace-pre-wrap">
        {note.content}
      </p>

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10.5px] font-semibold bg-brand-light text-brand px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

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
      <p
        className={clsx(
          "text-2xl font-bold tabular-nums",
          active ? "text-brand" : "text-slate-900"
        )}
      >
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
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
            Ticker
          </p>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight">
            {trigger.ticker}
          </p>
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
        <span className="text-slate-900">
          ${trigger.target_price.toFixed(2)}
        </span>
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

function TradeCard({
  trade,
  onCloseTrade,
  onEditTrade,
}: {
  trade: Trade;
  onCloseTrade?: () => void;
  onEditTrade?: () => void;
}) {
  const isWin = (trade.return_pct ?? 0) > 0;
  const loggedAt = new Date(trade.logged_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="bg-white border border-brand-subtle rounded-xl p-4 space-y-3 hover:border-brand-border transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-extrabold text-slate-900">
              {trade.ticker}
            </span>
            {trade.status === "open" && (
              <span className="text-[10.5px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Open
              </span>
            )}
            <span
              className={clsx(
                "text-[10.5px] font-semibold px-2 py-0.5 rounded-full capitalize",
                CONFIDENCE_COLORS[trade.confidence_tag]
              )}
            >
              {trade.confidence_tag}
            </span>
            <span className="text-[10.5px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
              {TIME_HORIZON_LABELS[trade.time_horizon]}
            </span>
          </div>
          {trade.pre_trade_notes && (
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
              {trade.pre_trade_notes}
            </p>
          )}
          {trade.exit_reason && (
            <p className="text-[10.5px] text-slate-400">
              Exit:{" "}
              <span className="text-slate-600">
                {EXIT_REASON_LABELS[trade.exit_reason as ExitReason]}
              </span>
            </p>
          )}
        </div>
        {trade.return_pct != null && (
          <span
            className={clsx(
              "text-base font-bold tabular-nums shrink-0",
              isWin ? "text-emerald-600" : "text-red-500"
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
        <div className="flex items-center gap-3">
          {onEditTrade && (
            <button
              onClick={onEditTrade}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              Edit
            </button>
          )}
          {trade.status === "open" && onCloseTrade && (
            <button
              onClick={onCloseTrade}
              className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
            >
              Close trade
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NotebookPage() {
  const { data: triggers = [] } = useTriggers();
  const { data: notes = [] } = useNotes();
  const { data: trades = [], isLoading: tradesLoading } = useTrades();
  const { data: portfolios = [] } = usePortfolios();
  const { data: journalNotes = [] } = useJournalNotes();

  const activeTriggers = triggers.filter((t) => t.is_active);
  const firedTriggers = triggers.filter((t) => !t.is_active);
  const openTrades = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status === "closed");
  const wins = closedTrades.filter((t) => (t.return_pct ?? 0) > 0);
  const winRate =
    closedTrades.length > 0
      ? Math.round((wins.length / closedTrades.length) * 100)
      : null;

  const [filter, setFilter] = useState<Filter>("active");
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [portfolioModal, setPortfolioModal] = useState<
    Portfolio | "new" | null
  >(null);
  const [openPortfolio, setOpenPortfolio] = useState<Portfolio | null>(null);
  const [noteModal, setNoteModal] = useState<JournalNote | "new" | null>(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [noteTagFilter, setNoteTagFilter] = useState<string[]>([]);
  const [noteDateFilter, setNoteDateFilter] = useState<
    "all" | "week" | "month" | "quarter"
  >("all");

  const stats = [
    {
      key: "active" as Filter,
      value: activeTriggers.length,
      label: "Active alerts",
      sub: "watching",
    },
    {
      key: "triggered" as Filter,
      value: firedTriggers.length,
      label: "Triggered",
      sub: "ready to act",
    },
    {
      key: "trades" as Filter,
      value: openTrades.length,
      label: "Open positions",
      sub: "not closed",
    },
    {
      key: "notes" as Filter,
      value: journalNotes.length,
      label: "Notes",
      sub: "journal entries",
    },
  ];

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "active", label: "Active", count: activeTriggers.length },
    { key: "triggered", label: "Triggered", count: firedTriggers.length },
    { key: "trades", label: "Trade history", count: trades.length },
    { key: "portfolios", label: "Portfolios", count: portfolios.length },
    { key: "notes", label: "Notes", count: journalNotes.length },
  ];

  return (
    <>
      {closingTrade && (
        <CloseTradeModal
          trade={closingTrade}
          onClose={() => setClosingTrade(null)}
        />
      )}
      {editingTrade && (
        <EditTradeModal
          trade={editingTrade}
          onClose={() => setEditingTrade(null)}
        />
      )}
      {portfolioModal && (
        <PortfolioModal
          portfolio={portfolioModal === "new" ? undefined : portfolioModal}
          onClose={() => setPortfolioModal(null)}
        />
      )}
      {noteModal && (
        <JournalNoteModal
          note={noteModal === "new" ? undefined : noteModal}
          onClose={() => setNoteModal(null)}
        />
      )}
      {openPortfolio && (
        <PortfolioDetail
          portfolio={openPortfolio}
          triggers={triggers.filter((t) => t.portfolio_id === openPortfolio.id)}
          onEdit={() => {
            setPortfolioModal(openPortfolio);
          }}
          onClose={() => setOpenPortfolio(null)}
        />
      )}
      <div className="px-8 py-10 space-y-8 max-w-4xl">
        {/* Header */}
        <div className="space-y-1">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
            Journal
          </p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Notebook
          </h1>
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
              active={filter === s.key}
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
                  filter === key
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-500"
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
              <p className="text-sm text-slate-400 py-12 text-center">
                No triggered alerts yet.
              </p>
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
            {tradesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white border border-brand-subtle rounded-xl p-4 animate-pulse space-y-3"
                  >
                    <div className="flex gap-2">
                      <div className="h-5 w-16 bg-slate-100 rounded" />
                      <div className="h-5 w-12 bg-slate-100 rounded-full" />
                      <div className="h-5 w-20 bg-slate-100 rounded-full" />
                    </div>
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : trades.length === 0 ? (
              <p className="text-sm text-slate-400 py-12 text-center">
                No trades logged yet. Tell the chat &quot;I bought X shares of
                NVDA at $900&quot;.
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
                        <TradeCard
                          key={t.id}
                          trade={t}
                          onCloseTrade={() => setClosingTrade(t)}
                          onEditTrade={() => setEditingTrade(t)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {closedTrades.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
                      Closed trades
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {closedTrades.map((t) => (
                        <TradeCard
                          key={t.id}
                          trade={t}
                          onEditTrade={() => setEditingTrade(t)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {filter === "portfolios" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {portfolios.length === 0
                  ? "Group related alerts into portfolios with a shared thesis."
                  : `${portfolios.length} portfolio${portfolios.length !== 1 ? "s" : ""}`}
              </p>
              <button
                onClick={() => setPortfolioModal("new")}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg px-3 py-2 transition-colors"
              >
                <Plus size={13} />
                New portfolio
              </button>
            </div>

            {portfolios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="w-12 h-12 rounded-xl border border-brand-border flex items-center justify-center">
                  <FolderOpen size={20} className="text-brand" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-700">
                    No portfolios yet
                  </p>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Create a portfolio to group alerts around a strategy or
                    thesis — like &quot;AI infrastructure plays&quot; or
                    &quot;rate-sensitive names&quot;.
                  </p>
                </div>
                <button
                  onClick={() => setPortfolioModal("new")}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg px-4 py-2 transition-colors"
                >
                  <Plus size={13} />
                  Create your first portfolio
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {portfolios.map((p) => (
                  <PortfolioCard
                    key={p.id}
                    portfolio={p}
                    triggers={triggers.filter((t) => t.portfolio_id === p.id)}
                    onOpen={() => setOpenPortfolio(p)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {filter === "notes" &&
          (() => {
            const cutoff = (() => {
              const now = new Date();
              if (noteDateFilter === "week") {
                const d = new Date(now);
                d.setDate(d.getDate() - 7);
                return d;
              }
              if (noteDateFilter === "month") {
                const d = new Date(now);
                d.setMonth(d.getMonth() - 1);
                return d;
              }
              if (noteDateFilter === "quarter") {
                const d = new Date(now);
                d.setMonth(d.getMonth() - 3);
                return d;
              }
              return null;
            })();

            const allTags = Array.from(
              new Set(journalNotes.flatMap((n) => n.tags))
            ).sort();

            const filtered = journalNotes.filter((n) => {
              if (cutoff && new Date(n.created_at) < cutoff) return false;
              if (
                noteTagFilter.length &&
                !noteTagFilter.every((t) => n.tags.includes(t))
              )
                return false;
              if (noteSearch.trim()) {
                const q = noteSearch.toLowerCase();
                const inTitle = n.title?.toLowerCase().includes(q) ?? false;
                const inContent = n.content.toLowerCase().includes(q);
                const inTags = n.tags.some((t) => t.toLowerCase().includes(q));
                if (!inTitle && !inContent && !inTags) return false;
              }
              return true;
            });

            return (
              <>
                {/* Toolbar */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <input
                      type="text"
                      value={noteSearch}
                      onChange={(e) => setNoteSearch(e.target.value)}
                      placeholder="Search notes…"
                      className="flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                    />
                    <div className="flex items-center gap-1">
                      {(["all", "week", "month", "quarter"] as const).map(
                        (d) => (
                          <button
                            key={d}
                            onClick={() => setNoteDateFilter(d)}
                            className={clsx(
                              "text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                              noteDateFilter === d
                                ? "bg-brand text-white border-brand"
                                : "bg-white text-slate-500 border-slate-200 hover:border-brand hover:text-brand"
                            )}
                          >
                            {d === "all"
                              ? "All time"
                              : d === "week"
                                ? "This week"
                                : d === "month"
                                  ? "This month"
                                  : "3 months"}
                          </button>
                        )
                      )}
                    </div>
                    <button
                      onClick={() => setNoteModal("new")}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg px-3 py-2 transition-colors shrink-0"
                    >
                      <Plus size={13} />
                      New note
                    </button>
                  </div>

                  {/* Tag filter chips */}
                  {allTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() =>
                            setNoteTagFilter((prev) =>
                              prev.includes(tag)
                                ? prev.filter((t) => t !== tag)
                                : [...prev, tag]
                            )
                          }
                          className={clsx(
                            "text-[10.5px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
                            noteTagFilter.includes(tag)
                              ? "bg-brand text-white border-brand"
                              : "bg-white text-slate-500 border-slate-200 hover:border-brand hover:text-brand"
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                      {noteTagFilter.length > 0 && (
                        <button
                          onClick={() => setNoteTagFilter([])}
                          className="text-[10.5px] text-slate-400 hover:text-slate-600 transition-colors px-1"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes grid */}
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      {journalNotes.length === 0
                        ? "No notes yet"
                        : "No notes match your filters"}
                    </p>
                    <p className="text-xs text-slate-400 max-w-xs">
                      {journalNotes.length === 0
                        ? "Write general observations, thesis notes, weekly reviews — anything you want to reference later."
                        : "Try adjusting your search or filters."}
                    </p>
                    {journalNotes.length === 0 && (
                      <button
                        onClick={() => setNoteModal("new")}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg px-4 py-2 transition-colors"
                      >
                        <Plus size={13} />
                        Write your first note
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filtered.map((n) => (
                      <JournalNoteCard
                        key={n.id}
                        note={n}
                        onEdit={() => setNoteModal(n)}
                      />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
      </div>
    </>
  );
}
