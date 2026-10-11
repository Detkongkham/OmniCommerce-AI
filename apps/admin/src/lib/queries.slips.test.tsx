import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import {
  useConfirmSlip,
  useConversationSlips,
  useLinkChatSlip,
  useOrderSlips,
  usePatchSlip,
  useRejectSlip,
  useRetrySlip,
  useSlipImage,
  useUploadSlip,
} from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("slip hooks", () => {
  it("useOrderSlips: GET /orders/:id/slips; poll ທຸກ 3 ວິ ສະເພາະເມື່ອມີ PENDING_READ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    const { client, Wrapper } = wrapper();
    renderHook(() => useOrderSlips("o1"), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/orders/o1/slips"));
    const query = client.getQueryCache().find({ queryKey: ["slips", "order", "o1"] });
    const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval as (q: unknown) => number | false;
    expect(interval({ state: { data: [{ status: "PENDING_READ" }] } })).toBe(3000);
    expect(interval({ state: { data: [{ status: "READ" }, { status: "CONFIRMED" }] } })).toBe(false);
    expect(interval({ state: { data: undefined } })).toBe(false);
  });

  it("useOrderSlips enabled=false ບໍ່ຍິງ", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useOrderSlips("o1", { enabled: false }), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("useConversationSlips: GET /conversations/:id/slips", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    const { Wrapper } = wrapper();
    renderHook(() => useConversationSlips("c1"), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/conversations/c1/slips"));
  });

  it("useSlipImage: ໂຫຼດເປັນ blob", async () => {
    const blob = new Blob(["x"]);
    vi.mocked(apiFetch).mockResolvedValue(blob);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSlipImage("s1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBe(blob));
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/image", { responseType: "blob" });
  });

  it("useUploadSlip: POST multipart ດ້ວຍ field 'file'; invalidate slips", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "s1" });
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUploadSlip(), { wrapper: Wrapper });
    const file = new File(["x"], "a.png", { type: "image/png" });
    await act(() => result.current.mutateAsync({ orderId: "o1", file }));
    const [path, options] = vi.mocked(apiFetch).mock.calls[0] as [string, { method: string; body: FormData }];
    expect(path).toBe("/orders/o1/slips");
    expect(options.method).toBe("POST");
    expect(options.body.get("file")).toBeInstanceOf(File);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["slips"] });
  });

  it("useLinkChatSlip: POST /conversations/:cid/messages/:mid/slips ດ້ວຍ { orderId, attachmentIndex }", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "s1" });
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useLinkChatSlip(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ conversationId: "c1", messageId: "m1", input: { orderId: "o1", attachmentIndex: 0 } }));
    expect(apiFetch).toHaveBeenCalledWith("/conversations/c1/messages/m1/slips", { method: "POST", body: { orderId: "o1", attachmentIndex: 0 } });
  });

  it("usePatchSlip / useRetrySlip / useRejectSlip: path + method + body ຖືກ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { Wrapper } = wrapper();
    const patch = renderHook(() => usePatchSlip(), { wrapper: Wrapper });
    const retry = renderHook(() => useRetrySlip(), { wrapper: Wrapper });
    const reject = renderHook(() => useRejectSlip(), { wrapper: Wrapper });
    await act(() => patch.result.current.mutateAsync({ id: "s1", input: { confirmedAmount: "5", confirmedRefNo: null } }));
    await act(() => retry.result.current.mutateAsync("s1"));
    await act(() => reject.result.current.mutateAsync({ id: "s1", reason: "x" }));
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1", { method: "PATCH", body: { confirmedAmount: "5", confirmedRefNo: null } });
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/retry", { method: "POST" });
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/reject", { method: "POST", body: { reason: "x" } });
  });

  it("useConfirmSlip: POST confirm; invalidate ທັງ slips ແລະ orders (ບິນເປັນ PAID); ລົ້ມກໍ invalidate (ສະຖານະອາດປ່ຽນ)", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useConfirmSlip(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync("s1"));
    expect(apiFetch).toHaveBeenCalledWith("/slips/s1/confirm", { method: "POST" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["slips"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["orders"] });
    spy.mockClear();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("409"));
    await act(async () => {
      await result.current.mutateAsync("s1").catch(() => undefined);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["slips"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["orders"] });
  });
});
