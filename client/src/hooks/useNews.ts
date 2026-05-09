"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import type { NewsArticle } from "@shared/types";

export function useNews(tickers: string[]) {
  const key = [...tickers].sort().join(",");
  return useQuery({
    queryKey: ["news", key],
    queryFn: async (): Promise<NewsArticle[]> => {
      const res = await api.get("/api/news", { params: { tickers: key } });
      return res.data;
    },
    enabled: tickers.length > 0,
    staleTime: 5 * 60_000,
  });
}
