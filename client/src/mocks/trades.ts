import type { Trade } from "@shared/types";

export const MOCK_TRADES: Trade[] = [
  {
    id: "trade-1",
    ticker: "NVDA",
    entry_price: 845.0,
    exit_price: 910.5,
    return_pct: 7.75,
    note: "Breakout above the $840 consolidation zone. AI capex cycle still intact.",
    logged_at: "2026-04-22T10:15:00Z",
    status: "closed",
  },
  {
    id: "trade-2",
    ticker: "AAPL",
    entry_price: 178.5,
    note: "Services revenue thesis. Buying dip into earnings. Need to see margin guidance.",
    logged_at: "2026-04-25T14:30:00Z",
    status: "open",
  },
  {
    id: "trade-3",
    ticker: "TSLA",
    entry_price: 200.0,
    exit_price: 172.8,
    return_pct: -13.6,
    note: "Thesis broke when Musk confirmed more Tesla time needed. Stopped out.",
    logged_at: "2026-04-18T09:45:00Z",
    status: "closed",
  },
  {
    id: "trade-4",
    ticker: "VGT",
    entry_price: 415.0,
    note: "Broad tech exposure as hedge. Sector rotation into tech looks healthy.",
    logged_at: "2026-04-28T11:00:00Z",
    status: "open",
  },
];
