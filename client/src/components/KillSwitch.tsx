"use client";

import {
  useMaintenanceMode,
  useSetMaintenanceMode,
} from "@/hooks/useMaintenanceMode";

export function KillSwitch() {
  const { data: maintenanceMode = false } = useMaintenanceMode();
  const { mutate: setMaintenanceMode, isPending } = useSetMaintenanceMode();

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-200">Maintenance Mode</p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Halts all agentic workers and trigger checks instantly without
            requiring a redeploy. Flip this if you see runaway AI costs or
            unexpected behaviour.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={maintenanceMode}
          disabled={isPending}
          onClick={() => setMaintenanceMode(!maintenanceMode)}
          className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none shrink-0 mt-0.5 disabled:opacity-50 ${
            maintenanceMode ? "bg-red-500" : "bg-zinc-600"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              maintenanceMode ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {maintenanceMode && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
          <p className="text-xs text-red-400 font-medium">
            ⚠ Maintenance mode is active — all workers are halted.
          </p>
        </div>
      )}
    </div>
  );
}
