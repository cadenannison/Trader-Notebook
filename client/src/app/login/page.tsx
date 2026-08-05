"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import api from "@/lib/api";

type Mode = "signin" | "signup" | "reset";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");

  // shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // signin
  const [username, setUsername] = useState("");

  // signup
  const [signupUsername, setSignupUsername] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupDone, setSignupDone] = useState(false);

  // reset
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setResetSent(false);
    setSignupDone(false);
  }

  // ── Sign in ────────────────────────────────────────────────────────────────

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError(null);
    setLoading(true);

    try {
      // Resolve username → email via backend
      const { data: lookup } = await api.get<{ email: string }>(
        "/api/auth/lookup",
        { params: { username: username.trim() } }
      );
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: lookup.email,
        password,
      });
      if (authErr) setError(authErr.message);
    } catch {
      setError("Username not found.");
    } finally {
      setLoading(false);
    }
  }

  // ── Sign up ────────────────────────────────────────────────────────────────

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: signupUsername.trim() || email.split("@")[0] },
        },
      });

      if (authErr) {
        setError(authErr.message);
      } else if (data.session) {
        // email confirmation disabled — already logged in, AuthGuard redirects
      } else {
        setSignupDone(true);
      }
    } catch {
      setError("Sign up failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    const { error: authErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (authErr) {
      setError(authErr.message);
      setLoading(false);
    }
    // On success the browser navigates away to Google, so no further state change here.
  }

  // ── Password reset ─────────────────────────────────────────────────────────

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/login`,
        }
      );
      if (authErr) setError(authErr.message);
      else setResetSent(true);
    } catch {
      setError("Failed to send reset link. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl border-[1.5px] border-brand flex items-center justify-center mx-auto mb-4">
            <span className="text-brand font-bold text-base leading-none">
              tN
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            tradrNotebook
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            AI-powered trading journal
          </p>
        </div>

        {/* ── Reset password ── */}
        {mode === "reset" && (
          <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-4">
            {resetSent ? (
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  Check your inbox
                </p>
                <p className="text-xs text-slate-500">
                  A reset link was sent to{" "}
                  <span className="font-medium">{email}</span>.
                </p>
                <button
                  onClick={() => switchMode("signin")}
                  className="text-xs text-brand hover:underline mt-1"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800 mb-3">
                    Reset your password
                  </p>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                  />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-2 px-4 bg-brand hover:bg-brand-hover disabled:bg-slate-200 text-white disabled:text-slate-400 text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Sign in / Sign up ── */}
        {mode !== "reset" && (
          <>
            {/* Signup confirmation screen */}
            {signupDone ? (
              <div className="bg-white border border-brand-border rounded-xl p-6 text-center shadow-sm space-y-3">
                <p className="text-sm font-medium text-slate-800">
                  Check your inbox
                </p>
                <p className="text-xs text-slate-500">
                  Confirm your email at{" "}
                  <span className="font-medium">{email}</span>, then sign in.
                </p>
                <button
                  onClick={() => switchMode("signin")}
                  className="text-xs text-brand hover:underline"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <div className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-4">
                {/* Mode toggle */}
                <div className="flex rounded-lg border border-slate-200 p-0.5 gap-0.5">
                  {(["signin", "signup"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        mode === m
                          ? "bg-brand text-white shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {m === "signin" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>

                {/* ── Sign in form ── */}
                {mode === "signin" && (
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Username
                      </label>
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="your username"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                      />
                    </div>
                    {error && <p className="text-xs text-red-600">{error}</p>}
                    <button
                      type="submit"
                      disabled={loading || !username || !password}
                      className="w-full py-2 px-4 bg-brand hover:bg-brand-hover disabled:bg-slate-200 text-white disabled:text-slate-400 text-sm font-medium rounded-lg transition-colors"
                    >
                      {loading ? "Signing in…" : "Sign in"}
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="w-full text-xs text-slate-400 hover:text-brand transition-colors"
                    >
                      Forgot password?
                    </button>
                  </form>
                )}

                {/* ── Google OAuth ── */}
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">
                    or
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-sm font-medium text-slate-700 rounded-lg transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                    <path
                      fill="#FFC107"
                      d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
                    />
                    <path
                      fill="#FF3D00"
                      d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                    />
                    <path
                      fill="#4CAF50"
                      d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5C29.4 34.8 26.8 36 24 36c-5.3 0-9.6-3.1-11.3-7.5l-6.5 5C9.6 39.6 16.2 44 24 44z"
                    />
                    <path
                      fill="#1976D2"
                      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.5 5.5C41.4 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"
                    />
                  </svg>
                  Continue with Google
                </button>

                {/* ── Sign up form ── */}
                {mode === "signup" && (
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Username{" "}
                        <span className="font-normal text-slate-400">
                          (optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        autoComplete="username"
                        value={signupUsername}
                        onChange={(e) => setSignupUsername(e.target.value)}
                        placeholder="e.g. cadentrads"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Confirm password
                      </label>
                      <input
                        type="password"
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                      />
                    </div>
                    {error && <p className="text-xs text-red-600">{error}</p>}
                    <button
                      type="submit"
                      disabled={loading || !email || !password}
                      className="w-full py-2 px-4 bg-brand hover:bg-brand-hover disabled:bg-slate-200 text-white disabled:text-slate-400 text-sm font-medium rounded-lg transition-colors"
                    >
                      {loading ? "Creating account…" : "Create account"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
