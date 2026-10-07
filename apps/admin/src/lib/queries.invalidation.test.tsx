import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";
import {
  useAddVariant,
  useDeleteCategory,
  useDeleteProduct,
  usePutImages,
  useSaveCategory,
  useSetDefaultWarehouse,
  useSetThreshold,
  useStockOperation,
  useUpdateProduct,
  useUpdateVariant,
  useUpdateWarehouse,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: { name: string; hook: () => any; vars: unknown; keys: string[] }[] = [
  { name: "useAddVariant", hook: useAddVariant, vars: { productId: "p1", input: {} }, keys: ["products", "stock", "variants"] },
  { name: "useUpdateVariant", hook: useUpdateVariant, vars: { id: "v1", input: {} }, keys: ["products", "stock", "variants"] },
  { name: "useUpdateProduct", hook: useUpdateProduct, vars: { id: "p1", input: {} }, keys: ["categories", "products", "stock", "variants"] },
  { name: "useDeleteProduct", hook: useDeleteProduct, vars: "p1", keys: ["categories", "products", "stock", "variants"] },
  { name: "usePutImages", hook: usePutImages, vars: { id: "p1", input: {} }, keys: ["products", "stock", "variants"] },
  { name: "useUpdateWarehouse", hook: useUpdateWarehouse, vars: { id: "w1", input: {} }, keys: ["stock", "variants", "warehouses"] },
  { name: "useSetDefaultWarehouse", hook: useSetDefaultWarehouse, vars: "w1", keys: ["stock", "variants", "warehouses"] },
  { name: "useSaveCategory", hook: useSaveCategory, vars: { id: "c1", input: {} }, keys: ["categories", "products"] },
  { name: "useDeleteCategory", hook: useDeleteCategory, vars: "c1", keys: ["categories", "products"] },
];

describe("ຊຸດ query key ທີ່ຖືກ invalidate ຫຼັງ mutation ສຳເລັດ", () => {
  for (const { name, hook, vars, keys } of cases) {
    it(`${name} invalidate ${keys.join(", ")}`, async () => {
      vi.mocked(apiFetch).mockResolvedValue({});
      const { client, Wrapper } = wrapper();
      const spy = vi.spyOn(client, "invalidateQueries");
      const { result } = renderHook(() => hook(), { wrapper: Wrapper });
      await act(() => result.current.mutateAsync(vars));
      expect(spy.mock.calls.map((call) => String((call[0] as { queryKey: string[] }).queryKey[0])).sort()).toEqual(keys);
    });
  }
});

describe("mutation ສະຕ໋ອກທີ່ລົ້ມ ກໍ່ invalidate (ເຊັ່ນ 409 INSUFFICIENT_STOCK ຕ້ອງ refresh ຕົວເລກເກົ່າ)", () => {
  it("useStockOperation: onError invalidate stock/products/variants", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "x", [], "INSUFFICIENT_STOCK"));
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useStockOperation(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ mode: "adjust", input: { variantId: "v1", warehouseId: "w1", delta: -1, reason: "x" } as never }).catch(() => undefined));
    expect(spy.mock.calls.map((call) => String((call[0] as { queryKey: string[] }).queryKey[0])).sort()).toEqual(["products", "stock", "variants"]);
  });

  it("useSetThreshold: onError invalidate stock", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "x", [], "CONFLICT"));
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSetThreshold(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ id: "s1", lowStockThreshold: 3 }).catch(() => undefined));
    expect(spy.mock.calls.map((call) => (call[0] as { queryKey: string[] }).queryKey[0])).toEqual(["stock"]);
  });
});
