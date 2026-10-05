import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { useCategories, useSetDefaultWarehouse, useStoreSettings, useUpdateStoreSettings, useWarehouses } from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("inventory query hooks", () => {
  it("useWarehouses / useCategories / useStoreSettings ເອີ້ນ endpoint ທີ່ຖືກ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    const { Wrapper } = wrapper();
    renderHook(() => useWarehouses(), { wrapper: Wrapper });
    renderHook(() => useCategories(), { wrapper: Wrapper });
    renderHook(() => useStoreSettings(), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    expect(vi.mocked(apiFetch).mock.calls.map((call) => call[0]).sort()).toEqual([
      "/categories",
      "/settings/store",
      "/warehouses",
    ]);
  });

  it("setDefault ເອີ້ນ POST /warehouses/:id/default ແລ້ວ invalidate ລາຍການສາງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSetDefaultWarehouse(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync("w1"));
    expect(apiFetch).toHaveBeenCalledWith("/warehouses/w1/default", { method: "POST" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["warehouses"] });
  });

  it("updateStoreSettings ເອີ້ນ PATCH /settings/store", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useUpdateStoreSettings(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ vatRate: "7" }));
    expect(apiFetch).toHaveBeenCalledWith("/settings/store", { method: "PATCH", body: { vatRate: "7" } });
  });
});
