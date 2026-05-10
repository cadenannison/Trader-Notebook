"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatAction {
  type: "add_alert" | "show_view";
  ticker?: string;
  condition?: string;
  price?: number;
  note?: string;
  view?: string;
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
