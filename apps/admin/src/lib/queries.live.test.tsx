import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import {
  LIVE_POLL_MS,
  useCfComments,
  useDeleteLiveItem,
  useLiveSession,
  useLiveSessionAction,
  useLiveSessions,
  useResendCfReply,
  useSaveLiveItem,
} from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

const calls = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]);

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("live-cf query hooks", () => {
  it("list/comment ສົ່ງ query string ທີ່ຖືກ (ຄ່າວ່າງບໍ່ສົ່ງ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 30 });
    const { Wrapper } = wrapper();
    renderHook(() => useLiveSessions({ status: "LIVE", page: 2, pageSize: 30 }), { wrapper: Wrapper });
    renderHook(() => useCfComments("s1", { outcome: "", page: 1, pageSize: 50 }, { live: false }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(calls().sort()).toEqual(["/live-sessions/s1/comments?page=1&pageSize=50", "/live-sessions?status=LIVE&page=2&pageSize=30"]);
  });

  it("useLiveSession poll ທຸກ 5 ວິ ສະເພາະຕອນ LIVE", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let status = "LIVE";
    vi.mocked(apiFetch).mockImplementation((async () => ({ id: "s1", status, items: [] })) as typeof apiFetch);
    const { Wrapper } = wrapper();
    renderHook(() => useLiveSession("s1"), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(LIVE_POLL_MS));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    status = "ENDED";
    await act(() => vi.advanceTimersByTimeAsync(LIVE_POLL_MS));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    // ໄດ້ ENDED ແລ້ວ: ຢຸດ poll
    await act(() => vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 3));
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(calls()[0]).toBe("/live-sessions/s1");
  });

  it("start/end, ເພີ່ມ/ແກ້/ລຶບລະຫັດ, resend ເອີ້ນ endpoint ທີ່ຖືກ ແລະ invalidate live-sessions", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const action = renderHook(() => useLiveSessionAction(), { wrapper: Wrapper });
    const save = renderHook(() => useSaveLiveItem(), { wrapper: Wrapper });
    const remove = renderHook(() => useDeleteLiveItem(), { wrapper: Wrapper });
    const resend = renderHook(() => useResendCfReply(), { wrapper: Wrapper });
    await act(() => action.result.current.mutateAsync({ id: "s1", action: "start" }));
    await act(() => action.result.current.mutateAsync({ id: "s1", action: "end" }));
    await act(() => save.result.current.mutateAsync({ sessionId: "s1", input: { code: "A1", variantId: "v1", limit: null } }));
    await act(() => save.result.current.mutateAsync({ sessionId: "s1", itemId: "i1", input: { limit: 5 } }));
    await act(() => remove.result.current.mutateAsync({ sessionId: "s1", itemId: "i1" }));
    await act(() => resend.result.current.mutateAsync({ sessionId: "s1", commentId: "c1" }));
    expect(vi.mocked(apiFetch).mock.calls).toEqual([
      ["/live-sessions/s1/start", { method: "POST" }],
      ["/live-sessions/s1/end", { method: "POST" }],
      ["/live-sessions/s1/items", { method: "POST", body: { code: "A1", variantId: "v1", limit: null } }],
      ["/live-sessions/s1/items/i1", { method: "PATCH", body: { limit: 5 } }],
      ["/live-sessions/s1/items/i1", { method: "DELETE" }],
      ["/live-sessions/s1/comments/c1/resend", { method: "POST" }],
    ]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["live-sessions"] });
  });
});
