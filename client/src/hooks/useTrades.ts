"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import type { ConfidenceTag, ExitReason, TimeHorizon, Trade } from "@shared/types";

export function useTrades(opts?: { ticker?: string; status?: "open" | "closed" }) {
  const params: Record<string, string> = {};
  if (opts?.ticker) params.ticker = opts.ticker;
  if (opts?.status) params.status = opts.status;

  return useQuery({
    queryKey: ["trades", opts?.status ?? "all", opts?.ticker ?? "all"],
    queryFn: async (): Promise<Trade[]> => {
      const res = await api.get("/api/trades", { params });
      return res.data;
    },
  });
}

export function useCreateTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      ticker: string;
      entry_price: number;
      time_horizon?: TimeHorizon;
      confidence_tag?: ConfidenceTag;
      watchlist_entry_id?: string | null;
      cost_basis?: number | null;
      shares?: number | null;
      pre_trade_notes?: string | null;
    }): Promise<Trade> => {
      const res = await api.post("/api/trades", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useCloseTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      exit_price,
      exit_reason,
    }: {
      id: string;
      exit_price: number;
      exit_reason: ExitReason;
    }): Promise<Trade> => {
      const res = await api.put(`/api/trades/${id}/close`, { exit_price, exit_reason });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useDeleteTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tradeId: string): Promise<void> => {
      await api.delete(`/api/trades/${tradeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trades"] });
    },
  });
}

export function useUpdateTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      entry_price?: number;
      time_horizon?: TimeHorizon;
      confidence_tag?: ConfidenceTag;
      shares?: number | null;
      cost_basis?: number | null;
      pre_trade_notes?: string | null;
      exit_price?: number;
      exit_reason?: ExitReason;
    }): Promise<Trade> => {
      const res = await api.put(`/api/trades/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trades"] });
    },
  });
}

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  hit_target: "Hit target",
  hit_stop_loss: "Hit stop loss",
  manually_stopped_out: "Manually stopped out",
  thesis_changed: "Thesis changed",
  panic_sold: "Panic sold",
  needed_capital: "Needed capital",
};

export const TIME_HORIZON_LABELS: Record<TimeHorizon, string> = {
  intraday: "Intraday",
  swing: "Swing",
  position: "Position",
};
