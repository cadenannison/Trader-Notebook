"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";

export interface TagStat {
  tag: string;
  total: number;
  wins: number;
  avg_return: number;
}

export interface InsightsSummary {
  total_trades: number;
  open_trades: number;
  win_rate: number;
  avg_return: number;
  best_trade_pct: number | null;
  worst_trade_pct: number | null;
  best_trade_ticker: string | null;
  worst_trade_ticker: string | null;
}

export interface InsightsData {
  summary: InsightsSummary;
  by_confidence_tag: TagStat[];
  by_exit_reason: TagStat[];
  by_time_horizon: TagStat[];
  coaching_insights: string[];
}

export function useInsights() {
  return useQuery({
    queryKey: ["insights"],
    queryFn: async (): Promise<InsightsData> => {
      const res = await api.get("/api/insights");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
