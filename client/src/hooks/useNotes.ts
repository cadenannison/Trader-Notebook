"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import type { UserNote } from "@shared/types";

export function useNotes(ticker?: string) {
  return useQuery({
    queryKey: ["notes", ticker ?? "all"],
    queryFn: async (): Promise<UserNote[]> => {
      const params = ticker ? { ticker } : {};
      const res = await api.get("/api/notes", { params });
      return res.data;
    },
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { ticker: string; content: string }): Promise<UserNote> => {
      const res = await api.post("/api/notes", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
