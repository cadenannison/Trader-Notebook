"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl border-[1.5px] border-brand flex items-center justify-center mx-auto mb-4">
            <span className="text-brand font-bold text-base leading-none">tN</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">tradrNotebook</h1>
          <p className="text-sm text-slate-500 mt-1">AI-powered trading journal</p>
        </div>

        {sent ? (
          <div className="bg-white border border-brand-border rounded-xl p-6 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-800">Check your email</p>
            <p className="text-xs text-slate-500 mt-1">
              We sent a magic link to <span className="font-medium">{email}</span>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-brand-border rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-2 px-4 bg-brand hover:bg-brand-hover disabled:bg-slate-200 text-white disabled:text-slate-400 text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
