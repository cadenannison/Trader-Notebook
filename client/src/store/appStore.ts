"use client";

import { create } from "zustand";

import { MOCK_NOTES } from "@/mocks/notes";
import { MOCK_TRIGGERS } from "@/mocks/triggers";
import type { PriceTrigger, UserNote } from "@shared/types";

interface AppState {
  notes: UserNote[];
  triggers: PriceTrigger[];
  maintenanceMode: boolean;

  addNote: (note: UserNote) => void;
  addTrigger: (trigger: PriceTrigger) => void;
  rearmTrigger: (triggerId: string) => void;
  deleteTrigger: (triggerId: string) => void;
  setMaintenanceMode: (value: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  notes: MOCK_NOTES,
  triggers: MOCK_TRIGGERS,
  maintenanceMode: false,

  addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),

  addTrigger: (trigger) => set((state) => ({ triggers: [trigger, ...state.triggers] })),

  rearmTrigger: (triggerId) =>
    set((state) => ({
      triggers: state.triggers.map((t) =>
        t.id === triggerId ? { ...t, is_active: true, last_triggered_at: null } : t
      ),
    })),

  deleteTrigger: (triggerId) =>
    set((state) => ({
      triggers: state.triggers.filter((t) => t.id !== triggerId),
    })),

  setMaintenanceMode: (value) => set({ maintenanceMode: value }),
}));
