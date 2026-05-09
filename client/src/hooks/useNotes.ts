"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppStore } from "@/store/appStore";
import type { UserNote } from "@shared/types";

export function useNotes(ticker?: string) {
  const notes = useAppStore((s) => s.notes);

  return useQuery({
    queryKey: ["notes", ticker ?? "all"],
    queryFn: async (): Promise<UserNote[]> => {
      // TODO: replace with live call:
      // const res = await axios.get(`${API}/api/notes`, { params: ticker ? { ticker } : {} });
      // return res.data;
      return ticker ? notes.filter((n) => n.ticker === ticker) : notes;
    },
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const addNote = useAppStore((s) => s.addNote);

  return useMutation({
    mutationFn: async (data: { ticker: string; content: string }): Promise<UserNote> => {
      // TODO: replace with live call:
      // const res = await axios.post(`${API}/api/notes`, data, { headers: { Authorization: ... } });
      // return res.data;
      return {
        id: `note-${Date.now()}`,
        ticker: data.ticker.toUpperCase(),
        content: data.content,
        created_at: new Date().toISOString(),
      };
    },
    onSuccess: (note) => {
      addNote(note);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
