"use client";

import { create } from "zustand";

interface AppState {
  maintenanceMode: boolean;
  setMaintenanceMode: (value: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  maintenanceMode: false,
  setMaintenanceMode: (value) => set({ maintenanceMode: value }),
}));
