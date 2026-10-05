import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";
import {
  useAddVariant,
  useCreateProduct,
  useDeleteProduct,
  useProduct,
  useProducts,
  usePutImages,
  useUpdateProduct,
  useUpdateVariant,
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

describe("product query hooks", () => {
  it("useProducts ສົ່ງ query string ໂດຍຂ້າມຄ່າຫວ່າງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    const { Wrapper } = wrapper();
    renderHook(() => useProducts({ q: "cup", status: "", categoryId: "", page: 2, pageSize: 10 }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products?q=cup&page=2&pageSize=10"));
  });

  it("useProduct ເອີ້ນ /products/:id", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { Wrapper } = wrapper();
    renderHook(() => useProduct("p1"), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products/p1"));
  });
});

describe("product mutation hooks", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cases: { name: string; hook: () => any; vars: unknown; path: string; opts: unknown; keys: string[] }[] = [
    {
      name: "useCreateProduct",
      hook: useCreateProduct,
      vars: { name: "Cup" },
      path: "/products",
      opts: { method: "POST", body: { name: "Cup" } },
      keys: ["products", "categories"],
    },
    {
      name: "useUpdateProduct",
      hook: useUpdateProduct,
      vars: { id: "p1", input: { status: "ACTIVE" } },
      path: "/products/p1",
      opts: { method: "PATCH", body: { status: "ACTIVE" } },
      keys: ["products", "categories"],
    },
    {
      name: "useDeleteProduct",
      hook: useDeleteProduct,
      vars: "p1",
      path: "/products/p1",
      opts: { method: "DELETE" },
      keys: ["products", "categories"],
    },
    {
      name: "useAddVariant",
      hook: useAddVariant,
      vars: { productId: "p1", input: { sku: "A", price: "1" } },
      path: "/products/p1/variants",
      opts: { method: "POST", body: { sku: "A", price: "1" } },
      keys: ["products"],
    },
    {
      name: "useUpdateVariant",
      hook: useUpdateVariant,
      vars: { id: "v1", input: { price: "2" } },
      path: "/variants/v1",
      opts: { method: "PATCH", body: { price: "2" } },
      keys: ["products"],
    },
    {
      name: "usePutImages",
      hook: usePutImages,
      vars: { id: "p1", input: { images: [] } },
      path: "/products/p1/images",
      opts: { method: "PUT", body: { images: [] } },
      keys: ["products"],
    },
  ];

  it.each(cases)("$name ເອີ້ນ endpoint ທີ່ຖືກ ແລະ invalidate", async ({ hook, vars, path, opts, keys }) => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => hook(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync(vars));
    expect(apiFetch).toHaveBeenCalledWith(path, opts);
    expect(spy.mock.calls.map((call) => call[0]?.queryKey)).toEqual(keys.map((key) => [key]));
  });

  it.each(cases)("$name: reject ແລ້ວບໍ່ invalidate", async ({ hook, vars }) => {
    const error = new ApiError(409, "x", [], "PRODUCT_HAS_STOCK_HISTORY");
    vi.mocked(apiFetch).mockRejectedValue(error);
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => hook(), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(vars)).rejects.toBe(error);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("useDeleteProduct ຄືນ { archived: true } (200) ແລະ undefined (204)", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useDeleteProduct(), { wrapper: Wrapper });
    vi.mocked(apiFetch).mockResolvedValueOnce({ archived: true });
    expect(await act(() => result.current.mutateAsync("p1"))).toEqual({ archived: true });
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);
    expect(await act(() => result.current.mutateAsync("p2"))).toBeUndefined();
    expect(apiFetch).toHaveBeenCalledWith("/products/p2", { method: "DELETE" });
  });
});
