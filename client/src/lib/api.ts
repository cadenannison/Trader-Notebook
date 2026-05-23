import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
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
      // Supabase not configured - proceed without auth header (dev mode)
    }
  }
  return config;
});

function setWarmingState(warming: boolean) {
  import("@/store/appStore")
    .then(({ useAppStore }) => useAppStore.getState().setBackendWarming(warming))
    .catch(() => {});
}

let warmingTimer: ReturnType<typeof setInterval> | null = null;
let warmingTimeout: ReturnType<typeof setTimeout> | null = null;

function startWarmingCheck() {
  if (warmingTimer) return;
  setWarmingState(true);

  warmingTimer = setInterval(async () => {
    try {
      await axios.get(`${BASE_URL}/api/health`, { timeout: 8000 });
      stopWarmingCheck(false);
    } catch {
      // still starting up
    }
  }, 8000);

  // Give up after 3 minutes
  warmingTimeout = setTimeout(() => stopWarmingCheck(false), 180_000);
}

function stopWarmingCheck(stillWarming: boolean) {
  if (warmingTimer) { clearInterval(warmingTimer); warmingTimer = null; }
  if (warmingTimeout) { clearTimeout(warmingTimeout); warmingTimeout = null; }
  setWarmingState(stillWarming);
}

api.interceptors.response.use(
  (response) => {
    // Clear the banner on any successful response
    if (warmingTimer) stopWarmingCheck(false);
    return response;
  },
  (error) => {
    const isNetworkError =
      axios.isAxiosError(error) &&
      !error.response &&
      (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED");

    if (isNetworkError) startWarmingCheck();
    return Promise.reject(error);
  }
);

export default api;
