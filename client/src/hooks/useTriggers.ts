"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import type { PriceTrigger } from "@shared/types";

export function useTriggers(ticker?: string) {
  return useQuery({
    queryKey: ["triggers", ticker ?? "all"],
    queryFn: async (): Promise<PriceTrigger[]> => {
      const params = ticker ? { ticker } : {};
      const res = await api.get("/api/triggers", { params });
      return res.data;
    },
  });
}

export function useCreateTrigger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      ticker: string;
      target_price: number;
      condition: "above" | "below";
      auto_disarm: boolean;
      cooldown_hours: number;
    }): Promise<PriceTrigger> => {
      const res = await api.post("/api/triggers", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
    },
  });
}

export function useRearmTrigger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (triggerId: string): Promise<PriceTrigger> => {
      const res = await api.put(`/api/triggers/${triggerId}/rearm`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
    },
  });
}

export function useDeleteTrigger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (triggerId: string): Promise<void> => {
      await api.delete(`/api/triggers/${triggerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
    },
  });
}
