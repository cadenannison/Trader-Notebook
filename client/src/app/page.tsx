"use client";

import { useEffect, useRef } from "react";

import { clsx } from "clsx";
import { Check, Mic, MicOff, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import api from "@/lib/api";
import { useCreateTrigger } from "@/hooks/useTriggers";
import { useAppStore, type ChatAction, type ChatMessage } from "@/store/appStore";

const HINTS = [
  "Alert me when NVDA breaks above $950",
  "Notify me if AAPL falls below $180",
  "Set an alert 5% above current TSLA price",
  "Show me my active alerts",
];

const VIEW_PATHS: Record<string, string> = {
  alerts: "/alerts",
  notebook: "/notebook",
  news: "/news",
  stats: "/stats",
};

export default function ChatPage() {
  const router = useRouter();
  const { mutateAsync: createTrigger } = useCreateTrigger();

  const { chatMessages: messages, addChatMessage, updateChatMessage } = useAppStore();
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

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text };
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
      const { data } = await api.post<{ message: string; action: ChatAction | null }>("/api/chat", {
        message: text,
        history,
      });

      const aiMsg: ChatMessage = {
        id: aiId,
        role: "ai",
        text: data.message,
        action: data.action,
      };
      addChatMessage(aiMsg);

      if (data.action?.type === "show_view" && data.action.view) {
        const path = VIEW_PATHS[data.action.view];
        if (path) setTimeout(() => router.push(path), 900);
      }

      if (
        data.action?.type === "add_alert" &&
        data.action.ticker &&
        data.action.price &&
        data.action.condition
      ) {
        try {
          await createTrigger({
            ticker: data.action.ticker,
            target_price: data.action.price,
            condition: data.action.condition as "above" | "below",
            auto_disarm: true,
            cooldown_hours: 4,
          });
          updateChatMessage(aiId, { actionCreated: true });
        } catch {
          // trigger creation failed silently — user can add manually via Alerts
        }
      }
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      addChatMessage({
        id: aiId,
        role: "ai",
        text: detail ?? "Something went wrong — make sure the server is running.",
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
                <span className="text-brand font-bold text-base leading-none">tN</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">tradrNotebook</h1>
              <p className="text-sm text-slate-500 max-w-xs">
                Tell me what to watch. I'll set your price alerts and keep notes on your thesis.
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
                className={clsx("flex animate-fade-up", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed bg-brand text-white rounded-2xl rounded-br-sm">
                    {msg.text}
                  </div>
                ) : (
                  <div className="max-w-[80%] bg-white border border-brand-subtle rounded-2xl rounded-bl-sm shadow-sm overflow-hidden">
                    <p className="px-4 py-2.5 text-sm leading-relaxed text-slate-800">{msg.text}</p>
                    {msg.action?.type === "add_alert" && msg.action.ticker && (
                      <div className="px-4 pb-3">
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1",
                            msg.actionCreated
                              ? "bg-brand-light text-brand border border-brand-border"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          )}
                        >
                          <Check size={11} />
                          {msg.actionCreated ? "Alert created: " : "Alert: "}
                          {msg.action.ticker} {msg.action.condition} ${msg.action.price}
                        </span>
                      </div>
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
                <Send size={14} className={input.trim() ? "text-white" : "text-slate-400"} />
              </button>
            </div>
          </div>
          <p className="text-center text-[10.5px] text-slate-400 mt-2">
            Press <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for newline
          </p>
        </div>
      </div>
    </div>
  );
}
