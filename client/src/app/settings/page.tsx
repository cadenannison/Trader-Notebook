"use client";

import { useState } from "react";

import { useAppStore } from "@/store/appStore";

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">{title}</h2>
      {children}
    </section>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="space-y-0.5 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500 leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full transition-colors focus:outline-none ${
        checked ? "bg-brand" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? "translate-x-[18px]" : ""
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { maintenanceMode, setMaintenanceMode } = useAppStore();
  const [alertNotifications, setAlertNotifications] = useState(true);
  const [marketReminder, setMarketReminder] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [finnhubKey, setFinnhubKey] = useState("");

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 space-y-10">
      <div className="space-y-1">
        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
          Workspace controls
        </p>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500">Manage your account, API keys, and preferences.</p>
      </div>

      <SettingsSection title="Profile">
        <div className="bg-white border border-brand-subtle rounded-xl divide-y divide-brand-subtle">
          <SettingsRow
            label="Display name"
            description="Used in AI context and trade reports."
          >
            <input
              type="text"
              placeholder="Your name"
              className="w-36 text-sm border border-brand-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-app-bg text-slate-800 placeholder:text-slate-400"
            />
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title="API Keys">
        <div className="bg-white border border-brand-subtle rounded-xl divide-y divide-brand-subtle">
          <SettingsRow
            label="Google AI (Gemini)"
            description="Powers the chat assistant and insight generation."
          >
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza…"
              className="w-44 text-sm border border-brand-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-app-bg text-slate-800 placeholder:text-slate-400 font-mono"
            />
          </SettingsRow>
          <SettingsRow
            label="Finnhub"
            description="Live price data for alert checks and news feed."
          >
            <input
              type="password"
              value={finnhubKey}
              onChange={(e) => setFinnhubKey(e.target.value)}
              placeholder="c1a2b3…"
              className="w-44 text-sm border border-brand-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-app-bg text-slate-800 placeholder:text-slate-400 font-mono"
            />
          </SettingsRow>
        </div>
        <button className="text-xs font-medium text-white bg-brand hover:bg-brand-hover rounded-lg px-4 py-2 transition-colors">
          Save keys
        </button>
      </SettingsSection>

      <SettingsSection title="Notifications">
        <div className="bg-white border border-brand-subtle rounded-xl divide-y divide-brand-subtle">
          <div className="px-4">
            <SettingsRow
              label="Alert notifications"
              description="Desktop notification when a price alert triggers."
            >
              <Toggle checked={alertNotifications} onChange={setAlertNotifications} />
            </SettingsRow>
          </div>
          <div className="px-4">
            <SettingsRow
              label="Market open reminder"
              description="Remind me when US markets open at 9:30 AM ET."
            >
              <Toggle checked={marketReminder} onChange={setMarketReminder} />
            </SettingsRow>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="System">
        <div className="bg-white border border-brand-subtle rounded-xl px-4">
          <SettingsRow
            label="Maintenance mode"
            description="Halts all workers and alert checks instantly without a redeploy."
          >
            <Toggle checked={maintenanceMode} onChange={setMaintenanceMode} />
          </SettingsRow>
        </div>
        {maintenanceMode && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-xs text-red-600 font-medium">
              Maintenance mode active — all workers are halted.
            </p>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Data">
        <div className="bg-white border border-brand-subtle rounded-xl divide-y divide-brand-subtle">
          <div className="px-4">
            <SettingsRow
              label="Export data"
              description="Download all alerts and trades as JSON."
            >
              <button
                onClick={() => alert("Wire up GET /api/user/export")}
                className="text-xs font-medium text-brand hover:text-brand-hover border border-brand-border hover:border-brand rounded-lg px-3 py-1.5 transition-colors"
              >
                Export
              </button>
            </SettingsRow>
          </div>
          <div className="px-4">
            <SettingsRow
              label="Reset everything"
              description="Permanently delete your account and all data."
            >
              <button
                onClick={() => alert("Wire up DELETE /api/user/me")}
                className="text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                Delete account
              </button>
            </SettingsRow>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
