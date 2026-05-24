"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Redo2, Undo2 } from "lucide-react";

import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { useUndoStore } from "@/store/undoStore";

function UndoBar() {
  const { past, future, popUndo, popRedo } = useUndoStore();
  const [busy, setBusy] = useState(false);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function handleUndo() {
    if (busy || !canUndo) return;
    const frame = popUndo();
    if (!frame) return;
    setBusy(true);
    try {
      await frame.undo();
    } finally {
      setBusy(false);
    }
  }

  async function handleRedo() {
    if (busy || !canRedo) return;
    const frame = popRedo();
    if (!frame) return;
    setBusy(true);
    try {
      await frame.redo();
    } finally {
      setBusy(false);
    }
  }

  if (!canUndo && !canRedo) return null;

  return (
    <div className="fixed bottom-20 right-4 md:bottom-5 md:right-5 z-50 flex items-center gap-1 bg-slate-900 text-white rounded-full shadow-xl px-3 py-1.5 text-xs font-medium select-none">
      <button
        onClick={handleUndo}
        disabled={!canUndo || busy}
        title="Undo (⌘Z)"
        className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Undo2 size={13} />
        <span className="max-w-[140px] truncate">
          {canUndo ? past[past.length - 1].label : "Nothing to undo"}
        </span>
      </button>
      {canUndo && canRedo && <span className="text-white/20">|</span>}
      {canRedo && (
        <button
          onClick={handleRedo}
          disabled={busy}
          title="Redo (⌘⇧Z)"
          className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
        >
          <Redo2 size={13} />
          <span className="max-w-[140px] truncate">{future[0].label}</span>
        </button>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="md:ml-[220px] min-h-screen pb-16 md:pb-0">{children}</main>
      <BottomNav />
      <UndoBar />
    </>
  );
}
