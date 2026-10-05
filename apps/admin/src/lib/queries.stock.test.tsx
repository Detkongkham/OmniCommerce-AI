import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { useSetThreshold, useStockLevels, useStockMovements, useStockOperation, useVariantSearch } from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("stock hooks", () => {
  it("useStockLevels / useStockMovements ສົ່ງ query string (ຂ້າມຄ່າຫວ່າງ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    const { Wrapper } = wrapper();
    renderHook(() => useStockLevels({ q: "tee", warehouseId: "", lowStock: true, page: 1, pageSize: 10 }), { wrapper: Wrapper });
    renderHook(() => useStockMovements({ type: "RECEIVE", from: "2026-10-01", to: "", variantId: "", page: 2, pageSize: 30 }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(apiFetch).mock.calls.map((call) => call[0]);
    expect(calls).toContain("/stock?q=tee&lowStock=true&page=1&pageSize=10");
    expect(calls).toContain("/stock/movements?type=RECEIVE&from=2026-10-01&page=2&pageSize=30");
  });

  it("useVariantSearch ບໍ່ຍິງເມື່ອ q ເປົ່າ; ຍິງ /variants?q=...&includeInactive=true ເມື່ອມີ q", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 8 });
    const { Wrapper } = wrapper();
    renderHook(() => useVariantSearch({ q: "", includeInactive: true }), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
    renderHook(() => useVariantSearch({ q: "tee", includeInactive: true }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/variants?q=tee&includeInactive=true&page=1&pageSize=8"));
  });

  it("useStockOperation POST /stock/:mode ແລ້ວ invalidate stock/products/variants", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useStockOperation(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ mode: "receive", input: { variantId: "v", warehouseId: "w", quantity: 3 } }));
    expect(apiFetch).toHaveBeenCalledWith("/stock/receive", { method: "POST", body: { variantId: "v", warehouseId: "w", quantity: 3 } });
    for (const key of ["stock", "products", "variants"]) expect(spy).toHaveBeenCalledWith({ queryKey: [key] });
  });

  it("useSetThreshold PATCH /stock/:id/threshold", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSetThreshold(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ id: "s1", lowStockThreshold: null }));
    expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", { method: "PATCH", body: { lowStockThreshold: null } });
  });
});
