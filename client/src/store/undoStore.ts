"use client";

import { create } from "zustand";

export interface UndoFrame {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface UndoState {
  past: UndoFrame[];
  future: UndoFrame[];
  push: (frame: UndoFrame) => void;
  popUndo: () => UndoFrame | undefined;
  popRedo: () => UndoFrame | undefined;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  past: [],
  future: [],

  push: (frame) =>
    set((s) => ({
      past: [...s.past.slice(-19), frame],
      future: [],
    })),

  popUndo: () => {
    const { past, future } = get();
    if (!past.length) return undefined;
    const frame = past[past.length - 1];
    set({ past: past.slice(0, -1), future: [frame, ...future] });
    return frame;
  },

  popRedo: () => {
    const { past, future } = get();
    if (!future.length) return undefined;
    const frame = future[0];
    set({ past: [...past, frame], future: future.slice(1) });
    return frame;
  },
}));
