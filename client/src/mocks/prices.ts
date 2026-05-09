import type { StockData } from "@shared/types";

export const MOCK_PRICES: Record<string, StockData> = {
  NVDA: { ticker: "NVDA", price: 875.4, timestamp: "2026-04-30T14:32:00Z", change_pct: 2.14 },
  AAPL: { ticker: "AAPL", price: 182.63, timestamp: "2026-04-30T14:32:00Z", change_pct: -0.41 },
  VGT: { ticker: "VGT", price: 428.15, timestamp: "2026-04-30T14:32:00Z", change_pct: 0.87 },
  MSFT: { ticker: "MSFT", price: 415.2, timestamp: "2026-04-30T14:32:00Z", change_pct: 1.23 },
  GOOGL: { ticker: "GOOGL", price: 172.8, timestamp: "2026-04-30T14:32:00Z", change_pct: -0.62 },
  TSLA: { ticker: "TSLA", price: 185.1, timestamp: "2026-04-30T14:32:00Z", change_pct: -1.84 },
};
