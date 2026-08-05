"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import api from "@/lib/api";
import {
  useMaintenanceMode,
  useSetMaintenanceMode,
} from "@/hooks/useMaintenanceMode";

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
        {title}
      </h2>
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
        {description && (
          <p className="text-xs text-slate-500 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full transition-colors focus:outline-none disabled:opacity-50 ${checked ? "bg-brand" : "bg-slate-200"}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-[18px]" : ""}`}
      />
    </button>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteModal({
  onClose,
  onConfirm,
  busy,
}: {
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const [typed, setTyped] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          Delete your account?
        </h2>
        <p className="text-sm text-slate-500">
          This permanently deletes all your trades, alerts, notes, and your
          login. There is no undo.
        </p>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            Type <span className="font-mono text-red-500">DELETE</span> to
            confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
            placeholder="DELETE"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== "DELETE" || busy}
            className="flex-1 py-2 text-sm font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: maintenanceMode = false } = useMaintenanceMode();
  const { mutate: setMaintenanceMode, isPending: maintenanceModePending } =
    useSetMaintenanceMode();

  // Username
  const [username, setUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);

  // Trading profile
  const [accountSize, setAccountSize] = useState("");
  const [riskPct, setRiskPct] = useState("1");
  const [tradingStyle, setTradingStyle] = useState("swing");
  const [briefingEnabled, setBriefingEnabled] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Delete
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load current user metadata on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const meta = data.user.user_metadata ?? {};
      if (meta.username) setUsername(meta.username);
      if (meta.account_size != null) setAccountSize(String(meta.account_size));
      if (meta.risk_pct_per_trade != null) setRiskPct(String(meta.risk_pct_per_trade));
      if (meta.trading_style) setTradingStyle(meta.trading_style);
      if (meta.briefing_enabled != null) setBriefingEnabled(meta.briefing_enabled);
    });
  }, []);

  async function handleSaveProfile() {
    setProfileSaving(true);
    try {
      const parsedRiskPct = parseFloat(riskPct);
      await supabase.auth.updateUser({
        data: {
          account_size: accountSize ? parseFloat(accountSize) : null,
          risk_pct_per_trade: Number.isNaN(parsedRiskPct) ? 1 : parsedRiskPct,
          trading_style: tradingStyle,
          briefing_enabled: briefingEnabled,
        },
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch {
      alert("Save failed. Try again.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSaveUsername() {
    if (!username.trim()) return;
    setUsernameSaving(true);
    try {
      await supabase.auth.updateUser({ data: { username: username.trim() } });
      setUsernameSaved(true);
      setTimeout(() => setUsernameSaved(false), 2000);
    } catch {
      alert("Save failed. Try again.");
    } finally {
      setUsernameSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get("/api/user/export");
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tradrnotebook-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await api.delete("/api/user/me");
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      alert("Delete failed. Try again.");
      setDeleting(false);
      setDeleteModal(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 space-y-10">
      <div className="space-y-1">
        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.07em]">
          Workspace controls
        </p>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-slate-500">
          Manage your account, preferences, and data.
        </p>
      </div>

      <SettingsSection title="Profile">
        <div className="bg-white border border-brand-subtle rounded-xl divide-y divide-brand-subtle px-4">
          <SettingsRow
            label="Username"
            description="Used in AI context and shown in the sidebar."
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your username"
                className="w-36 text-sm border border-brand-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-app-bg text-slate-800 placeholder:text-slate-400"
              />
              <button
                onClick={handleSaveUsername}
                disabled={usernameSaving || !username.trim()}
                className="text-xs font-medium text-white bg-brand hover:bg-brand-hover rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {usernameSaved ? "Saved!" : usernameSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title="Trading profile">
        <div className="bg-white border border-brand-subtle rounded-xl divide-y divide-brand-subtle px-4">
          <SettingsRow
            label="Account size"
            description="Used by the position sizing calculator in chat."
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-slate-500">$</span>
              <input
                type="number"
                value={accountSize}
                onChange={(e) => setAccountSize(e.target.value)}
                placeholder="e.g. 50000"
                className="w-32 text-sm border border-brand-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-app-bg text-slate-800 placeholder:text-slate-400"
              />
            </div>
          </SettingsRow>
          <SettingsRow
            label="Risk per trade"
            description="Maximum % of account to risk on a single trade."
          >
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                placeholder="1"
                min={0.1}
                max={10}
                step={0.1}
                className="w-20 text-sm border border-brand-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-app-bg text-slate-800 placeholder:text-slate-400"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </SettingsRow>
          <SettingsRow
            label="Trading style"
            description="Affects AI coaching tone and suggestions."
          >
            <div className="flex gap-1.5">
              {(["day", "swing", "position"] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => setTradingStyle(style)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${
                    tradingStyle === style
                      ? "bg-brand text-white"
                      : "border border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {style.charAt(0).toUpperCase() + style.slice(1)}
                </button>
              ))}
            </div>
          </SettingsRow>
          <SettingsRow
            label="Daily briefing"
            description="Receive a personalized morning email before market open."
          >
            <Toggle checked={briefingEnabled} onChange={setBriefingEnabled} />
          </SettingsRow>
          <div className="py-3">
            <button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="w-full py-2 text-sm font-semibold text-white bg-brand hover:bg-brand-hover rounded-xl transition-colors disabled:opacity-50"
            >
              {profileSaved ? "Saved!" : profileSaving ? "Saving…" : "Save trading profile"}
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="System">
        <div className="bg-white border border-brand-subtle rounded-xl px-4">
          <SettingsRow
            label="Maintenance mode"
            description="Halts all workers and alert checks instantly without a redeploy."
          >
            <Toggle
              checked={maintenanceMode}
              disabled={maintenanceModePending}
              onChange={setMaintenanceMode}
            />
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
              description="Download all your trades, alerts, notes, and journal as JSON."
            >
              <button
                onClick={handleExport}
                disabled={exporting}
                className="text-xs font-medium text-brand hover:text-brand-hover border border-brand-border hover:border-brand rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {exporting ? "Exporting…" : "Export"}
              </button>
            </SettingsRow>
          </div>
          <div className="px-4">
            <SettingsRow
              label="Delete account"
              description="Permanently delete your account and all data. Cannot be undone."
            >
              <button
                onClick={() => setDeleteModal(true)}
                className="text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                Delete account
              </button>
            </SettingsRow>
          </div>
        </div>
      </SettingsSection>

      {deleteModal && (
        <DeleteModal
          onClose={() => setDeleteModal(false)}
          onConfirm={handleDeleteAccount}
          busy={deleting}
        />
      )}
    </div>
  );
}
