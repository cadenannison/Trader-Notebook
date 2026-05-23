"use client";

import { useMemo } from "react";

import { clsx } from "clsx";
import {
  ExternalLink,
  Key,
  Newspaper,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { isAxiosError } from "axios";

import { useNews } from "@/hooks/useNews";
import { useTriggers } from "@/hooks/useTriggers";
import { useWatchlist } from "@/hooks/useWatchlist";
import type { NewsArticle } from "@shared/types";

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const SENTIMENT_CONFIG = {
  bullish: {
    label: "Bullish",
    icon: TrendingUp,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  bearish: {
    label: "Bearish",
    icon: TrendingDown,
    cls: "bg-red-50 text-red-600 border-red-200",
  },
  neutral: {
    label: "Neutral",
    icon: Minus,
    cls: "bg-slate-100 text-slate-500 border-slate-200",
  },
};

function SentimentBadge({
  sentiment,
}: {
  sentiment: NewsArticle["sentiment"];
}) {
  const cfg = SENTIMENT_CONFIG[sentiment];
  const Icon = cfg.icon;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full border",
        cfg.cls
      )}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-brand hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10.5px] font-semibold bg-brand-light text-brand border border-brand-border px-2 py-0.5 rounded-full">
              {article.ticker}
            </span>
            <SentimentBadge sentiment={article.sentiment} />
            <span className="text-[10.5px] text-slate-400 ml-auto">
              {timeAgo(article.published_at)}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-900 leading-snug group-hover:text-brand transition-colors line-clamp-2">
            {article.headline}
          </p>
          {article.summary && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              {article.summary}
            </p>
          )}
          <p className="text-[10.5px] text-slate-400 mt-2">{article.source}</p>
        </div>
        <ExternalLink
          size={14}
          className="text-slate-300 group-hover:text-brand shrink-0 mt-0.5 transition-colors"
        />
      </div>
    </a>
  );
}

function SetupState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 pb-24">
      <div className="w-12 h-12 rounded-xl border border-brand-border flex items-center justify-center">
        <Key size={20} className="text-brand" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">
          Add your Finnhub API key
        </h2>
        <p className="text-sm text-slate-500 max-w-xs">
          Market news requires a Finnhub API key. Get a free key at{" "}
          <span className="text-brand font-medium">finnhub.io</span> and add it
          in{" "}
          <a
            href="/settings"
            className="text-brand underline underline-offset-2"
          >
            Settings
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function EmptyWatchlist() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 pb-24">
      <div className="w-12 h-12 rounded-xl border border-brand-border flex items-center justify-center">
        <Newspaper size={20} className="text-brand" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">
          No tickers on your watchlist
        </h2>
        <p className="text-sm text-slate-500 max-w-xs">
          Add price alerts in{" "}
          <a href="/alerts" className="text-brand underline underline-offset-2">
            Alerts
          </a>{" "}
          to see news for your watched tickers here.
        </p>
      </div>
    </div>
  );
}

function ShimmerCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 w-12 bg-slate-100 rounded-full" />
        <div className="h-4 w-16 bg-slate-100 rounded-full" />
      </div>
      <div className="h-4 bg-slate-100 rounded w-3/4 mb-1.5" />
      <div className="h-3 bg-slate-100 rounded w-full mb-1" />
      <div className="h-3 bg-slate-100 rounded w-2/3" />
    </div>
  );
}

export default function NewsPage() {
  const { data: triggers } = useTriggers();
  const { data: watchlist } = useWatchlist();

  const tickers = useMemo(() => {
    const fromTriggers = (triggers ?? []).map((t) => t.ticker.toUpperCase());
    const fromWatchlist = (watchlist ?? [])
      .filter((e) => e.status === "watching" || e.status === "active_trade")
      .map((e) => e.ticker.toUpperCase());
    return Array.from(new Set([...fromTriggers, ...fromWatchlist]));
  }, [triggers, watchlist]);

  const { data: articles, isLoading, error, refetch } = useNews(tickers);

  const is503 = isAxiosError(error) && error.response?.status === 503;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Market News
          </h1>
          {tickers.length > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">
              {tickers.join(" · ")}
            </p>
          )}
        </div>
        {tickers.length > 0 && (
          <button
            onClick={() => refetch()}
            className="text-slate-400 hover:text-brand transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tickers.length === 0 ? (
          <EmptyWatchlist />
        ) : is503 ? (
          <SetupState />
        ) : isLoading ? (
          <div className="max-w-2xl mx-auto space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ShimmerCard key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <p className="text-sm text-slate-500">
              Failed to load news. Check your connection and try again.
            </p>
            <button
              onClick={() => refetch()}
              className="text-xs text-brand border border-brand-border rounded-full px-3 py-1.5 hover:bg-brand-light transition-colors"
            >
              Retry
            </button>
          </div>
        ) : !articles || articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <Newspaper size={20} className="text-slate-300" />
            <p className="text-sm text-slate-500">
              No recent news found for {tickers.join(", ")}.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            {articles.map((article, i) => (
              <NewsCard key={`${article.ticker}-${i}`} article={article} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
