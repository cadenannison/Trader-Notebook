"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatAction {
  type:
    | "add_alert"
    | "show_view"
    | "log_idea"
    | "log_trade"
    | "close_trade"
    | "create_portfolio"
    | "assign_to_portfolio"
    | "add_journal_note"
    | "update_alert"
    | "delete_alert"
    | "update_trade"
    | "delete_trade"
    | "update_watchlist_entry"
    | "delete_watchlist_entry"
    | "update_journal_note"
    | "delete_journal_note"
    | "update_portfolio"
    | "delete_portfolio"
    | "rearm_alert";
  // add_alert
  ticker?: string;
  condition?: string;
  price?: number;
  note?: string;
  portfolio_name?: string;
  trigger_type?: string;
  threshold_pct?: number;
  // show_view
  view?: string;
  // log_idea
  reasoning?: string;
  idea_source?: string;
  time_horizon?: string;
  entry_price?: number;
  target_price?: number;
  stop_price?: number;
  // log_trade
  confidence_tag?: string;
  cost_basis?: number;
  shares?: number;
  watchlist_entry_id?: string;
  // close_trade
  trade_id?: string;
  exit_price?: number;
  exit_reason?: string;
  // create_portfolio / assign_to_portfolio
  name?: string;
  thesis?: string;
  tickers?: string[];
  // add_journal_note
  title?: string;
  content?: string;
  tags?: string[];
  // update_alert
  new_price?: number;
  new_condition?: string;
  new_note?: string;
  old_price?: number;
  // update_trade
  new_entry_price?: number;
  new_shares?: number;
  new_confidence_tag?: string;
  new_time_horizon?: string;
  new_cost_basis?: number;
  // update_portfolio
  new_name?: string;
}

export interface ToolUsed {
  name: string;
  ticker?: string | null;
  summary: string;
  loading?: boolean;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  action?: ChatAction | null; // legacy single action
  actions?: ChatAction[]; // multi-action array
  actionsCreated?: boolean[]; // per-action success flags
  actionCreated?: boolean; // legacy compat
  toolsUsed?: ToolUsed[];
  isStreaming?: boolean;
}

interface AppState {
  maintenanceMode: boolean;
  setMaintenanceMode: (value: boolean) => void;

  connectionError: "warming" | "offline" | null;
  setConnectionError: (value: "warming" | "offline" | null) => void;

  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearChat: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      maintenanceMode: false,
      setMaintenanceMode: (value) => set({ maintenanceMode: value }),

      connectionError: null,
      setConnectionError: (value) => set({ connectionError: value }),

      chatMessages: [],
      addChatMessage: (msg) =>
        set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
      updateChatMessage: (id, updates) =>
        set((s) => ({
          chatMessages: s.chatMessages.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),
      clearChat: () => set({ chatMessages: [] }),
    }),
    {
      name: "tradrnotebook-store",
      partialize: (s) => ({ chatMessages: s.chatMessages }),
    }
  )
);
