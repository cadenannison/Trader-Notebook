"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";

export function useMaintenanceMode() {
  return useQuery({
    queryKey: ["maintenance-mode"],
    queryFn: async (): Promise<boolean> => {
      const res = await api.get("/api/admin/maintenance");
      return res.data.enabled;
    },
  });
}

export function useSetMaintenanceMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean): Promise<boolean> => {
      const res = await api.put("/api/admin/maintenance", { enabled });
      return res.data.enabled;
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData(["maintenance-mode"], enabled);
    },
  });
}
