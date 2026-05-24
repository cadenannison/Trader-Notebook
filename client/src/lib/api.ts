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

type ConnectionError = "warming" | "offline" | null;

function setConnectionError(status: ConnectionError) {
  import("@/store/appStore")
    .then(({ useAppStore }) => useAppStore.getState().setConnectionError(status))
    .catch(() => {});
}

let warmingTimer: ReturnType<typeof setInterval> | null = null;
let warmingTimeout: ReturnType<typeof setTimeout> | null = null;
let lastTriggerTime = 0;
const RETRIGGER_COOLDOWN = 30_000;

// Distinguish offline vs backend-down without relying on ERR_NETWORK alone.
// ERR_NETWORK fires for both real network failures AND CORS rejections;
// navigator.onLine is a fast, reliable way to rule out the offline case.
function detectIssue(): ConnectionError {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  return "warming";
}

async function startConnectionCheck() {
  const now = Date.now();
  // Guard: don't restart while a check is running, and enforce cooldown
  if (warmingTimer || now - lastTriggerTime < RETRIGGER_COOLDOWN) return;
  lastTriggerTime = now;

  const issue = detectIssue();
  setConnectionError(issue);

  if (issue === "offline") {
    // Wait for the browser's online event rather than polling the backend
    const onOnline = () => {
      window.removeEventListener("online", onOnline);
      // Re-run a fresh check — we're online but backend may still be cold
      lastTriggerTime = 0;
      startConnectionCheck();
    };
    window.addEventListener("online", onOnline);
    return;
  }

  // Backend may be cold-starting — poll health until it responds
  warmingTimer = setInterval(async () => {
    // Re-check internet during the poll in case we went offline
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setConnectionError("offline");
      return;
    }
    try {
      await axios.get(`${BASE_URL}/api/health`, { timeout: 8000 });
      stopConnectionCheck();
    } catch {
      // still unreachable — keep waiting
    }
  }, 8000);

  // Stop after 3 minutes — something else is wrong, don't show forever
  warmingTimeout = setTimeout(() => stopConnectionCheck(), 180_000);
}

function stopConnectionCheck() {
  if (warmingTimer) {
    clearInterval(warmingTimer);
    warmingTimer = null;
  }
  if (warmingTimeout) {
    clearTimeout(warmingTimeout);
    warmingTimeout = null;
  }
  setConnectionError(null);
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only trigger for genuine connectivity failures, not HTTP errors (4xx/5xx
    // have a response object) and not auth rejections.
    const isConnectivityFailure =
      axios.isAxiosError(error) &&
      !error.response &&
      (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED");

    if (isConnectivityFailure) startConnectionCheck();
    return Promise.reject(error);
  }
);

export default api;

export interface ChatStreamEvent {
  type: "tool_start" | "tool_done" | "done" | "error";
  // tool_start
  name?: string;
  ticker?: string | null;
  // tool_done
  summary?: string;
  data?: Record<string, unknown>;
  // done
  message?: string;
  actions?: unknown[];
  tools_used?: { name: string; ticker?: string | null; summary: string; data?: Record<string, unknown> }[];
  // error
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const { supabase } = await import("./supabase");
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch {
      // dev mode — no auth
    }
  }
  return headers;
}

export async function streamChat(
  message: string,
  history: { role: string; text: string }[],
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch {
          // malformed event — skip
        }
      }
    }
  }
}
