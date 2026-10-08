import type { CreatePostInput, SocialPostStatus, UpdatePostInput } from "@oca/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { MediaFileDto, SocialPostDto } from "./posts";
import { toQueryString } from "./query-string";
import type { Page } from "./types";

export const postKeys = { all: ["posts"] as const };

/** ໂພສທີ່ກຳລັງຈະຂຶ້ນເພຈ: poll ຈົນຮູ້ຜົນ */
const PUBLISH_POLL_MS = 3000;

export interface PostListParams {
  status?: SocialPostStatus | "";
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

/** ກຳລັງໂພສ ຫຼື ຮອດເວລາແລ້ວແຕ່ຍັງບໍ່ໄດ້ຜົນ */
export function isPublishPending(post: Pick<SocialPostDto, "status" | "scheduledAt">, now: number = Date.now()): boolean {
  if (post.status === "PUBLISHING") return true;
  return post.status === "SCHEDULED" && post.scheduledAt !== null && new Date(post.scheduledAt).getTime() <= now;
}

export function usePosts(params: PostListParams) {
  return useQuery({
    queryKey: [...postKeys.all, "list", params],
    queryFn: () => apiFetch<Page<SocialPostDto>>(`/posts${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some((post) => isPublishPending(post)) ? PUBLISH_POLL_MS : false),
  });
}

export function usePost(id: string | null) {
  return useQuery({
    queryKey: [...postKeys.all, "detail", id],
    queryFn: () => apiFetch<SocialPostDto>(`/posts/${encodeURIComponent(id ?? "")}`),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data && isPublishPending(query.state.data) ? PUBLISH_POLL_MS : false),
  });
}

function useInvalidatePosts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: postKeys.all });
}

export function useSavePost() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (args: { id: null; input: CreatePostInput } | { id: string; input: UpdatePostInput }) =>
      args.id === null
        ? apiFetch<SocialPostDto>("/posts", { method: "POST", body: args.input })
        : apiFetch<SocialPostDto>(`/posts/${encodeURIComponent(args.id)}`, { method: "PATCH", body: args.input }),
    onSuccess: invalidate,
  });
}

export type PostAction = { kind: "schedule"; scheduledAt?: string } | { kind: "cancel" } | { kind: "retry" };

export function usePostAction() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: PostAction }) =>
      apiFetch<SocialPostDto>(`/posts/${encodeURIComponent(id)}/${action.kind}`, {
        method: "POST",
        body: action.kind === "schedule" ? (action.scheduledAt ? { scheduledAt: action.scheduledAt } : {}) : undefined,
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePost() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/posts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useUploadMedia() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return apiFetch<MediaFileDto>("/media", { method: "POST", body: form });
    },
  });
}
