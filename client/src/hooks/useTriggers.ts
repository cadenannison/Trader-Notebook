"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppStore } from "@/store/appStore";
import type { PriceTrigger } from "@shared/types";

export function useTriggers(ticker?: string) {
  const triggers = useAppStore((s) => s.triggers);

  return useQuery({
    queryKey: ["triggers", ticker ?? "all"],
    queryFn: async (): Promise<PriceTrigger[]> => {
      // TODO: replace with live call
      return ticker ? triggers.filter((t) => t.ticker === ticker) : triggers;
    },
  });
}

export function useCreateTrigger() {
  const queryClient = useQueryClient();
  const addTrigger = useAppStore((s) => s.addTrigger);

  return useMutation({
    mutationFn: async (data: {
      ticker: string;
      target_price: number;
      condition: "above" | "below";
      auto_disarm: boolean;
      cooldown_hours: number;
    }): Promise<PriceTrigger> => {
      // TODO: replace with live call
      return {
        id: `trigger-${Date.now()}`,
        ...data,
        ticker: data.ticker.toUpperCase(),
        is_active: true,
        last_triggered_at: null,
      };
    },
    onSuccess: (trigger) => {
      addTrigger(trigger);
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
    },
  });
}

export function useRearmTrigger() {
  const queryClient = useQueryClient();
  const rearmTrigger = useAppStore((s) => s.rearmTrigger);

  return useMutation({
    mutationFn: async (triggerId: string) => triggerId,
    onSuccess: (triggerId) => {
      rearmTrigger(triggerId);
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
    },
  });
}

export function useDeleteTrigger() {
  const queryClient = useQueryClient();
  const deleteTrigger = useAppStore((s) => s.deleteTrigger);

  return useMutation({
    mutationFn: async (triggerId: string) => triggerId,
    onSuccess: (triggerId) => {
      deleteTrigger(triggerId);
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
    },
  });
}
