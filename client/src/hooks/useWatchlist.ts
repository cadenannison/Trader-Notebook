"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import type {
  ConfidenceTag,
  IdeaSource,
  TimeHorizon,
  WatchlistEntry,
  WatchlistStatus,
} from "@shared/types";

export function useWatchlist(opts?: {
  status?: WatchlistStatus;
  ticker?: string;
}) {
  const params: Record<string, string> = {};
  if (opts?.status) params.status = opts.status;
  if (opts?.ticker) params.ticker = opts.ticker;

  return useQuery({
    queryKey: ["watchlist", opts?.status ?? "all", opts?.ticker ?? "all"],
    queryFn: async (): Promise<WatchlistEntry[]> => {
      const res = await api.get("/api/watchlist", { params });
      return res.data;
    },
  });
}

export function useCreateWatchlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      ticker: string;
      reasoning: string;
      idea_source?: IdeaSource;
      time_horizon?: TimeHorizon;
      entry_price?: number | null;
      target_price?: number | null;
      stop_price?: number | null;
    }): Promise<WatchlistEntry> => {
      const res = await api.post("/api/watchlist", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useUpdateWatchlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      reasoning?: string;
      idea_source?: IdeaSource;
      time_horizon?: TimeHorizon;
      entry_price?: number | null;
      target_price?: number | null;
      stop_price?: number | null;
      status?: WatchlistStatus;
    }): Promise<WatchlistEntry> => {
      const res = await api.put(`/api/watchlist/${id}`, updates);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useDeleteWatchlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export const IDEA_SOURCE_LABELS: Record<IdeaSource, string> = {
  own_research: "Own research",
  tip: "Tip",
  news: "News",
  chart_pattern: "Chart pattern",
  earnings_catalyst: "Earnings catalyst",
  gut: "Gut",
};

export const CONFIDENCE_TAG_LABELS: Record<ConfidenceTag, string> = {
  confident: "Confident",
  neutral: "Neutral",
  uncertain: "Uncertain",
  fomo: "FOMO",
};
