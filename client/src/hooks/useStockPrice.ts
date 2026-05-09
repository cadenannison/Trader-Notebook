"use client";

import { useQuery } from "@tanstack/react-query";

import { MOCK_PRICES } from "@/mocks/prices";
import type { StockData } from "@shared/types";

export function useStockPrice(ticker: string) {
  return useQuery({
    queryKey: ["price", ticker.toUpperCase()],
    queryFn: async (): Promise<StockData> => {
      // TODO: replace with live call:
      // const res = await axios.get(`${API}/api/stock/price`, { params: { ticker } });
      // return res.data;
      return (
        MOCK_PRICES[ticker.toUpperCase()] ?? {
          ticker: ticker.toUpperCase(),
          price: 100.0,
          timestamp: new Date().toISOString(),
          change_pct: 0.0,
        }
      );
    },
    refetchInterval: 60_000,
  });
}
