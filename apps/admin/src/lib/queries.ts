import type { CreateStaffInput, RoleInput, UpdateStaffInput } from "@oca/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { RoleDto, StaffDto } from "./types";

export const queryKeys = {
  staff: ["staff"] as const,
  roles: ["roles"] as const,
};

export function useStaffList() {
  return useQuery({ queryKey: queryKeys.staff, queryFn: () => apiFetch<StaffDto[]>("/staff") });
}

export function useRoleList() {
  return useQuery({ queryKey: queryKeys.roles, queryFn: () => apiFetch<RoleDto[]>("/roles") });
}

/** ພະນັກງານປ່ຽນ → userCount ຂອງ role ປ່ຽນ ຈຶ່ງ refresh ທັງສອງ. */
function useInvalidate(...keys: (readonly string[])[]) {
  const queryClient = useQueryClient();
  return () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useCreateStaff() {
  const invalidate = useInvalidate(queryKeys.staff, queryKeys.roles);
  return useMutation({
    mutationFn: (input: CreateStaffInput) => apiFetch<StaffDto>("/staff", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateStaff() {
  const invalidate = useInvalidate(queryKeys.staff, queryKeys.roles);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStaffInput }) =>
      apiFetch<StaffDto>(`/staff/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useSaveRole() {
  const invalidate = useInvalidate(queryKeys.roles, queryKeys.staff);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RoleInput }) =>
      id
        ? apiFetch<RoleDto>(`/roles/${id}`, { method: "PUT", body: input })
        : apiFetch<RoleDto>("/roles", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidate(queryKeys.roles);
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
