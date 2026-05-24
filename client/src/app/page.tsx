"use client";

import React, { useEffect, useRef } from "react";

import { clsx } from "clsx";
import {
  BarChart2,
  Bell,
  Check,
  Eye,
  FileText,
  Mic,
  MicOff,
  Newspaper,
  Send,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { streamChat } from "@/lib/api";
import { useAppStore as useAppStoreRaw } from "@/store/appStore";
import {
  useCreateTrigger,
  useDeleteTrigger,
  useTriggers,
  useUpdateTrigger,
} from "@/hooks/useTriggers";
import {
  useCreateWatchlistEntry,
  useDeleteWatchlistEntry,
  useWatchlist,
} from "@/hooks/useWatchlist";
import { PreTradeChecklist } from "@/components/PreTradeChecklist";
import {
  useCreateTrade,
  useDeleteTrade,
  useCloseTrade,
} from "@/hooks/useTrades";
import {
  useCreatePortfolio,
  useDeletePortfolio,
  usePortfolios,
} from "@/hooks/usePortfolios";
import {
  useCreateJournalNote,
  useDeleteJournalNote,
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
  const { mutate: deleteTriggerMutation } = useDeleteTrigger();
  const { mutateAsync: deleteTriggerAsync } = useDeleteTrigger();
  const { data: triggers = [] } = useTriggers();
  const { data: portfolios = [] } = usePortfolios();
  const { mutateAsync: deletePortfolio } = useDeletePortfolio();
  const { mutateAsync: createJournalNote } = useCreateJournalNote();
  const { mutateAsync: deleteJournalNote } = useDeleteJournalNote();
  const { mutateAsync: deleteWatchlistEntry } = useDeleteWatchlistEntry();
  const { mutateAsync: deleteTrade } = useDeleteTrade();
  const { push: pushUndo } = useUndoStore();
  const { data: watchlistEntries = [] } = useWatchlist();

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
                pre_trade_notes: snapNotes,
              });
              tradeIds.current = tr.id;
            },
          });
          markCreated();
        } else if (
          act.type === "close_trade" &&
          act.exit_price &&
          act.exit_reason &&
          act.trade_id
        ) {
          await closeTrade({
            id: act.trade_id,
            exit_price: act.exit_price,
            exit_reason: act.exit_reason as ExitReason,
          });
          markCreated();
        } else if (act.type === "create_portfolio" && act.name) {
          const portfolio = await createPortfolio({ name: act.name, thesis: act.thesis });
          newPortfolioIds[act.name.toLowerCase()] = portfolio.id;
          if (act.tickers?.length) {
            for (const ticker of act.tickers) {
              for (const t of triggers.filter((t) => t.ticker === ticker.toUpperCase())) {
                updateTrigger({ id: t.id, portfolio_id: portfolio.id });
              }
            }
          }
          const snapAct = { ...act };
          const portfolioIds = { current: portfolio.id };
          pushUndo({
            label: `Portfolio created: ${act.name}`,
            undo: async () => { await deletePortfolio(portfolioIds.current); },
            redo: async () => {
              const p = await createPortfolio({ name: snapAct.name!, thesis: snapAct.thesis });
              portfolioIds.current = p.id;
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
          for (const t of toDelete) {
            deleteTriggerMutation(t.id);
          }
          if (toDelete.length) markCreated();
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
