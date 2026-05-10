import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

// Attach Supabase JWT when available
api.interceptors.request.use(async (config) => {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const { supabase } = await import("./supabase");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch {
      // Supabase not configured — proceed without auth header (dev mode)
    }
  }
  return config;
});

export default api;
