"use client";

import { useParams } from "next/navigation";

import { clsx } from "clsx";

import { NewNoteForm } from "@/components/NewNoteForm";
import { NewTriggerForm } from "@/components/NewTriggerForm";
import { NoteCard } from "@/components/NoteCard";
import { TriggerCard } from "@/components/TriggerCard";
import { useNotes } from "@/hooks/useNotes";
import { useStockPrice } from "@/hooks/useStockPrice";
import { useTriggers } from "@/hooks/useTriggers";

export default function TickerPage() {
  const params = useParams();
  const symbol = (params.symbol as string).toUpperCase();

  const { data: price, isLoading: priceLoading } = useStockPrice(symbol);
  const { data: notes = [] } = useNotes(symbol);
  const { data: triggers = [] } = useTriggers(symbol);

  const activeTriggers = triggers.filter((t) => t.is_active);
  const firedTriggers = triggers.filter((t) => !t.is_active);

  return (
    <div className="space-y-10">
      {/* Price Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-100">{symbol}</h1>
          {priceLoading ? (
            <p className="text-sm text-zinc-600">Loading price…</p>
          ) : price ? (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-zinc-100 tabular-nums">
                ${price.price.toFixed(2)}
              </span>
              <span
                className={clsx(
                  "text-sm font-medium",
                  price.change_pct >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {price.change_pct >= 0 ? "+" : ""}
                {price.change_pct.toFixed(2)}%
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Triggers */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">
            Price Triggers
          </h2>
          <NewTriggerForm defaultTicker={symbol} />
        </div>

        {triggers.length === 0 ? (
          <p className="text-sm text-zinc-600">No triggers set for {symbol}.</p>
        ) : (
          <div className="space-y-4">
            {activeTriggers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium">
                  Active
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeTriggers.map((t) => (
                    <TriggerCard key={t.id} trigger={t} showTicker={false} />
                  ))}
                </div>
              </div>
            )}
            {firedTriggers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium">
                  Fired
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {firedTriggers.map((t) => (
                    <TriggerCard key={t.id} trigger={t} showTicker={false} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">Notes</h2>
          <NewNoteForm defaultTicker={symbol} />
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-zinc-600">No notes for {symbol} yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {notes.map((n) => (
              <NoteCard key={n.id} note={n} showTicker={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
