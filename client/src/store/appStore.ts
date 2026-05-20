"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatAction {
  type: "add_alert" | "show_view" | "log_idea" | "log_trade" | "close_trade";
  // add_alert
  ticker?: string;
  condition?: string;
  price?: number;
  note?: string;
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
}

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  action?: ChatAction | null;
  actionCreated?: boolean;
}

interface AppState {
  maintenanceMode: boolean;
  setMaintenanceMode: (value: boolean) => void;

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

      chatMessages: [],
      addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
      updateChatMessage: (id, updates) =>
        set((s) => ({
          chatMessages: s.chatMessages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        })),
      clearChat: () => set({ chatMessages: [] }),
    }),
    {
      name: "tradrnotebook-store",
      partialize: (s) => ({ chatMessages: s.chatMessages }),
    }
  )
);
