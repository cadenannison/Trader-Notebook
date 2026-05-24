"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";

export function useStockPrices(tickers: string[]) {
  return useQuery({
    queryKey: ["stock_prices", tickers.join(",")],
    queryFn: async (): Promise<Record<string, { price: number; change_pct: number }>> => {
      const res = await api.get("/api/stock/prices", {
        params: { tickers: tickers.join(",") },
      });
      return res.data;
    },
    staleTime: 2 * 60 * 1000,
    enabled: tickers.length > 0,
  });
}
