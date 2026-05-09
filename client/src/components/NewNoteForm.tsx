"use client";

import { useState } from "react";

import { useCreateNote } from "@/hooks/useNotes";

import { TickerInput } from "./TickerInput";

interface Props {
  defaultTicker?: string;
}

export function NewNoteForm({ defaultTicker = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState(defaultTicker);
  const [content, setContent] = useState("");
  const [tickerValid, setTickerValid] = useState(!!defaultTicker);
  const createNote = useCreateNote();

  const canSubmit = tickerValid && content.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await createNote.mutateAsync({ ticker, content });
    setContent("");
    if (!defaultTicker) setTicker("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium border border-emerald-400/30 rounded px-2 py-1 hover:border-emerald-400/60 transition-colors"
      >
        + Note
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-300">New Note</p>
        <button
          onClick={() => setOpen(false)}
          className="text-zinc-600 hover:text-zinc-400 text-sm leading-none"
        >
          ✕
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        {!defaultTicker && (
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Ticker</label>
            <TickerInput value={ticker} onChange={setTicker} onValidate={setTickerValid} />
          </div>
        )}
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Note</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's your thinking on this position?"
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500/30 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit || createNote.isPending}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-medium text-sm rounded-md py-2 transition-colors"
        >
          {createNote.isPending ? "Saving..." : "Save Note"}
        </button>
      </form>
    </div>
  );
}
