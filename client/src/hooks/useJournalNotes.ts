"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import type { JournalNote } from "@shared/types";

export interface JournalNoteFilters {
  tags?: string[];
  from_date?: string;
  to_date?: string;
}

export function useJournalNotes(filters?: JournalNoteFilters) {
  const params: Record<string, string> = {};
  if (filters?.tags?.length) params.tags = filters.tags.join(",");
  if (filters?.from_date) params.from_date = filters.from_date;
  if (filters?.to_date) params.to_date = filters.to_date;

  return useQuery({
    queryKey: ["journal-notes", params],
    queryFn: async (): Promise<JournalNote[]> => {
      const res = await api.get("/api/journal-notes", { params });
      return res.data;
    },
  });
}

export function useCreateJournalNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title?: string;
      content: string;
      tags?: string[];
    }): Promise<JournalNote> => {
      const res = await api.post("/api/journal-notes", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-notes"] });
    },
  });
}

export function useUpdateJournalNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      content?: string;
      tags?: string[];
    }): Promise<JournalNote> => {
      const res = await api.put(`/api/journal-notes/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-notes"] });
    },
  });
}

export function useDeleteJournalNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/api/journal-notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-notes"] });
    },
  });
}
