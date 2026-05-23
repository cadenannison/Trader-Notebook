"use client";

import { useEffect, useRef } from "react";

import { clsx } from "clsx";
import { Check, Mic, MicOff, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import api from "@/lib/api";
import {
  useCreateTrigger,
  useDeleteTrigger,
  useTriggers,
  useUpdateTrigger,
} from "@/hooks/useTriggers";
import {
  useCreateWatchlistEntry,
  useDeleteWatchlistEntry,
} from "@/hooks/useWatchlist";
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
} from "@/store/appStore";
import { useUndoStore } from "@/store/undoStore";
import type {
  IdeaSource,
  TimeHorizon,
  ConfidenceTag,
  ExitReason,
} from "@shared/types";

const HINTS = [
  "I like NVDA for an AI earnings play, targeting $1100",
  "I bought 50 shares of AAPL at $192, feeling confident",
  "Alert me when TSLA breaks above $300",
  "I sold my NVDA position at $950, hit my target",
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

  const {
    chatMessages: messages,
    addChatMessage,
    updateChatMessage,
  } = useAppStore();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
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

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text,
    };
    addChatMessage(userMsg);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsTyping(true);

    const history = messages.map((m) => ({
      role: m.role === "ai" ? "model" : "user",
      text: m.text,
    }));

    const aiId = (Date.now() + 1).toString();

    try {
      const { data } = await api.post<{
        message: string;
        actions?: ChatAction[];
        action?: ChatAction | null;
      }>("/api/chat", {
        message: text,
        history,
      });

      // Normalise: new "actions" array takes precedence, fall back to legacy "action"
      const actionList: ChatAction[] = data.actions?.length
        ? data.actions
        : data.action
          ? [data.action]
          : [];

      const aiMsg: ChatMessage = {
        id: aiId,
        role: "ai",
        text: data.message,
        actions: actionList,
        actionsCreated: actionList.map(() => false),
      };
      addChatMessage(aiMsg);

      // Track portfolios created in this batch so later actions can reference them
      // even before the query cache refreshes.
      const newPortfolioIds: Record<string, string> = {};

      const resolvePortfolioId = (name: string): string | null => {
        const lower = name.toLowerCase();
        return (
          newPortfolioIds[lower] ??
          portfolios.find((p) => p.name.toLowerCase() === lower)?.id ??
          null
        );
      };

      for (let i = 0; i < actionList.length; i++) {
        const act = actionList[i];
        const markCreated = () =>
          updateChatMessage(aiId, {
            actionsCreated: actionList.map((_, j) => j <= i),
          });

        try {
          if (act.type === "show_view" && act.view) {
            const path = VIEW_PATHS[act.view];
            if (path) setTimeout(() => router.push(path), 900);
          } else if (
            act.type === "add_alert" &&
            act.ticker &&
            act.price &&
            act.condition
          ) {
            const portfolioId = act.portfolio_name
              ? resolvePortfolioId(act.portfolio_name)
              : null;
            const createdTrigger = await createTrigger({
              ticker: act.ticker,
              target_price: act.price,
              condition: act.condition as "above" | "below",
              auto_disarm: true,
              cooldown_hours: 4,
              notes: act.note ?? null,
              portfolio_id: portfolioId,
            });
            const snapAct = { ...act };
            const snapPortfolioId = portfolioId;
            const triggerIds = { current: createdTrigger.id };
            pushUndo({
              label: `Alert set: ${act.ticker} ${act.condition} $${act.price}`,
              undo: async () => {
                await deleteTriggerAsync(triggerIds.current);
              },
              redo: async () => {
                const t = await createTrigger({
                  ticker: snapAct.ticker!,
                  target_price: snapAct.price!,
                  condition: snapAct.condition as "above" | "below",
                  auto_disarm: true,
                  cooldown_hours: 4,
                  notes: snapAct.note ?? null,
                  portfolio_id: snapPortfolioId,
                });
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
              undo: async () => {
                await deleteWatchlistEntry(entryIds.current);
              },
              redo: async () => {
                const e = await createWatchlistEntry({
                  ticker: snapAct.ticker!,
                  reasoning: snapAct.reasoning!,
                  idea_source:
                    (snapAct.idea_source as IdeaSource) ?? "own_research",
                  time_horizon:
                    (snapAct.time_horizon as TimeHorizon) ?? "swing",
                  entry_price: snapAct.entry_price ?? null,
                  target_price: snapAct.target_price ?? null,
                  stop_price: snapAct.stop_price ?? null,
                });
                entryIds.current = e.id;
              },
            });
            markCreated();
          } else if (
            act.type === "log_trade" &&
            act.ticker &&
            act.entry_price
          ) {
            const trade = await createTrade({
              ticker: act.ticker,
              entry_price: act.entry_price,
              time_horizon: (act.time_horizon as TimeHorizon) ?? "swing",
              confidence_tag:
                (act.confidence_tag as ConfidenceTag) ?? "neutral",
              cost_basis: act.cost_basis ?? null,
              shares: act.shares ?? null,
              watchlist_entry_id: act.watchlist_entry_id ?? null,
            });
            const snapAct = { ...act };
            const tradeIds = { current: trade.id };
            pushUndo({
              label: `Trade logged: ${act.ticker} @ $${act.entry_price}`,
              undo: async () => {
                await deleteTrade(tradeIds.current);
              },
              redo: async () => {
                const tr = await createTrade({
                  ticker: snapAct.ticker!,
                  entry_price: snapAct.entry_price!,
                  time_horizon:
                    (snapAct.time_horizon as TimeHorizon) ?? "swing",
                  confidence_tag:
                    (snapAct.confidence_tag as ConfidenceTag) ?? "neutral",
                  cost_basis: snapAct.cost_basis ?? null,
                  shares: snapAct.shares ?? null,
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
            const portfolio = await createPortfolio({
              name: act.name,
              thesis: act.thesis,
            });
            newPortfolioIds[act.name.toLowerCase()] = portfolio.id;
            if (act.tickers?.length) {
              for (const ticker of act.tickers) {
                for (const t of triggers.filter(
                  (t) => t.ticker === ticker.toUpperCase()
                )) {
                  updateTrigger({ id: t.id, portfolio_id: portfolio.id });
                }
              }
            }
            const snapAct = { ...act };
            const portfolioIds = { current: portfolio.id };
            pushUndo({
              label: `Portfolio created: ${act.name}`,
              undo: async () => {
                await deletePortfolio(portfolioIds.current);
              },
              redo: async () => {
                const p = await createPortfolio({
                  name: snapAct.name!,
                  thesis: snapAct.thesis,
                });
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
                for (const t of triggers.filter(
                  (t) => t.ticker === ticker.toUpperCase()
                )) {
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
              undo: async () => {
                await deleteJournalNote(noteIds.current);
              },
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
            // Find the best matching active trigger: prefer old_price match, fall back to most recent
            const candidates = triggers.filter(
              (t) => t.ticker === act.ticker!.toUpperCase() && t.is_active
            );
            const target = act.old_price
              ? (candidates.find((t) => t.target_price === act.old_price) ??
                candidates[0])
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
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : null;
      addChatMessage({
        id: aiId,
        role: "ai",
        text:
          detail ?? "Something went wrong — make sure the server is running.",
      });
    } finally {
      setIsTyping(false);
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
            {messages.map((msg) => (
              <div
                key={msg.id}
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
                    <p className="px-4 py-2.5 text-sm leading-relaxed text-slate-800">
                      {msg.text}
                    </p>
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
    </div>
  );
}
