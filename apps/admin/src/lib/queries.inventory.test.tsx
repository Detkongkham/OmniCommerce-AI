import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";
import {
  useCategories,
  useCreateWarehouse,
  useDeleteCategory,
  useSaveCategory,
  useSetDefaultWarehouse,
  useStoreSettings,
  useUpdateStoreSettings,
  useUpdateWarehouse,
  useWarehouses,
} from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

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
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateStoreSettings(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ vatRate: "7" }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["store-settings"] });
    expect(apiFetch).toHaveBeenCalledWith("/settings/store", { method: "PATCH", body: { vatRate: "7" } });
  });
});

describe("inventory mutation hooks", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cases: { name: string; hook: () => any; vars: unknown; path: string; opts: unknown; key: string }[] = [
    {
      name: "useCreateWarehouse",
      hook: useCreateWarehouse,
      vars: { code: "W2", name: "Second" },
      path: "/warehouses",
      opts: { method: "POST", body: { code: "W2", name: "Second" } },
      key: "warehouses",
    },
    {
      name: "useUpdateWarehouse",
      hook: useUpdateWarehouse,
      vars: { id: "w1", input: { name: "New" } },
      path: "/warehouses/w1",
      opts: { method: "PATCH", body: { name: "New" } },
      key: "warehouses",
    },
    {
      name: "useSaveCategory (create)",
      hook: useSaveCategory,
      vars: { input: { name: "Drinks" } },
      path: "/categories",
      opts: { method: "POST", body: { name: "Drinks" } },
      key: "categories",
    },
    {
      name: "useSaveCategory (update)",
      hook: useSaveCategory,
      vars: { id: "c1", input: { name: "Food" } },
      path: "/categories/c1",
      opts: { method: "PATCH", body: { name: "Food" } },
      key: "categories",
    },
    {
      name: "useDeleteCategory",
      hook: useDeleteCategory,
      vars: "c1",
      path: "/categories/c1",
      opts: { method: "DELETE" },
      key: "categories",
    },
  ];

  it.each(cases)("$name ເອີ້ນ endpoint ທີ່ຖືກ ແລະ invalidate", async ({ hook, vars, path, opts, key }) => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => hook(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync(vars));
    expect(apiFetch).toHaveBeenCalledWith(path, opts);
    expect(spy).toHaveBeenCalledWith({ queryKey: [key] });
  });

  it("error: reject, ຕັ້ງ error, ບໍ່ invalidate", async () => {
    const error = new ApiError(409, "x", [], "CATEGORY_IN_USE");
    vi.mocked(apiFetch).mockRejectedValue(error);
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteCategory(), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync("c1")).rejects.toBe(error);
    });
    await waitFor(() => expect(result.current.error).toBe(error));
    expect(spy).not.toHaveBeenCalled();
  });
});
