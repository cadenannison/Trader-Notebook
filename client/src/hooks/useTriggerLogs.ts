"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import type { TriggerLog } from "@shared/types";

export function useTriggerLogs() {
  return useQuery({
    queryKey: ["trigger_logs"],
    queryFn: async (): Promise<TriggerLog[]> => {
      const res = await api.get("/api/trigger_logs");
      return res.data;
    },
    staleTime: 60 * 1000,
  });
}
