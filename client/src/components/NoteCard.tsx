import Link from "next/link";

import type { UserNote } from "@shared/types";

interface Props {
  note: UserNote;
  showTicker?: boolean;
}

export function NoteCard({ note, showTicker = true }: Props) {
  const date = new Date(note.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2 hover:border-zinc-700 transition-colors">
      {showTicker && (
        <Link href={`/ticker/${note.ticker}`}>
          <span className="inline-block text-xs font-medium bg-zinc-800 text-emerald-400 px-2 py-0.5 rounded hover:bg-zinc-700 transition-colors cursor-pointer">
            {note.ticker}
          </span>
        </Link>
      )}
      <p className="text-zinc-200 text-sm leading-relaxed">{note.content}</p>
      <p className="text-zinc-600 text-xs">{date}</p>
    </div>
  );
}
