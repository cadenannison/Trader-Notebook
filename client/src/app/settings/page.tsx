"use client";

import { useState } from "react";

import { supabase } from "@/lib/supabase";
import api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

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
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full transition-colors focus:outline-none ${checked ? "bg-brand" : "bg-slate-200"}`}
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
  const { maintenanceMode, setMaintenanceMode } = useAppStore();
  const [alertNotifications, setAlertNotifications] = useState(true);
  const [marketReminder, setMarketReminder] = useState(false);

  // Username
  const [username, setUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Delete
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSaveUsername() {
    if (!username.trim()) return;
    setUsernameSaving(true);
    await supabase.auth.updateUser({ data: { username: username.trim() } });
    setUsernameSaving(false);
    setUsernameSaved(true);
    setTimeout(() => setUsernameSaved(false), 2000);
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

      <SettingsSection title="Notifications">
        <div className="bg-white border border-brand-subtle rounded-xl divide-y divide-brand-subtle">
          <div className="px-4">
            <SettingsRow
              label="Alert notifications"
              description="Desktop notification when a price alert triggers."
            >
              <Toggle
                checked={alertNotifications}
                onChange={setAlertNotifications}
              />
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
