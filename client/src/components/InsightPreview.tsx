import { MOCK_INSIGHT } from "@/mocks/insights";

export function InsightPreview() {
  const insight = MOCK_INSIGHT;
  const date = new Date(insight.sent_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium bg-zinc-800 text-emerald-400 px-2 py-0.5 rounded">
            {insight.ticker}
          </span>
          <span className="text-xs text-zinc-500">
            Triggered at ${insight.triggered_price.toFixed(2)} · {date}
          </span>
        </div>
        <span className="text-xs bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded font-medium shrink-0">
          Sample Insight
        </span>
      </div>
      <p className="text-zinc-300 text-sm leading-relaxed">{insight.summary}</p>
      <p className="text-xs text-zinc-600 border-t border-zinc-800 pt-3">
        This summary was generated automatically and is{" "}
        <strong className="text-zinc-500">not financial advice</strong>. Verify all information
        before making any decisions.
      </p>
    </div>
  );
}
