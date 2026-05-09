"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import type { StockData } from "@shared/types";

export function useStockPrice(ticker: string) {
  const sym = ticker.toUpperCase();
  return useQuery({
    queryKey: ["price", sym],
    queryFn: async (): Promise<StockData> => {
      const res = await api.get("/api/stock/price", { params: { ticker: sym } });
      return res.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
