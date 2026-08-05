"use client";

import React, { useEffect, useRef } from "react";

import { clsx } from "clsx";
import {
  BarChart2,
  Bell,
  Check,
  Calculator,
  Eye,
  FileText,
  History,
  Lightbulb,
  Mic,
  MicOff,
  Newspaper,
  Send,
  Sunrise,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { streamChat } from "@/lib/api";
import { useAppStore as useAppStoreRaw } from "@/store/appStore";
import {
  useCreateTrigger,
  useDeleteTrigger,
  useRearmTrigger,
  useTriggers,
  useUpdateTrigger,
} from "@/hooks/useTriggers";
import {
  useCreateWatchlistEntry,
  useDeleteWatchlistEntry,
  useUpdateWatchlistEntry,
  useWatchlist,
} from "@/hooks/useWatchlist";
import { PreTradeChecklist } from "@/components/PreTradeChecklist";
import { PostTradeDebrief } from "@/components/PostTradeDebrief";
import {
  useCreateTrade,
  useDeleteTrade,
  useCloseTrade,
  useTrades,
  useUpdateTrade,
} from "@/hooks/useTrades";
import {
  useCreatePortfolio,
  useDeletePortfolio,
  useUpdatePortfolio,
  usePortfolios,
} from "@/hooks/usePortfolios";
import {
  useCreateJournalNote,
  useDeleteJournalNote,
  useJournalNotes,
  useUpdateJournalNote,
} from "@/hooks/useJournalNotes";
import {
  useAppStore,
  type ChatAction,
  type ChatMessage,
  type ToolUsed,
} from "@/store/appStore";
import { useUndoStore } from "@/store/undoStore";
import type {
  IdeaSource,
  TimeHorizon,
  ConfidenceTag,
  ExitReason,
} from "@shared/types";

const TOOL_META: Record<
  string,
  { label: string; Icon: React.ElementType }
> = {
  get_stock_price: { label: "Price", Icon: TrendingUp },
  get_news: { label: "News", Icon: Newspaper },
  get_notes: { label: "Notes", Icon: FileText },
  get_alerts: { label: "Alerts", Icon: Bell },
  get_positions: { label: "Positions", Icon: BarChart2 },
  get_watchlist: { label: "Watchlist", Icon: Eye },
  get_trade_history: { label: "Trade history", Icon: History },
  calculate_position_size: { label: "Position size", Icon: Calculator },
  get_insights: { label: "Insights", Icon: Lightbulb },
  get_briefing: { label: "Briefing", Icon: Sunrise },
  get_analyst_ratings: { label: "Analyst ratings", Icon: Users },
};

function PriceCard({
  ticker,
  price,
  changePct,
}: {
  ticker: string;
  price: number;
  changePct: number;
}) {
  const isUp = changePct >= 0;
  return (
    <div className="mx-4 mb-2 inline-flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
      <span className="text-sm font-bold text-slate-900">{ticker}</span>
      <span className="text-sm font-bold tabular-nums text-slate-800">
        ${price.toFixed(2)}
      </span>
      <span
        className={clsx(
          "text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded",
          isUp ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
        )}
      >
        {isUp ? "+" : ""}
        {changePct.toFixed(2)}%
      </span>
    </div>
  );
}

function getFollowUps(msg: { toolsUsed?: { name: string }[]; actions?: { type: string }[] }): string[] {
  const toolNames = msg.toolsUsed?.map((t) => t.name) ?? [];
  const actionTypes = msg.actions?.map((a) => a.type) ?? [];
  if (toolNames.includes("get_stock_price") && !actionTypes.includes("add_alert")) {
    return ["Set an alert at this level", "Log a trade"];
  }
  if (toolNames.includes("get_news")) {
    return ["Add a note on this", "Set an alert"];
  }
  if (toolNames.includes("get_trade_history")) {
    return ["View my stats", "What about my open positions?"];
  }
  if (actionTypes.includes("add_alert")) {
    return ["View my alerts", "Add another ticker"];
  }
  if (actionTypes.includes("log_trade") || actionTypes.includes("close_trade")) {
    return ["View my stats", "Set an exit alert"];
  }
  return [];
}

const HINTS = [
  "Alert me when NVDA breaks above $1,000",
  "What's TSLA trading at right now?",
  "Any news on AAPL this week?",
  "I bought 50 shares of META at $550, feeling confident",
];

const VIEW_PATHS: Record<string, string> = {
  alerts: "/alerts",
  notebook: "/notebook",
  news: "/news",
  stats: "/stats",
  watchlist: "/notebook",
};

export default function ChatPage() {
  const router = useRouter();
  const { mutateAsync: createTrigger } = useCreateTrigger();
  const { mutateAsync: createWatchlistEntry } = useCreateWatchlistEntry();
  const { mutateAsync: createTrade } = useCreateTrade();
  const { mutateAsync: closeTrade } = useCloseTrade();
  const { mutateAsync: createPortfolio } = useCreatePortfolio();
  const { mutate: updateTrigger } = useUpdateTrigger();
  const { mutateAsync: deleteTriggerAsync } = useDeleteTrigger();
  const { data: triggers = [] } = useTriggers();
  const { data: portfolios = [] } = usePortfolios();
  const { mutateAsync: deletePortfolio } = useDeletePortfolio();
  const { mutate: updatePortfolio } = useUpdatePortfolio();
  const { mutateAsync: createJournalNote } = useCreateJournalNote();
  const { mutateAsync: deleteJournalNote } = useDeleteJournalNote();
  const { mutate: updateJournalNote } = useUpdateJournalNote();
  const { mutateAsync: deleteWatchlistEntry } = useDeleteWatchlistEntry();
  const { mutate: updateWatchlistEntry } = useUpdateWatchlistEntry();
  const { mutateAsync: deleteTrade } = useDeleteTrade();
  const { mutate: updateTrade } = useUpdateTrade();
  const { mutate: rearmTrigger } = useRearmTrigger();
  const { push: pushUndo } = useUndoStore();
  const { data: watchlistEntries = [] } = useWatchlist();
  const { data: openTrades = [] } = useTrades({ status: "open" });
  const { data: journalNotes = [] } = useJournalNotes();

  const {
    chatMessages: messages,
    addChatMessage,
    updateChatMessage,
  } = useAppStore();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pendingTradeChecklist, setPendingTradeChecklist] = useState<{
    act: ChatAction;
    resolve: (notes: string | null) => void;
  } | null>(null);
  const [pendingDebrief, setPendingDebrief] = useState<{
    act: ChatAction;
    resolve: (notes: string | null) => void;
  } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isTyping) return;

    addChatMessage({ id: Date.now().toString(), role: "user", text });
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsTyping(true);

    const history = messages.map((m) => ({
      role: m.role === "ai" ? "model" : "user",
      text: m.text,
    }));

    const aiId = (Date.now() + 1).toString();
    let msgAdded = false;
    let finalActionList: ChatAction[] = [];

    // Track portfolios created in this batch so later actions can reference them.
    const newPortfolioIds: Record<string, string> = {};
    const resolvePortfolioId = (name: string): string | null => {
      const lower = name.toLowerCase();
      return (
        newPortfolioIds[lower] ??
        portfolios.find((p) => p.name.toLowerCase() === lower)?.id ??
        null
      );
    };

    // Resolves an open position by ticker, optionally disambiguated by entry_price.
    // Chat-driven trade mutation is restricted to open positions — closed trades
    // carry exit/P&L data that undo/redo can't reconstruct, so history stays UI-only.
    const resolveOpenTrade = (ticker: string, entryPrice?: number | null) => {
      const upper = ticker.toUpperCase();
      const candidates = openTrades.filter((t) => t.ticker === upper);
      if (entryPrice != null) {
        // An entry_price was given specifically to disambiguate multiple open
        // positions on this ticker — if none match, fail closed rather than
        // silently acting on the wrong lot (e.g. a slightly-off float from the AI).
        return candidates.length > 1
          ? candidates.find((t) => t.entry_price === entryPrice) ?? null
          : candidates[0] ?? null;
      }
      return candidates[0] ?? null;
    };

    // Resolves a journal note by ticker tag first, then title substring match.
    // Only returns a match when exactly one note qualifies — ambiguity is left
    // to the system prompt's clarifying-question rule rather than guessed here.
    const resolveJournalNote = (tags?: string[] | null, title?: string | null) => {
      let candidates = journalNotes;
      if (tags?.length) {
        const upperTags = tags.map((t) => t.toUpperCase());
        const byTag = candidates.filter((n) =>
          (n.tags ?? []).some((t) => upperTags.includes(t.toUpperCase()))
        );
        if (byTag.length) candidates = byTag;
      }
      if (title) {
        const lowerTitle = title.toLowerCase();
        const byTitle = candidates.filter((n) =>
          (n.title ?? "").toLowerCase().includes(lowerTitle)
        );
        if (byTitle.length) candidates = byTitle;
      }
      return candidates.length === 1 ? candidates[0] : null;
    };

    // Resolves a watchlist entry by ticker. When multiple entries share a
    // ticker (e.g. an old completed idea and a newer one re-added later),
    // prefer "live" entries (watching / active_trade) over historical ones
    // (completed / expired) — that's almost always what "update/delete my X
    // watchlist entry" means. Falls back to newest-first (the array's
    // existing server order) as the final tiebreaker. Unlike resolveOpenTrade,
    // there's no explicit disambiguator field the AI could supply here, so we
    // don't fail closed on remaining ambiguity — that would regress the
    // common single-match case.
    const resolveWatchlistEntry = (ticker: string) => {
      const upper = ticker.toUpperCase();
      const candidates = watchlistEntries.filter((e) => e.ticker === upper);
      const live = candidates.filter(
        (e) => e.status === "watching" || e.status === "active_trade"
      );
      return (live.length ? live : candidates)[0] ?? null;
    };

    const ensureMsg = () => {
      if (!msgAdded) {
        msgAdded = true;
        setIsTyping(false);
        addChatMessage({
          id: aiId,
          role: "ai",
          text: "",
          actions: [],
          actionsCreated: [],
          toolsUsed: [],
          isStreaming: true,
        });
      }
    };

    try {
      await streamChat(text, history, (event) => {
        ensureMsg();
        const store = useAppStoreRaw.getState();

        if (event.type === "tool_start") {
          const cur = store.chatMessages.find((m) => m.id === aiId);
          store.updateChatMessage(aiId, {
            toolsUsed: [
              ...(cur?.toolsUsed ?? []),
              { name: event.name!, ticker: event.ticker, summary: "fetching...", loading: true },
            ],
          });
        } else if (event.type === "tool_done") {
          const cur = store.chatMessages.find((m) => m.id === aiId);
          store.updateChatMessage(aiId, {
            toolsUsed: (cur?.toolsUsed ?? []).map((t) =>
              t.name === event.name! && t.loading
                ? { name: event.name!, ticker: event.ticker, summary: event.summary!, loading: false, data: event.data }
                : t
            ),
          });
        } else if (event.type === "done") {
          finalActionList = (event.actions ?? []) as ChatAction[];
          store.updateChatMessage(aiId, {
            text: event.message ?? "",
            actions: finalActionList,
            actionsCreated: finalActionList.map(() => false),
            toolsUsed: (event.tools_used ?? []).map((t) => ({ ...t, loading: false })),
            isStreaming: false,
          });
        } else if (event.type === "error") {
          store.updateChatMessage(aiId, {
            text: event.message ?? "Something went wrong.",
            isStreaming: false,
          });
        }
      });
    } catch {
      const store = useAppStoreRaw.getState();
      if (msgAdded) {
        store.updateChatMessage(aiId, {
          text: "Something went wrong — make sure the server is running.",
          isStreaming: false,
        });
      } else {
        addChatMessage({
          id: aiId,
          role: "ai",
          text: "Something went wrong — make sure the server is running.",
        });
      }
    } finally {
      setIsTyping(false);
    }

    // Execute actions after streaming resolves
    for (let i = 0; i < finalActionList.length; i++) {
      const act = finalActionList[i];
      const markCreated = () =>
        updateChatMessage(aiId, {
          actionsCreated: finalActionList.map((_, j) => j <= i),
        });

      try {
        if (act.type === "show_view" && act.view) {
          const path = VIEW_PATHS[act.view];
          if (path) setTimeout(() => router.push(path), 900);
        } else if (
          act.type === "add_alert" &&
          act.ticker &&
          (
            ((!act.trigger_type || act.trigger_type === "price_level") && act.price && act.condition) ||
            (act.trigger_type === "pct_move" && act.threshold_pct) ||
            act.trigger_type === "earnings_warning"
          )
        ) {
          const portfolioId = act.portfolio_name
            ? resolvePortfolioId(act.portfolio_name)
            : null;
          const triggerType = (act.trigger_type ?? "price_level") as "price_level" | "pct_move" | "earnings_warning";
          const triggerPayload = {
            ticker: act.ticker,
            trigger_type: triggerType,
            target_price: act.price ?? null,
            condition: (act.condition ?? null) as "above" | "below" | null,
            threshold_pct: act.threshold_pct ?? null,
            auto_disarm: true,
            cooldown_hours: 4,
            notes: act.note ?? null,
            portfolio_id: portfolioId,
          };
          const createdTrigger = await createTrigger(triggerPayload);
          const snapPayload = { ...triggerPayload };
          const triggerIds = { current: createdTrigger.id };
          const undoLabel =
            triggerType === "pct_move"
              ? `Alert set: ${act.ticker} moves ${act.threshold_pct}%`
              : triggerType === "earnings_warning"
              ? `Alert set: ${act.ticker} earnings warning`
              : `Alert set: ${act.ticker} ${act.condition} $${act.price}`;
          pushUndo({
            label: undoLabel,
            undo: async () => { await deleteTriggerAsync(triggerIds.current); },
            redo: async () => {
              const t = await createTrigger(snapPayload);
              triggerIds.current = t.id;
            },
          });
          markCreated();
        } else if (act.type === "log_idea" && act.ticker && act.reasoning) {
          const entry = await createWatchlistEntry({
            ticker: act.ticker,
            reasoning: act.reasoning,
            idea_source: (act.idea_source as IdeaSource) ?? "own_research",
            time_horizon: (act.time_horizon as TimeHorizon) ?? "swing",
            entry_price: act.entry_price ?? null,
            target_price: act.target_price ?? null,
            stop_price: act.stop_price ?? null,
          });
          const snapAct = { ...act };
          const entryIds = { current: entry.id };
          pushUndo({
            label: `Watchlist: ${act.ticker}`,
            undo: async () => { await deleteWatchlistEntry(entryIds.current); },
            redo: async () => {
              const e = await createWatchlistEntry({
                ticker: snapAct.ticker!,
                reasoning: snapAct.reasoning!,
                idea_source: (snapAct.idea_source as IdeaSource) ?? "own_research",
                time_horizon: (snapAct.time_horizon as TimeHorizon) ?? "swing",
                entry_price: snapAct.entry_price ?? null,
                target_price: snapAct.target_price ?? null,
                stop_price: snapAct.stop_price ?? null,
              });
              entryIds.current = e.id;
            },
          });
          markCreated();
        } else if (act.type === "log_trade" && act.ticker && act.entry_price) {
          // Show pre-trade checklist and wait for user response
          const checklistNotes = await new Promise<string | null>((resolve) => {
            setPendingTradeChecklist({ act, resolve });
          });
          // null means user cancelled — skip this trade
          if (checklistNotes === null) continue;

          const trade = await createTrade({
            ticker: act.ticker,
            entry_price: act.entry_price,
            time_horizon: (act.time_horizon as TimeHorizon) ?? "swing",
            confidence_tag: (act.confidence_tag as ConfidenceTag) ?? "neutral",
            cost_basis: act.cost_basis ?? null,
            shares: act.shares ?? null,
            watchlist_entry_id: act.watchlist_entry_id ?? null,
            pre_trade_notes: checklistNotes,
          });
          const snapAct = { ...act };
          const snapNotes = checklistNotes;
          const tradeIds = { current: trade.id };
          pushUndo({
            label: `Trade logged: ${act.ticker} @ $${act.entry_price}`,
            undo: async () => { await deleteTrade(tradeIds.current); },
            redo: async () => {
              const tr = await createTrade({
                ticker: snapAct.ticker!,
                entry_price: snapAct.entry_price!,
                time_horizon: (snapAct.time_horizon as TimeHorizon) ?? "swing",
                confidence_tag: (snapAct.confidence_tag as ConfidenceTag) ?? "neutral",
                cost_basis: snapAct.cost_basis ?? null,
                shares: snapAct.shares ?? null,
                watchlist_entry_id: snapAct.watchlist_entry_id ?? null,
                pre_trade_notes: snapNotes,
              });
              tradeIds.current = tr.id;
            },
          });
          markCreated();
        } else if (
          act.type === "close_trade" &&
          act.ticker &&
          act.exit_price &&
          act.exit_reason
        ) {
          const target = resolveOpenTrade(act.ticker, act.entry_price);
          if (target) {
            const debriefNotes = await new Promise<string | null>((resolve) => {
              setPendingDebrief({ act, resolve });
            });
            await closeTrade({
              id: target.id,
              exit_price: act.exit_price,
              exit_reason: act.exit_reason as ExitReason,
              post_trade_notes: debriefNotes ?? undefined,
            });
            markCreated();
          }
        } else if (act.type === "update_trade" && act.ticker) {
          const target = resolveOpenTrade(act.ticker, act.entry_price);
          if (target) {
            const updates: Record<string, unknown> = {};
            if (act.new_entry_price != null) updates.entry_price = act.new_entry_price;
            if (act.new_shares != null) updates.shares = act.new_shares;
            if (act.new_confidence_tag) updates.confidence_tag = act.new_confidence_tag;
            if (act.new_time_horizon) updates.time_horizon = act.new_time_horizon;
            if (act.new_cost_basis != null) updates.cost_basis = act.new_cost_basis;
            if (Object.keys(updates).length) {
              updateTrade({ id: target.id, ...updates });
              markCreated();
            }
          }
        } else if (act.type === "delete_trade" && act.ticker) {
          const target = resolveOpenTrade(act.ticker, act.entry_price);
          if (target) {
            const snapTrade = { ...target };
            await deleteTrade(target.id);
            const tradeIds = { current: target.id };
            pushUndo({
              label: `Trade deleted: ${act.ticker}`,
              undo: async () => {
                const tr = await createTrade({
                  ticker: snapTrade.ticker,
                  entry_price: snapTrade.entry_price,
                  time_horizon: snapTrade.time_horizon,
                  confidence_tag: snapTrade.confidence_tag,
                  cost_basis: snapTrade.cost_basis,
                  shares: snapTrade.shares,
                  watchlist_entry_id: snapTrade.watchlist_entry_id,
                  pre_trade_notes: snapTrade.pre_trade_notes,
                });
                tradeIds.current = tr.id;
              },
              redo: async () => { await deleteTrade(tradeIds.current); },
            });
            markCreated();
          }
        } else if (act.type === "update_watchlist_entry" && act.ticker) {
          const target = resolveWatchlistEntry(act.ticker);
          if (target) {
            const updates: Record<string, unknown> = {};
            if (act.reasoning != null) updates.reasoning = act.reasoning;
            if (act.target_price != null) updates.target_price = act.target_price;
            if (act.stop_price != null) updates.stop_price = act.stop_price;
            if (act.entry_price != null) updates.entry_price = act.entry_price;
            if (act.time_horizon) updates.time_horizon = act.time_horizon;
            if (Object.keys(updates).length) {
              updateWatchlistEntry({ id: target.id, ...updates });
              markCreated();
            }
          }
        } else if (act.type === "delete_watchlist_entry" && act.ticker) {
          const target = resolveWatchlistEntry(act.ticker);
          if (target) {
            const snapEntry = { ...target };
            await deleteWatchlistEntry(target.id);
            const entryIds = { current: target.id };
            pushUndo({
              label: `Watchlist entry deleted: ${act.ticker}`,
              undo: async () => {
                const e = await createWatchlistEntry({
                  ticker: snapEntry.ticker,
                  reasoning: snapEntry.reasoning,
                  idea_source: snapEntry.idea_source,
                  time_horizon: snapEntry.time_horizon,
                  entry_price: snapEntry.entry_price,
                  target_price: snapEntry.target_price,
                  stop_price: snapEntry.stop_price,
                });
                entryIds.current = e.id;
              },
              redo: async () => { await deleteWatchlistEntry(entryIds.current); },
            });
            markCreated();
          }
        } else if (
          act.type === "update_journal_note" &&
          (act.tags?.length || act.title)
        ) {
          const target = resolveJournalNote(act.tags, act.title);
          if (target) {
            const updates: Record<string, unknown> = {};
            if (act.content != null) updates.content = act.content;
            if (act.tags != null) updates.tags = act.tags;
            if (act.new_title != null) updates.title = act.new_title;
            if (Object.keys(updates).length) {
              updateJournalNote({ id: target.id, ...updates });
              markCreated();
            }
          }
        } else if (
          act.type === "delete_journal_note" &&
          (act.tags?.length || act.title)
        ) {
          const target = resolveJournalNote(act.tags, act.title);
          if (target) {
            const snapNote = { ...target };
            await deleteJournalNote(target.id);
            const noteIds = { current: target.id };
            pushUndo({
              label: `Note deleted${snapNote.title ? `: ${snapNote.title}` : ""}`,
              undo: async () => {
                const n = await createJournalNote({
                  content: snapNote.content,
                  title: snapNote.title ?? undefined,
                  tags: snapNote.tags ?? [],
                });
                noteIds.current = n.id;
              },
              redo: async () => { await deleteJournalNote(noteIds.current); },
            });
            markCreated();
          }
        } else if (act.type === "update_portfolio" && act.portfolio_name) {
          const portfolioId = resolvePortfolioId(act.portfolio_name);
          if (portfolioId) {
            const updates: Record<string, unknown> = {};
            if (act.new_name) updates.name = act.new_name;
            if (act.thesis != null) updates.thesis = act.thesis;
            if (Object.keys(updates).length) {
              updatePortfolio({ id: portfolioId, ...updates });
              markCreated();
            }
          }
        } else if (act.type === "delete_portfolio" && act.portfolio_name) {
          const portfolioId = resolvePortfolioId(act.portfolio_name);
          if (portfolioId) {
            const snapPortfolio = portfolios.find((p) => p.id === portfolioId);
            const linkedTriggerIds = triggers
              .filter((t) => t.portfolio_id === portfolioId)
              .map((t) => t.id);
            await deletePortfolio(portfolioId);
            const portfolioIds = { current: portfolioId };
            pushUndo({
              label: `Portfolio deleted${snapPortfolio?.name ? `: ${snapPortfolio.name}` : ""}`,
              undo: async () => {
                const p = await createPortfolio({
                  name: snapPortfolio?.name ?? act.portfolio_name!,
                  thesis: snapPortfolio?.thesis ?? undefined,
                });
                portfolioIds.current = p.id;
                for (const id of linkedTriggerIds) {
                  updateTrigger({ id, portfolio_id: p.id });
                }
              },
              redo: async () => {
                for (const id of linkedTriggerIds) {
                  updateTrigger({ id, portfolio_id: null });
                }
                await deletePortfolio(portfolioIds.current);
              },
            });
            markCreated();
          }
        } else if (act.type === "rearm_alert" && act.ticker) {
          const upperTicker = act.ticker.toUpperCase();
          // Only fired/disarmed triggers need re-arming — an already-active one
          // is a no-op, and matching against it would silently skip the one the
          // user actually meant when a ticker has both an active and a fired alert.
          const candidates = triggers.filter((t) => t.ticker === upperTicker && !t.is_active);
          const target = act.price != null
            ? (candidates.find((t) => t.target_price === act.price) ?? candidates[0])
            : candidates[0];
          if (target) {
            rearmTrigger(target.id);
            markCreated();
          }
        } else if (act.type === "create_portfolio" && act.name) {
          const portfolio = await createPortfolio({ name: act.name, thesis: act.thesis });
          newPortfolioIds[act.name.toLowerCase()] = portfolio.id;
          const assignedTriggerIds: string[] = [];
          if (act.tickers?.length) {
            for (const ticker of act.tickers) {
              for (const t of triggers.filter((t) => t.ticker === ticker.toUpperCase())) {
                updateTrigger({ id: t.id, portfolio_id: portfolio.id });
                assignedTriggerIds.push(t.id);
              }
            }
          }
          const snapAct = { ...act };
          const portfolioIds = { current: portfolio.id };
          pushUndo({
            label: `Portfolio created: ${act.name}`,
            undo: async () => {
              // Clear the assignment before deleting so these triggers don't end
              // up pointing at a deleted portfolio_id.
              for (const id of assignedTriggerIds) updateTrigger({ id, portfolio_id: null });
              await deletePortfolio(portfolioIds.current);
            },
            redo: async () => {
              const p = await createPortfolio({ name: snapAct.name!, thesis: snapAct.thesis });
              portfolioIds.current = p.id;
              for (const id of assignedTriggerIds) updateTrigger({ id, portfolio_id: p.id });
            },
          });
          markCreated();
        } else if (
          act.type === "assign_to_portfolio" &&
          act.portfolio_name &&
          act.tickers?.length
        ) {
          const portfolioId = resolvePortfolioId(act.portfolio_name);
          if (portfolioId) {
            for (const ticker of act.tickers) {
              for (const t of triggers.filter((t) => t.ticker === ticker.toUpperCase())) {
                updateTrigger({ id: t.id, portfolio_id: portfolioId });
              }
            }
            markCreated();
          }
        } else if (act.type === "add_journal_note" && act.content) {
          const note = await createJournalNote({
            content: act.content,
            title: act.title ?? undefined,
            tags: act.tags ?? [],
          });
          const snapAct = { ...act };
          const noteIds = { current: note.id };
          pushUndo({
            label: `Note saved${act.title ? `: ${act.title}` : ""}`,
            undo: async () => { await deleteJournalNote(noteIds.current); },
            redo: async () => {
              const n = await createJournalNote({
                content: snapAct.content!,
                title: snapAct.title ?? undefined,
                tags: snapAct.tags ?? [],
              });
              noteIds.current = n.id;
            },
          });
          markCreated();
        } else if (act.type === "update_alert" && act.ticker) {
          const candidates = triggers.filter(
            (t) => t.ticker === act.ticker!.toUpperCase() && t.is_active
          );
          const target = act.old_price
            ? (candidates.find((t) => t.target_price === act.old_price) ?? candidates[0])
            : candidates[0];
          if (target) {
            const updates: Record<string, unknown> = {};
            if (act.new_price != null) updates.target_price = act.new_price;
            if (act.new_condition) updates.condition = act.new_condition;
            if (act.new_note != null) updates.notes = act.new_note;
            if (Object.keys(updates).length) {
              updateTrigger({ id: target.id, ...updates });
              markCreated();
            }
          }
        } else if (act.type === "delete_alert" && act.ticker) {
          const upperTicker = act.ticker.toUpperCase();
          const toDelete =
            act.price != null
              ? triggers.filter(
                  (t) =>
                    t.ticker === upperTicker &&
                    t.target_price === act.price &&
                    (!act.condition || t.condition === act.condition)
                )
              : triggers.filter((t) => t.ticker === upperTicker);
          if (toDelete.length) {
            const snapshots = toDelete.map((t) => ({ ...t }));
            for (const t of toDelete) {
              await deleteTriggerAsync(t.id);
            }
            const currentIds = { current: snapshots.map((s) => s.id) };
            pushUndo({
              label:
                snapshots.length > 1
                  ? `${snapshots.length} alerts deleted: ${act.ticker}`
                  : `Alert deleted: ${act.ticker}`,
              undo: async () => {
                const recreated = await Promise.all(
                  snapshots.map((s) =>
                    createTrigger({
                      ticker: s.ticker,
                      target_price: s.target_price,
                      condition: s.condition,
                      trigger_type: s.trigger_type,
                      threshold_pct: s.threshold_pct,
                      reference_price: s.reference_price,
                      auto_disarm: s.auto_disarm,
                      cooldown_hours: s.cooldown_hours,
                      notes: s.notes,
                      portfolio_id: s.portfolio_id,
                    })
                  )
                );
                currentIds.current = recreated.map((t) => t.id);
              },
              redo: async () => {
                for (const id of currentIds.current) await deleteTriggerAsync(id);
              },
            });
            markCreated();
          }
        }
      } catch {
        // individual action failure is silent — user can fix manually
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleHint(hint: string) {
    setInput(hint);
    textareaRef.current?.focus();
  }

  function toggleMic() {
    setIsListening((v) => !v);
  }

  return (
    <div className="flex flex-col h-screen">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 pb-24">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-xl border-[1.5px] border-brand flex items-center justify-center mx-auto mb-4">
                <span className="text-brand font-bold text-base leading-none">
                  tN
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                tradrNotebook
              </h1>
              <p className="text-sm text-slate-500 max-w-xs">
                Tell me what to watch. I&apos;ll set your price alerts and keep
                notes on your thesis.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {HINTS.map((hint) => (
                <button
                  key={hint}
                  onClick={() => handleHint(hint)}
                  className="text-xs px-3 py-1.5 rounded-full border border-brand-border text-slate-600 bg-white hover:border-brand hover:text-brand transition-colors"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4 pb-4">
            {messages.map((msg, msgIdx) => (
              <React.Fragment key={msg.id}>
              <div
                className={clsx(
                  "flex animate-fade-up",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed bg-brand text-white rounded-2xl rounded-br-sm">
                    {msg.text}
                  </div>
                ) : (
                  <div className="max-w-[80%] bg-white border border-brand-subtle rounded-2xl rounded-bl-sm shadow-sm overflow-hidden">
                    {msg.isStreaming && !msg.text && (msg.toolsUsed?.length ?? 0) === 0 && (
                      <div className="px-4 py-3 flex items-center gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-blink"
                            style={{ animationDelay: `${i * 0.18}s` }}
                          />
                        ))}
                      </div>
                    )}
                    {msg.text && (
                      <p className="px-4 py-2.5 text-sm leading-relaxed text-slate-800">
                        {msg.text}
                      </p>
                    )}
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                        {msg.toolsUsed.map((tool, i) => {
                          const meta = TOOL_META[tool.name];
                          if (!meta) return null;
                          const { label, Icon } = meta;
                          return (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-slate-50 text-slate-400 border border-slate-100"
                            >
                              {tool.loading ? (
                                <span className="w-2 h-2 rounded-full border border-slate-300 border-t-slate-500 animate-spin shrink-0" />
                              ) : (
                                <Icon size={9} />
                              )}
                              {label}
                              {tool.ticker ? ` · ${tool.ticker}` : ""}
                              {!tool.loading && (
                                <>
                                  <span className="text-slate-200">·</span>
                                  {tool.summary}
                                </>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {msg.toolsUsed?.some(
                      (t) => t.name === "get_stock_price" && !t.loading && t.data?.price
                    ) && (
                      <div className="pb-2">
                        {msg.toolsUsed
                          .filter((t) => t.name === "get_stock_price" && !t.loading && t.data?.price)
                          .map((t, i) => (
                            <PriceCard
                              key={i}
                              ticker={t.ticker ?? ""}
                              price={t.data!.price as number}
                              changePct={(t.data!.change_pct as number) ?? 0}
                            />
                          ))}
                      </div>
                    )}
                    {(msg.actions ?? (msg.action ? [msg.action] : [])).map(
                      (act, i) => {
                        const created =
                          msg.actionsCreated?.[i] ?? msg.actionCreated ?? false;
                        const badgeClass = clsx(
                          "inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1",
                          created
                            ? "bg-brand-light text-brand border border-brand-border"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        );
                        let label: string | null = null;
                        if (act.type === "add_alert" && act.ticker)
                          label = `${created ? "Alert set" : "Alert"}: ${act.ticker} ${act.condition} $${act.price}`;
                        else if (act.type === "log_idea" && act.ticker)
                          label = `${created ? "Added to watchlist" : "Watchlist"}: ${act.ticker}`;
                        else if (act.type === "log_trade" && act.ticker)
                          label = `${created ? "Trade logged" : "Trade"}: ${act.ticker} @ $${act.entry_price}`;
                        else if (act.type === "close_trade" && act.ticker)
                          label = `${created ? "Exit logged" : "Exit"}: ${act.ticker} @ $${act.exit_price}`;
                        else if (act.type === "create_portfolio" && act.name)
                          label = `${created ? "Portfolio created" : "Portfolio"}: ${act.name}${act.tickers?.length ? ` · ${act.tickers.join(", ")}` : ""}`;
                        else if (
                          act.type === "assign_to_portfolio" &&
                          act.portfolio_name
                        )
                          label = `${created ? "Assigned to" : "Assign to"}: ${act.portfolio_name}${act.tickers?.length ? ` · ${act.tickers.join(", ")}` : ""}`;
                        else if (act.type === "add_journal_note" && act.content)
                          label = `${created ? "Note saved" : "Note"}${act.title ? `: ${act.title}` : ""}`;
                        else if (act.type === "update_alert" && act.ticker)
                          label = `${created ? "Alert updated" : "Update alert"}: ${act.ticker}${act.new_price != null ? ` → $${act.new_price}` : ""}${act.new_condition ? ` ${act.new_condition}` : ""}`;
                        else if (act.type === "delete_alert" && act.ticker)
                          label = `${created ? "Alert deleted" : "Delete alert"}: ${act.ticker}${act.price != null ? ` $${act.price}` : " (all)"}`;
                        else if (act.type === "rearm_alert" && act.ticker)
                          label = `${created ? "Alert re-armed" : "Re-arm alert"}: ${act.ticker}`;
                        else if (act.type === "update_trade" && act.ticker)
                          label = `${created ? "Trade updated" : "Update trade"}: ${act.ticker}`;
                        else if (act.type === "delete_trade" && act.ticker)
                          label = `${created ? "Trade deleted" : "Delete trade"}: ${act.ticker}`;
                        else if (act.type === "update_watchlist_entry" && act.ticker)
                          label = `${created ? "Watchlist updated" : "Update watchlist"}: ${act.ticker}`;
                        else if (act.type === "delete_watchlist_entry" && act.ticker)
                          label = `${created ? "Watchlist entry deleted" : "Delete watchlist entry"}: ${act.ticker}`;
                        else if (act.type === "update_journal_note")
                          label = `${created ? "Note updated" : "Update note"}${act.title ? `: ${act.title}` : ""}`;
                        else if (act.type === "delete_journal_note")
                          label = `${created ? "Note deleted" : "Delete note"}${act.title ? `: ${act.title}` : ""}`;
                        else if (act.type === "update_portfolio" && act.portfolio_name)
                          label = `${created ? "Portfolio updated" : "Update portfolio"}: ${act.portfolio_name}${act.new_name ? ` → ${act.new_name}` : ""}`;
                        else if (act.type === "delete_portfolio" && act.portfolio_name)
                          label = `${created ? "Portfolio deleted" : "Delete portfolio"}: ${act.portfolio_name}`;
                        if (!label) return null;
                        return (
                          <div key={i} className="px-4 pb-3">
                            <span className={badgeClass}>
                              <Check size={11} />
                              {label}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
              {msg.role === "ai" &&
                !msg.isStreaming &&
                msgIdx === messages.length - 1 &&
                getFollowUps(msg).length > 0 && (
                  <div className="flex justify-start mt-2 pl-1">
                    <div className="flex flex-wrap gap-1.5">
                      {getFollowUps(msg).map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => {
                            setInput(suggestion);
                            textareaRef.current?.focus();
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-full border border-brand-border text-slate-500 bg-white hover:border-brand hover:text-brand transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}

            {isTyping && (
              <div className="flex justify-start animate-fade-up">
                <div className="bg-white border border-brand-subtle rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-blink"
                      style={{ animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-brand-subtle bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-app-bg border border-brand-border rounded-xl px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Set an alert, log a trade, ask anything…"
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none leading-[1.4] py-1 max-h-[140px]"
            />
            <div className="flex items-center gap-1 shrink-0 pb-1">
              <button
                type="button"
                onClick={toggleMic}
                className={clsx(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  isListening
                    ? "bg-red-100 text-red-500 hover:bg-red-200"
                    : "text-slate-400 hover:bg-brand-light hover:text-brand"
                )}
                aria-label={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="w-8 h-8 rounded-lg bg-brand hover:bg-brand-hover disabled:bg-slate-200 flex items-center justify-center transition-colors"
                aria-label="Send"
              >
                <Send
                  size={14}
                  className={input.trim() ? "text-white" : "text-slate-400"}
                />
              </button>
            </div>
          </div>
          <p className="text-center text-[10.5px] text-slate-400 mt-2">
            Press <kbd className="font-mono">Enter</kbd> to send ·{" "}
            <kbd className="font-mono">Shift+Enter</kbd> for newline
          </p>
        </div>
      </div>

      {pendingDebrief && (
        <PostTradeDebrief
          act={pendingDebrief.act}
          onConfirm={(notes) => {
            pendingDebrief.resolve(notes);
            setPendingDebrief(null);
          }}
          onCancel={() => {
            pendingDebrief.resolve(null);
            setPendingDebrief(null);
          }}
        />
      )}

      {pendingTradeChecklist && (
        <PreTradeChecklist
          act={pendingTradeChecklist.act}
          watchlistEntry={
            watchlistEntries.find(
              (e) => e.ticker === pendingTradeChecklist.act.ticker?.toUpperCase()
            ) ?? null
          }
          onConfirm={(notes) => {
            pendingTradeChecklist.resolve(notes);
            setPendingTradeChecklist(null);
          }}
          onCancel={() => {
            pendingTradeChecklist.resolve(null);
            setPendingTradeChecklist(null);
          }}
        />
      )}
    </div>
  );
}
