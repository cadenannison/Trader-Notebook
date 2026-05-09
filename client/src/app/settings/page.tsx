"use client";

import { KillSwitch } from "@/components/KillSwitch";

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage your account and system preferences.</p>
      </div>

      <SettingsSection title="System">
        <KillSwitch />
      </SettingsSection>

      <SettingsSection title="Account">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-zinc-200">Export data</p>
              <p className="text-xs text-zinc-500">Download all your notes and triggers as JSON.</p>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-400/60 rounded px-3 py-1.5 transition-colors shrink-0"
              onClick={() => {
                // TODO: call GET /api/user/export and trigger file download
                alert("Export not connected yet — wire up GET /api/user/export");
              }}
            >
              Export
            </button>
          </div>

          <div className="p-4 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-zinc-200">Delete account</p>
              <p className="text-xs text-zinc-500">
                Permanently delete your account and all data. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 rounded px-3 py-1.5 transition-colors shrink-0"
              onClick={() => {
                // TODO: confirmation modal + call DELETE /api/user/me
                alert("Delete not connected yet — wire up DELETE /api/user/me");
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="About">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Version</span>
            <span className="text-zinc-300 font-mono">0.1.0-dev</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Environment</span>
            <span className="text-zinc-300 font-mono">development</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Backend</span>
            <span className="text-zinc-300 font-mono">localhost:8000</span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
