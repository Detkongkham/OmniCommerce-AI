import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { useCreateOrder, useCustomers, useOrder, useOrderAction, useOrders } from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

// ໃຊ້ block {} ເພື່ອບໍ່ໃຫ້ return mock (vitest ຖືວ່າເປັນ teardown ແລ້ວເອີ້ນມັນຫຼັງ test)
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("order hooks", () => {
  it("useOrders ສົ່ງ filter ເປັນ query (ຂ້າມຄ່າຫວ່າງ; ວັນທີເປັນ date-only)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    const { Wrapper } = wrapper();
    renderHook(() => useOrders({ q: "SO-1", status: "PAID", from: "2026-10-01", to: "", page: 1, pageSize: 10 }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/orders?q=SO-1&status=PAID&from=2026-10-01&page=1&pageSize=10"));
  });

  it("useOrders ສົ່ງ conversationId ເປັນ query (ບິນຂອງເຄສ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    const { Wrapper } = wrapper();
    renderHook(() => useOrders({ conversationId: "c1", page: 1, pageSize: 20 }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/orders?conversationId=c1&page=1&pageSize=20"));
  });

  it("useOrder poll ທຸກ 15 ວິ ເມື່ອ PENDING_PAYMENT ແລະ secondsUntilExpiry = 0 ເທົ່ານັ້ນ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ status: "PENDING_PAYMENT", secondsUntilExpiry: 0 });
    const { client, Wrapper } = wrapper();
    renderHook(() => useOrder("o1"), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/orders/o1"));
    const query = client.getQueryCache().find({ queryKey: ["orders", "detail", "o1"] });
    const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval as (q: unknown) => number | false;
    expect(interval({ state: { data: { status: "PENDING_PAYMENT", secondsUntilExpiry: 0 } } })).toBe(15_000);
    expect(interval({ state: { data: { status: "PENDING_PAYMENT", secondsUntilExpiry: 120 } } })).toBe(false);
    expect(interval({ state: { data: { status: "PAID", secondsUntilExpiry: null } } })).toBe(false);
    expect(interval({ state: { data: undefined } })).toBe(false);
  });

  it("useOrderAction: pay/pack/ship/complete ບໍ່ມີ body; cancel ສົ່ງ { reason }; invalidate orders/stock/products/variants", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useOrderAction(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ id: "o1", action: "pay" }));
    await act(() => result.current.mutateAsync({ id: "o1", action: "cancel", reason: "dup" }));
    await act(() => result.current.mutateAsync({ id: "o1", action: "cancel" }));
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/pay", { method: "POST" });
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/cancel", { method: "POST", body: { reason: "dup" } });
    expect(apiFetch).toHaveBeenCalledWith("/orders/o1/cancel", { method: "POST", body: {} });
    for (const key of ["orders", "stock", "products", "variants"]) expect(spy).toHaveBeenCalledWith({ queryKey: [key] });
  });

  it("useOrderAction ທີ່ລົ້ມ (ເຊັ່ນ ORDER_INVALID_STATE) ກໍ່ invalidate orders ເພື່ອ refetch ສະຖານະຫຼ້າສຸດ", async () => {
    vi.mocked(apiFetch).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("conflict")), 0)),
    );
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useOrderAction(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: "o1", action: "pay" });
      } catch {
        // ຄາດໄວ້ວ່າລົ້ມ
      }
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["orders"] });
  });

  it("useCreateOrder POST /orders; useCustomers ບໍ່ຍິງເມື່ອ q ເປົ່າ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "o1" });
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const create = renderHook(() => useCreateOrder(), { wrapper: Wrapper });
    const input = { items: [{ variantId: "v", quantity: 1, discount: "0" }], shippingFee: "0" };
    await act(() => create.result.current.mutateAsync({ input, idempotencyKey: "key-1" }));
    // ສົ່ງ Idempotency-Key ເປັນ header ແລະ body ເປັນ input ລ້ວນ
    expect(apiFetch).toHaveBeenCalledWith("/orders", { method: "POST", body: input, headers: { "Idempotency-Key": "key-1" } });
    // ບິນໃໝ່ອາດສ້າງລູກຄ້າໃໝ່ → ລາຍການລູກຄ້າຕ້ອງຖືກ invalidate ນຳ
    for (const key of ["orders", "stock", "products", "variants", "customers"]) expect(spy).toHaveBeenCalledWith({ queryKey: [key] });

    vi.mocked(apiFetch).mockClear();
    renderHook(() => useCustomers({ q: "" }), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
    renderHook(() => useCustomers({ q: "020" }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/customers?q=020&page=1&pageSize=8"));
  });
});
