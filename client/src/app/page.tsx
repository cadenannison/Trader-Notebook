"use client";

import { InsightPreview } from "@/components/InsightPreview";
import { NewNoteForm } from "@/components/NewNoteForm";
import { NewTriggerForm } from "@/components/NewTriggerForm";
import { NoteCard } from "@/components/NoteCard";
import { TriggerCard } from "@/components/TriggerCard";
import { useNotes } from "@/hooks/useNotes";
import { useTriggers } from "@/hooks/useTriggers";

export default function Dashboard() {
  const { data: triggers = [] } = useTriggers();
  const { data: notes = [] } = useNotes();

  const activeTriggers = triggers.filter((t) => t.is_active);
  const firedTriggers = triggers.filter((t) => !t.is_active);
  const recentNotes = notes.slice(0, 6);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">Your active alerts and recent journal entries.</p>
      </div>

      {/* Sample Insight */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Latest Insight
        </h2>
        <InsightPreview />
      </section>

      {/* Triggers */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">Price Triggers</h2>
          <NewTriggerForm />
        </div>

        {activeTriggers.length === 0 && firedTriggers.length === 0 ? (
          <p className="text-sm text-zinc-600">No triggers set yet.</p>
        ) : (
          <div className="space-y-4">
            {activeTriggers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium">
                  Active ({activeTriggers.length})
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {activeTriggers.map((t) => (
                    <TriggerCard key={t.id} trigger={t} />
                  ))}
                </div>
              </div>
            )}
            {firedTriggers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium">
                  Fired ({firedTriggers.length})
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {firedTriggers.map((t) => (
                    <TriggerCard key={t.id} trigger={t} />
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
          <h2 className="text-sm font-semibold text-zinc-300">Recent Notes</h2>
          <NewNoteForm />
        </div>

        {recentNotes.length === 0 ? (
          <p className="text-sm text-zinc-600">No notes yet. Start journaling your trades.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentNotes.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
