# Phase 1-A5: Admin UI ສິນຄ້າ (`/products`, `/products/new`, `/products/[id]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ໜ້າຈັດການສິນຄ້າຄົບ: ລາຍການ (ຄົ້ນຫາ/ກັ່ນຕອງ/ແບ່ງໜ້າ), ສ້າງສິນຄ້າພ້ອມ option → variant ແບບ cartesian ແລະ ຮູບ, ແກ້ໄຂສິນຄ້າ/variant/ຮູບ, ເບິ່ງສະຕ໋ອກຕໍ່ສາງ, ລຶບ ຫຼື archive.

**Architecture:** ໂຕສ້າງ options/variants/images ມີຄວາມຊັບຊ້ອນສູງ ຈຶ່ງແຍກ logic ບໍລິສຸດ (`variant-matrix.ts`, `product-form.ts`) ອອກຈາກ component ເພື່ອ test ງ່າຍ; ສ່ວນ UI ເປັນ component ຄວບຄຸມຈາກພາຍນອກ (`OptionEditor`, `VariantGrid`, `ImageListEditor`) ທີ່ໃຊ້ຮ່ວມກັນລະຫວ່າງຟອມສ້າງ ແລະ ໜ້າແກ້ໄຂ. ຟອມສ້າງເກັບ state ເອງ ແລ້ວ validate ທັງກ້ອນດ້ວຍ `createProductSchema` ຂອງ `@oca/shared` ຕອນ submit (ແຫຼ່ງກົດດຽວກັບ API). ຕົ້ນທຶນສະແດງ/ຕັ້ງຕາມສິດ `costs:read` / `costs:write` (API ລຶບ `costPrice` ອອກຈາກ response ເມື່ອບໍ່ມີ `costs:read`).

**Tech Stack:** ຄືກັບ Plan A4.

**ອ້າງອີງ:** spec [Phase 1-A §5, §6, §6.1, §10](../specs/2026-10-04-phase1-a-inventory-design.md); [DESIGN.md](../../DESIGN.md) ຊະນະເມື່ອຂັດ.

**ກ່ອນເລີ່ມ:** Plan A4 (`2026-10-05-phase1-a4-ui-foundation.md`) ຕ້ອງສຳເລັດແລ້ວ (ໃຊ້ `ServerPager`, `toQueryString`, `formatMoney`, `formatQuantity`, `useDebounced`, `flattenCategories`, `errorMessage` ຈາກ `code`, hooks `useCategories`/`useWarehouses`). ອ່ານ "ຂໍ້ຕົກລົງສຳຄັນ" ຂອງ A4 (branch, commit trailer, ຫ້າມ `git add -A`, ວິທີເພີ່ມ key ໃນ dictionary, ຫ້າມແຕະ 5432/6379) — ໃຊ້ກັບ plan ນີ້ທຸກຂໍ້.

## ຂໍ້ຕົກລົງສະເພາະ plan ນີ້

* **ສັນຍາ API ທີ່ໃຊ້:** `GET /products?q&status&categoryId&page&pageSize` → `Page<ProductListItemDto>`; `GET /products/:id` → `ProductDetailDto` (variants ມີ `stock[]`, `costPrice` ຫາຍເມື່ອບໍ່ມີ `costs:read`); `POST /products`; `PATCH /products/:id`; `DELETE /products/:id` (**204** = ລຶບແທ້, **200 `{archived:true}`** = ຖືກ archive ແທນ, **409 `PRODUCT_HAS_STOCK_HISTORY`**); `POST /products/:id/variants`; `PATCH /variants/:id`; `PUT /products/:id/images`.
* **ຕົ້ນທຶນ:** ຄອລຳຕົ້ນທຶນສະແດງເມື່ອ `useCan("costs:read")`; ຊ່ອງແກ້ໄຂໄດ້ເມື່ອ `useCan("costs:write")`. ຜູ້ທີ່ບໍ່ມີ `costs:write` **ຫ້າມສົ່ງ `costPrice`** (API ຕອບ `403` ຖ້າບໍ່ແມ່ນ "0"/ບໍ່ສົ່ງ) — `toCreateProductInput` ຮັບ flag `canSetCost`.
* **ຈຳກັດ options:** ສູງສຸດ 3 option, 100 variant (ກົງກັບ schema). ເກີນ 100 ສະແດງຄຳເຕືອນ ແລະບໍ່ສ້າງແຖວໃໝ່.
* **Options ແກ້ບໍ່ໄດ້ຫຼັງສ້າງ** (spec §5): ໜ້າແກ້ໄຂສະແດງ read-only ພ້ອມຄຳອະທິບາຍ.
* **ຟອມສ້າງສະແດງ error ຈາກ schema ເປັນລາຍການ** (`variants.2.price: ...`) ເພາະໂຄງສ້າງຊ້ອນ; ຂໍ້ຄວາມຈາກ schema ເປັນພາສາລາວຢູ່ແລ້ວ. ບໍ່ເຮັດ error ຕໍ່ cell ໃນ plan ນີ້.
* **ຮູບ:** ໃສ່ URL ດ້ວຍມື (http/https), ມີ preview ດ້ວຍ `<img>` ທຳມະດາ (ບໍ່ໃຊ້ `next/image` ເພາະ host ບໍ່ຮູ້ລ່ວງໜ້າ).
* **ລິ້ງໄປສະຕ໋ອກ:** ໜ້າແກ້ໄຂມີລິ້ງ `/stock?q=<SKU>` (Plan A6 ຮອງຮັບ `?q=` ເປັນຄ່າເລີ່ມຕົ້ນຂອງຊ່ອງຄົ້ນຫາ).

## ໂຄງສ້າງໄຟລ໌

```
apps/admin/src/
  lib/types.ts                       [ແກ້] ProductListItemDto, ProductDetailDto, VariantDto, VariantSearchItemDto
  lib/queries.ts                     [ແກ້] useProducts/useProduct/useCreateProduct/useUpdateProduct/useDeleteProduct/useAddVariant/useUpdateVariant/usePutImages
  lib/variant-matrix.ts (+test)      [ໃໝ່] cartesian ຂອງ option → ແຖວ variant, ຮັກສາແຖວທີ່ແກ້ແລ້ວ, ແນະນຳ SKU
  lib/product-form.ts (+test)        [ໃໝ່] state ຂອງຟອມ → payload ຂອງ createProductSchema, ແປງ issue ເປັນຂໍ້ຄວາມ
  lib/nav.ts (+test)                 [ແກ້] ເພີ່ມ /products ຕົ້ນກຸ່ມສະຕ໊ອກ
  components/products/product-status.tsx            [ໃໝ່] pill ສະຖານະ
  components/products/option-editor.tsx (+test)      [ໃໝ່]
  components/products/variant-grid.tsx (+test)       [ໃໝ່] ຕາຕະລາງ variant ຕອນສ້າງ
  components/products/image-list-editor.tsx (+test)  [ໃໝ່]
  components/products/product-list.tsx (+test)       [ໃໝ່]
  components/products/product-create-form.tsx (+test) [ໃໝ່]
  components/products/product-detail.tsx (+test)     [ໃໝ່] + add-variant-dialog.tsx
  app/(app)/products/page.tsx, new/page.tsx, [id]/page.tsx   [ໃໝ່]
```

---

### Task 1: ປະເພດ DTO ແລະ query hooks ຂອງສິນຄ້າ

**Files:**
- Modify: `apps/admin/src/lib/types.ts`, `apps/admin/src/lib/queries.ts`
- Create: `apps/admin/src/lib/queries.products.test.tsx`

- [ ] **Step 1: ເພີ່ມປະເພດ** ຕໍ່ທ້າຍ `apps/admin/src/lib/types.ts`:

```ts
import type { ProductStatus } from "@oca/shared";

export interface ProductListItemDto {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  category: { id: string; name: string } | null;
  imageUrl: string | null;
  variantCount: number;
  priceMin: string | null;
  priceMax: string | null;
  availableTotal: number;
}

export interface StockCellDto {
  warehouseId: string;
  onHand: number;
  reserved: number;
  available: number;
}

export interface VariantDto {
  id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  price: string;
  compareAtPrice: string | null;
  /** ບໍ່ມີເມື່ອຜູ້ໃຊ້ບໍ່ມີ costs:read */
  costPrice?: string;
  weightGrams: number | null;
  isActive: boolean;
  optionValues: Record<string, string>;
  stock: StockCellDto[];
}

export interface ProductDetailDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  categoryId: string | null;
  options: { id: string; name: string; position: number; values: { id: string; value: string; position: number }[] }[];
  variants: VariantDto[];
  images: { id: string; url: string; alt: string | null; position: number; variantId: string | null }[];
}

/** ຜົນຂອງ GET /variants (ຄົ້ນຫາ variant ພ້ອມລາຄາ ແລະ ສະຕ໋ອກ) */
export interface VariantSearchItemDto {
  id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  productId: string;
  productName: string;
  productStatus: ProductStatus;
  imageUrl: string | null;
  price: string;
  costPrice?: string;
  isActive: boolean;
  availableTotal: number;
  stock: StockCellDto[];
}
```

ຖ້າໄຟລ໌ມີ `import` ຢູ່ເທິງແລ້ວ ໃຫ້ຍ້າຍບັນທັດ `import type { ProductStatus } ...` ໄປລວມກັບ import ເທິງສຸດ (`import type { Permission, ProductStatus } from "@oca/shared";`).

- [ ] **Step 2: ຂຽນ test ທີ່ຈະລົ້ມ** `apps/admin/src/lib/queries.products.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { useAddVariant, useDeleteProduct, useProduct, useProducts, usePutImages, useUpdateVariant } from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("product hooks", () => {
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

  it("useDeleteProduct ຄືນ archived ເມື່ອ API ຕອບ { archived: true } ແລະ undefined ເມື່ອ 204", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useDeleteProduct(), { wrapper: Wrapper });
    vi.mocked(apiFetch).mockResolvedValueOnce({ archived: true });
    expect(await act(() => result.current.mutateAsync("p1"))).toEqual({ archived: true });
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);
    expect(await act(() => result.current.mutateAsync("p2"))).toBeUndefined();
    expect(apiFetch).toHaveBeenCalledWith("/products/p2", { method: "DELETE" });
  });

  it("addVariant / updateVariant / putImages ໃຊ້ method ແລະ path ທີ່ຖືກ ແລະ invalidate products", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const add = renderHook(() => useAddVariant(), { wrapper: Wrapper });
    const upd = renderHook(() => useUpdateVariant(), { wrapper: Wrapper });
    const img = renderHook(() => usePutImages(), { wrapper: Wrapper });
    await act(() => add.result.current.mutateAsync({ productId: "p1", input: { sku: "A", price: "1" } as never }));
    await act(() => upd.result.current.mutateAsync({ id: "v1", input: { price: "2" } }));
    await act(() => img.result.current.mutateAsync({ id: "p1", input: { images: [] } }));
    expect(apiFetch).toHaveBeenCalledWith("/products/p1/variants", { method: "POST", body: { sku: "A", price: "1" } });
    expect(apiFetch).toHaveBeenCalledWith("/variants/v1", { method: "PATCH", body: { price: "2" } });
    expect(apiFetch).toHaveBeenCalledWith("/products/p1/images", { method: "PUT", body: { images: [] } });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["products"] });
  });
});
```

- [ ] **Step 3: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/queries.products.test.tsx`
Expected: FAIL (hook ບໍ່ມີ).

- [ ] **Step 4: ແກ້ `apps/admin/src/lib/queries.ts`**

ເພີ່ມ import (ລວມເຂົ້າ import ເດີມ): `CreateProductInput, PutProductImagesInput, UpdateProductInput, UpdateVariantInput, VariantInput` ຈາກ `@oca/shared`; `keepPreviousData` ຈາກ `@tanstack/react-query`; `toQueryString` ຈາກ `./query-string`; `Page, ProductDetailDto, ProductListItemDto, VariantDto` ຈາກ `./types`. ເພີ່ມໃນ `queryKeys`: `products: ["products"] as const,`. ຕໍ່ທ້າຍໄຟລ໌:

```ts
// ---------------------------------------------------------------------------
// ສິນຄ້າ
// ---------------------------------------------------------------------------
export interface ProductListParams {
  q?: string;
  status?: string;
  categoryId?: string;
  page: number;
  pageSize: number;
}

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: [...queryKeys.products, "list", params],
    queryFn: () => apiFetch<Page<ProductListItemDto>>(`/products${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: [...queryKeys.products, "detail", id],
    queryFn: () => apiFetch<ProductDetailDto>(`/products/${id}`),
  });
}

export function useCreateProduct() {
  const invalidate = useInvalidate(queryKeys.products, queryKeys.categories);
  return useMutation({
    mutationFn: (input: CreateProductInput) => apiFetch<ProductDetailDto>("/products", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidate(queryKeys.products, queryKeys.categories);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      apiFetch<ProductDetailDto>(`/products/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

/** 204 → undefined (ລຶບແທ້); 200 → { archived: true } (ຖືກ archive ເພາະເຄີຍຖືກຂາຍ) */
export function useDeleteProduct() {
  const invalidate = useInvalidate(queryKeys.products, queryKeys.categories);
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ archived: true } | undefined>(`/products/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useAddVariant() {
  const invalidate = useInvalidate(queryKeys.products);
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: VariantInput }) =>
      apiFetch<VariantDto>(`/products/${productId}/variants`, { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateVariant() {
  const invalidate = useInvalidate(queryKeys.products);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateVariantInput }) =>
      apiFetch<VariantDto>(`/variants/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function usePutImages() {
  const invalidate = useInvalidate(queryKeys.products);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PutProductImagesInput }) =>
      apiFetch<ProductDetailDto>(`/products/${id}/images`, { method: "PUT", body: input }),
    onSuccess: invalidate,
  });
}
```

ໝາຍເຫດ: `toQueryString({ ...params })` ຮັບ `Record<string, QueryValue>`; `ProductListParams` ຕົງກັບ type ນັ້ນ. ຖ້າ TS ຮ້ອງ index signature ໃຫ້ປະກາດ `toQueryString(params as Record<string, string | number | undefined>)`.

- [ ] **Step 5: ຣັນໃຫ້ຜ່ານ + typecheck**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/queries.products.test.tsx && pnpm --filter @oca/admin typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/types.ts apps/admin/src/lib/queries.ts apps/admin/src/lib/queries.products.test.tsx
git commit -m "feat(admin): product DTOs and query hooks" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/types.ts apps/admin/src/lib/queries.ts apps/admin/src/lib/queries.products.test.tsx
```

---

### Task 2: `variant-matrix.ts` (cartesian + ຮັກສາແຖວທີ່ແກ້ແລ້ວ)

**Files:** Create `apps/admin/src/lib/variant-matrix.ts`, `variant-matrix.test.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_VARIANTS,
  type OptionDraft,
  type VariantDraft,
  activeOptions,
  combinations,
  countCombinations,
  suggestSku,
  syncVariants,
} from "./variant-matrix";

const color: OptionDraft = { name: "Color", values: ["Red", "Blue"] };
const size: OptionDraft = { name: "Size", values: ["S", "M", "L"] };

describe("activeOptions", () => {
  it("ຕັດ option ທີ່ຊື່ເປົ່າ/ບໍ່ມີຄ່າ, trim ແລະ ລຶບຄ່າຊ້ຳ", () => {
    expect(
      activeOptions([
        { name: " Color ", values: ["Red", " Red ", "", "Blue"] },
        { name: "", values: ["x"] },
        { name: "Size", values: [] },
      ]),
    ).toEqual([{ name: "Color", values: ["Red", "Blue"] }]);
  });
});

describe("combinations / countCombinations", () => {
  it("ບໍ່ມີ option → 1 ແຖວວ່າງ (ສິນຄ້າທີ່ມີ variant ດຽວ)", () => {
    expect(combinations([])).toEqual([{}]);
    expect(countCombinations([])).toBe(1);
  });
  it("cartesian ຕາມລຳດັບ option", () => {
    expect(combinations([color, size])).toHaveLength(6);
    expect(combinations([color, size])[0]).toEqual({ Color: "Red", Size: "S" });
    expect(combinations([color, size])[5]).toEqual({ Color: "Blue", Size: "L" });
    expect(countCombinations([color, size])).toBe(6);
  });
});

describe("suggestSku", () => {
  it("prefix + ຄ່າ ທີ່ເຫຼືອສະເພາະ A-Z a-z 0-9 . _ -", () => {
    expect(suggestSku("TEE", ["Red", "S"], 1)).toBe("TEE-Red-S");
    expect(suggestSku("T shirt", ["Dark Blue", "XL"], 1)).toBe("Tshirt-DarkBlue-XL");
  });
  it("ຄ່າທີ່ເປັນຕົວອັກສອນລາວ (ຖືກລຶບໝົດ) → ໃຊ້ prefix + ເລກລຳດັບ", () => {
    expect(suggestSku("TEE", ["ແດງ", "S"], 3)).toBe("TEE-3");
    expect(suggestSku("", ["ແດງ"], 2)).toBe("2");
  });
  it("ບໍ່ມີຄ່າ (ບໍ່ມີ option) → prefix ເທົ່ານັ້ນ", () => {
    expect(suggestSku("TEE", [], 1)).toBe("TEE");
  });
});

describe("syncVariants", () => {
  it("ສ້າງແຖວຈາກ cartesian ໂດຍເອົາລາຄາ/ຕົ້ນທຶນຈາກແຖວທຳອິດເດີມ", () => {
    const first: VariantDraft = {
      key: "[]",
      sku: "TEE",
      barcode: "",
      price: "100",
      costPrice: "60",
      isActive: true,
      optionValues: {},
    };
    const rows = syncVariants([color], [first], "TEE");
    expect(rows.map((row) => row.optionValues)).toEqual([{ Color: "Red" }, { Color: "Blue" }]);
    expect(rows.map((row) => row.sku)).toEqual(["TEE-Red", "TEE-Blue"]);
    expect(rows.every((row) => row.price === "100" && row.costPrice === "60" && row.isActive)).toBe(true);
  });

  it("ແຖວທີ່ແກ້ແລ້ວ ແລະ ຍັງຢູ່ໃນ cartesian ຖືກຮັກສາໄວ້; ແຖວທີ່ຄ່າຫາຍຖືກລຶບ", () => {
    const rows1 = syncVariants([color], [], "TEE");
    const edited = rows1.map((row) => (row.optionValues.Color === "Red" ? { ...row, sku: "MY-RED", price: "250" } : row));
    const rows2 = syncVariants([{ name: "Color", values: ["Red", "Green"] }], edited, "TEE");
    expect(rows2.map((row) => row.optionValues.Color)).toEqual(["Red", "Green"]);
    expect(rows2[0]).toMatchObject({ sku: "MY-RED", price: "250" });
    expect(rows2[1]?.sku).toBe("TEE-Green");
  });

  it("ເກີນ MAX_VARIANTS: ຄືນລາຍການເດີມ ບໍ່ສ້າງໃໝ່", () => {
    const big: OptionDraft[] = [
      { name: "A", values: Array.from({ length: 10 }, (_, i) => `a${i}`) },
      { name: "B", values: Array.from({ length: 11 }, (_, i) => `b${i}`) },
    ];
    expect(countCombinations(big)).toBe(110);
    expect(MAX_VARIANTS).toBe(100);
    const previous = syncVariants([color], [], "T");
    expect(syncVariants(big, previous, "T")).toBe(previous);
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — `pnpm --filter @oca/admin exec vitest run src/lib/variant-matrix.test.ts` → FAIL.

- [ ] **Step 3: ຂຽນ `variant-matrix.ts`**

```ts
/** ສູງສຸດຕາມ schema ຂອງ API (spec §5) */
export const MAX_VARIANTS = 100;
export const MAX_OPTIONS = 3;

export interface OptionDraft {
  name: string;
  values: string[];
}

export interface VariantDraft {
  /** ກຸນແຈຂອງຊຸດຄ່າ option (ໃຊ້ຈຳແຖວເມື່ອ option ປ່ຽນ) */
  key: string;
  sku: string;
  barcode: string;
  price: string;
  costPrice: string;
  isActive: boolean;
  optionValues: Record<string, string>;
}

/** option ທີ່ໃຊ້ໄດ້ຈິງ: ຊື່ບໍ່ເປົ່າ ແລະ ມີຄ່າ ≥ 1 (trim + ຕັດຄ່າຊ້ຳ) */
export function activeOptions(options: readonly OptionDraft[]): OptionDraft[] {
  return options
    .map((option) => ({
      name: option.name.trim(),
      values: [...new Set(option.values.map((value) => value.trim()).filter((value) => value !== ""))],
    }))
    .filter((option) => option.name !== "" && option.values.length > 0);
}

export function countCombinations(options: readonly OptionDraft[]): number {
  return activeOptions(options).reduce((total, option) => total * option.values.length, 1);
}

/** cartesian product ຕາມລຳດັບ option; ບໍ່ມີ option = [{}] (1 variant) */
export function combinations(options: readonly OptionDraft[]): Record<string, string>[] {
  return activeOptions(options).reduce<Record<string, string>[]>(
    (rows, option) => rows.flatMap((row) => option.values.map((value) => ({ ...row, [option.name]: value }))),
    [{}],
  );
}

export function comboKey(options: readonly OptionDraft[], optionValues: Record<string, string>): string {
  return JSON.stringify(activeOptions(options).map((option) => optionValues[option.name] ?? ""));
}

const cleanSku = (text: string) => text.replace(/[^A-Za-z0-9._-]+/g, "");

/** SKU ແນະນຳ; ຖ້າຄ່າໃດຫາຍໝົດຫຼັງກັ່ນ (ຕົວອັກສອນລາວ) ໃຊ້ prefix + ເລກລຳດັບ ເພື່ອບໍ່ໃຫ້ຊ້ຳ/ເປົ່າ */
export function suggestSku(prefix: string, values: readonly string[], ordinal: number): string {
  const head = cleanSku(prefix);
  if (values.length === 0) return head;
  const parts = values.map(cleanSku);
  if (parts.some((part) => part === "")) return [head, String(ordinal)].filter(Boolean).join("-");
  return [head, ...parts].filter(Boolean).join("-");
}

/**
 * ສ້າງແຖວ variant ຈາກ options ປັດຈຸບັນ: ແຖວທີ່ຊຸດຄ່າຍັງຢູ່ຖືກຮັກສາ (ລວມສິ່ງທີ່ຜູ້ໃຊ້ແກ້); ແຖວໃໝ່ຮັບ
 * ລາຄາ/ຕົ້ນທຶນຈາກແຖວທຳອິດເດີມ. ເກີນ MAX_VARIANTS ຄືນ `previous` ເດີມ (UI ສະແດງຄຳເຕືອນ).
 */
export function syncVariants(
  options: readonly OptionDraft[],
  previous: VariantDraft[],
  skuPrefix: string,
): VariantDraft[] {
  const active = activeOptions(options);
  if (countCombinations(active) > MAX_VARIANTS) return previous;
  const byKey = new Map(previous.map((variant) => [comboKey(active, variant.optionValues), variant]));
  const template = previous[0];
  return combinations(active).map((optionValues, index) => {
    const key = comboKey(active, optionValues);
    const existing = byKey.get(key);
    if (existing) return { ...existing, key, optionValues };
    return {
      key,
      sku: suggestSku(skuPrefix, active.map((option) => optionValues[option.name] ?? ""), index + 1),
      barcode: "",
      price: template?.price ?? "",
      costPrice: template?.costPrice ?? "",
      isActive: true,
      optionValues,
    };
  });
}
```

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/variant-matrix.test.ts` → PASS.

```bash
git add apps/admin/src/lib/variant-matrix.ts apps/admin/src/lib/variant-matrix.test.ts
git commit -m "feat(admin): variant matrix (cartesian) helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/variant-matrix.ts apps/admin/src/lib/variant-matrix.test.ts
```

---

### Task 3: `product-form.ts` (state → payload, issues → ຂໍ້ຄວາມ)

**Files:** Create `apps/admin/src/lib/product-form.ts`, `product-form.test.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```ts
import { createProductSchema } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { type ProductFormState, emptyProductForm, formatIssues, toCreateProductInput } from "./product-form";

const base = (patch: Partial<ProductFormState> = {}): ProductFormState => ({
  ...emptyProductForm(),
  name: "Tee",
  variants: [
    { key: "[]", sku: "TEE", barcode: "", price: "100", costPrice: "60", isActive: true, optionValues: {} },
  ],
  ...patch,
});

describe("toCreateProductInput", () => {
  it("ສິນຄ້າບໍ່ມີ option: ຂ້າມ field ເປົ່າ (slug, description, categoryId, barcode, ຮູບ)", () => {
    const input = toCreateProductInput(base(), true);
    expect(input).toEqual({
      name: "Tee",
      status: "DRAFT",
      options: [],
      variants: [{ sku: "TEE", price: "100", costPrice: "60", isActive: true, optionValues: {} }],
      images: [],
    });
    expect(createProductSchema.safeParse(input).success).toBe(true);
  });

  it("ບໍ່ມີ costs:write → ບໍ່ສົ່ງ costPrice (API ຕອບ 403 ຖ້າບໍ່ແມ່ນ 0)", () => {
    const input = toCreateProductInput(base(), false) as { variants: Record<string, unknown>[] };
    expect(input.variants[0]).not.toHaveProperty("costPrice");
  });

  it("option + variant + ຮູບທີ່ຜູກກັບ variant ຜ່ານ SKU", () => {
    const state = base({
      slug: "tee",
      description: "Soft",
      categoryId: "c1",
      status: "ACTIVE",
      options: [{ name: "Color", values: ["Red", "Blue"] }],
      variants: [
        { key: '["Red"]', sku: "TEE-R", barcode: "885", price: "100", costPrice: "", isActive: true, optionValues: { Color: "Red" } },
        { key: '["Blue"]', sku: "TEE-B", barcode: "", price: "110", costPrice: "", isActive: false, optionValues: { Color: "Blue" } },
      ],
      images: [
        { url: " https://x/a.png ", alt: "front", variantKey: "" },
        { url: "https://x/b.png", alt: "", variantKey: '["Blue"]' },
        { url: "   ", alt: "", variantKey: "" },
      ],
    });
    const input = toCreateProductInput(state, true);
    expect(input).toMatchObject({
      slug: "tee",
      description: "Soft",
      categoryId: "c1",
      status: "ACTIVE",
      options: [{ name: "Color", values: ["Red", "Blue"] }],
      images: [{ url: "https://x/a.png", alt: "front" }, { url: "https://x/b.png", variantSku: "TEE-B" }],
    });
    expect(createProductSchema.safeParse(input).success).toBe(true);
  });
});

describe("formatIssues", () => {
  it("แปลง path ເປັນຮູບທີ່ອ່ານງ່າຍ", () => {
    const result = createProductSchema.safeParse(
      toCreateProductInput(base({ name: "", variants: [{ ...base().variants[0]!, price: "abc" }] }), true),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const lines = formatIssues(result.error.issues);
      expect(lines.some((line) => line.startsWith("name:"))).toBe(true);
      expect(lines.some((line) => line.startsWith("variants[1].price:"))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `product-form.ts`**

```ts
import type { ProductStatus } from "@oca/shared";
import { type OptionDraft, type VariantDraft, activeOptions } from "./variant-matrix";

export interface ImageDraft {
  url: string;
  alt: string;
  /** key ຂອງ variant ທີ່ຮູບນີ້ຜູກ ("" = ຮູບຂອງສິນຄ້າ) */
  variantKey: string;
}

export interface ProductFormState {
  name: string;
  slug: string;
  description: string;
  status: ProductStatus;
  categoryId: string;
  options: OptionDraft[];
  variants: VariantDraft[];
  images: ImageDraft[];
}

export function emptyProductForm(): ProductFormState {
  return {
    name: "",
    slug: "",
    description: "",
    status: "DRAFT",
    categoryId: "",
    options: [],
    variants: [{ key: "[]", sku: "", barcode: "", price: "", costPrice: "", isActive: true, optionValues: {} }],
    images: [],
  };
}

/**
 * ແປງ state ຂອງຟອມເປັນ body ຂອງ POST /products (ຍັງບໍ່ validate: ສົ່ງຕໍ່ໃຫ້ `createProductSchema.safeParse`).
 * field ເປົ່າຖືກຂ້າມ; `costPrice` ຖືກສົ່ງສະເພາະເມື່ອ `canSetCost` (ມີ costs:write).
 */
export function toCreateProductInput(state: ProductFormState, canSetCost: boolean): unknown {
  const skuByKey = new Map(state.variants.map((variant) => [variant.key, variant.sku.trim()]));
  return {
    name: state.name.trim(),
    ...(state.slug.trim() ? { slug: state.slug.trim() } : {}),
    ...(state.description.trim() ? { description: state.description.trim() } : {}),
    status: state.status,
    ...(state.categoryId ? { categoryId: state.categoryId } : {}),
    options: activeOptions(state.options),
    variants: state.variants.map((variant) => ({
      sku: variant.sku.trim(),
      ...(variant.barcode.trim() ? { barcode: variant.barcode.trim() } : {}),
      price: variant.price.trim(),
      ...(canSetCost && variant.costPrice.trim() ? { costPrice: variant.costPrice.trim() } : {}),
      isActive: variant.isActive,
      optionValues: variant.optionValues,
    })),
    images: state.images
      .filter((image) => image.url.trim() !== "")
      .map((image) => ({
        url: image.url.trim(),
        ...(image.alt.trim() ? { alt: image.alt.trim() } : {}),
        ...(image.variantKey && skuByKey.get(image.variantKey) ? { variantSku: skuByKey.get(image.variantKey) } : {}),
      })),
  };
}

/** `variants.1.price` → `variants[1].price: <ຂໍ້ຄວາມ>` (ເລກຖືກບວກ 1 ເພື່ອໃຫ້ກົງກັບແຖວທີ່ເຫັນ) */
export function formatIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.reduce<string>((text, part) => {
      if (typeof part === "number") return `${text}[${part + 1}]`;
      return text ? `${text}.${String(part)}` : String(part);
    }, "");
    return `${path || "form"}: ${issue.message}`;
  });
}
```

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/product-form.test.ts` → PASS.

```bash
git add apps/admin/src/lib/product-form.ts apps/admin/src/lib/product-form.test.ts
git commit -m "feat(admin): product form state to create-product payload" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/product-form.ts apps/admin/src/lib/product-form.test.ts
```

---

### Task 4: `ProductStatusPill`, `OptionEditor`

**Files:**
- Create: `apps/admin/src/components/products/product-status.tsx`
- Create: `apps/admin/src/components/products/option-editor.tsx`, `option-editor.test.tsx`
- Modify: `apps/admin/src/lib/i18n/dictionary.ts`

- [ ] **Step 1: dictionary** (ຊຸດນີ້ໃຊ້ໂດຍ Task 4–8)

`lo`:
```ts
  "products.title": "ສິນຄ້າ",
  "products.description": "ຈັດການສິນຄ້າ, ຕົວເລືອກ (ສີ/ໄຊສ໌) ແລະ ລາຄາ",
  "products.count": "{count} ລາຍການ",
  "products.add": "ເພີ່ມສິນຄ້າ",
  "products.search": "ຄົ້ນຫາຊື່, SKU ຫຼື barcode...",
  "products.filter.status": "ສະຖານະ",
  "products.filter.category": "ໝວດໝູ່",
  "products.filter.allStatuses": "ທຸກສະຖານະ",
  "products.filter.allCategories": "ທຸກໝວດ",
  "products.col.product": "ສິນຄ້າ",
  "products.col.category": "ໝວດ",
  "products.col.status": "ສະຖານະ",
  "products.col.price": "ລາຄາ",
  "products.col.available": "ຂາຍໄດ້",
  "products.variantCount": "{count} ຕົວເລືອກ",
  "products.status.DRAFT": "ຮ່າງ",
  "products.status.ACTIVE": "ເປີດຂາຍ",
  "products.status.ARCHIVED": "ເກັບຖາວອນ",
  "products.empty.title": "ຍັງບໍ່ມີສິນຄ້າ",
  "products.empty.noResults": "ບໍ່ພົບສິນຄ້າທີ່ຄົ້ນຫາ",
  "products.form.createTitle": "ເພີ່ມສິນຄ້າ",
  "products.form.createDescription": "ຕັ້ງຂໍ້ມູນສິນຄ້າ, ຕົວເລືອກ ແລະ ລາຄາຂອງແຕ່ລະ variant",
  "products.section.general": "ຂໍ້ມູນທົ່ວໄປ",
  "products.section.options": "ຕົວເລືອກ (ສີ, ໄຊສ໌ ...)",
  "products.section.variants": "Variant ແລະ ລາຄາ",
  "products.section.images": "ຮູບສິນຄ້າ",
  "products.section.stock": "ສະຕ໋ອກ",
  "products.field.name": "ຊື່ສິນຄ້າ",
  "products.field.slug": "Slug",
  "products.field.slugHint": "ເວັ້ນໄວ້ເພື່ອສ້າງຈາກຊື່ອັດຕະໂນມັດ",
  "products.field.description": "ລາຍລະອຽດ",
  "products.field.status": "ສະຖານະ",
  "products.field.category": "ໝວດໝູ່",
  "products.field.noCategory": "— ບໍ່ມີ —",
  "products.field.skuPrefix": "ຄຳນຳໜ້າ SKU",
  "products.option.add": "ເພີ່ມຕົວເລືອກ",
  "products.option.name": "ຊື່ຕົວເລືອກ",
  "products.option.namePlaceholder": "ເຊັ່ນ ສີ",
  "products.option.valuesPlaceholder": "ພິມຄ່າ ແລ້ວກົດ Enter",
  "products.option.addValue": "ເພີ່ມຄ່າ",
  "products.option.remove": "ລຶບຕົວເລືອກ",
  "products.option.removeValue": "ລຶບຄ່າ",
  "products.option.limit": "ມີໄດ້ສູງສຸດ 3 ຕົວເລືອກ",
  "products.option.help": "ເຊັ່ນ ສີ = ແດງ, ຟ້າ ແລະ ໄຊສ໌ = S, M ຈະສ້າງ 4 variant ໃຫ້ອັດຕະໂນມັດ. ຖ້າບໍ່ມີຕົວເລືອກ ສິນຄ້າຈະມີ 1 variant.",
  "products.option.readonly": "ຕົວເລືອກແກ້ໄຂບໍ່ໄດ້ຫຼັງສ້າງສິນຄ້າ ຖ້າຕ້ອງການປ່ຽນ ໃຫ້ສ້າງສິນຄ້າໃໝ່.",
  "products.variants.name": "Variant",
  "products.variants.single": "ສິນຄ້າດຽວ (ບໍ່ມີຕົວເລືອກ)",
  "products.variants.sku": "SKU",
  "products.variants.barcode": "Barcode",
  "products.variants.price": "ລາຄາຂາຍ",
  "products.variants.cost": "ຕົ້ນທຶນ",
  "products.variants.active": "ເປີດຂາຍ",
  "products.variants.stock": "ສະຕ໋ອກ (ຂາຍໄດ້ / ຈອງ)",
  "products.variants.noStock": "ຍັງບໍ່ມີສະຕ໋ອກ",
  "products.variants.tooMany": "ຕົວເລືອກສ້າງ variant ເກີນ 100 ແຖວ ກະລຸນາຫຼຸດຄ່າຂອງຕົວເລືອກ",
  "products.variants.count": "{count} variant",
  "products.variants.save": "ບັນທຶກແຖວນີ້",
  "products.variants.add": "ເພີ່ມ variant",
  "products.variants.addTitle": "ເພີ່ມ variant",
  "products.variants.addDescription": "ເລືອກຄ່າຂອງແຕ່ລະຕົວເລືອກ (ຕ້ອງບໍ່ຊ້ຳກັບທີ່ມີຢູ່)",
  "products.variants.stockLink": "ເບິ່ງ/ຮັບສະຕ໋ອກ",
  "products.images.add": "ເພີ່ມຮູບ",
  "products.images.url": "URL ຮູບ (http/https)",
  "products.images.alt": "ຄຳອະທິບາຍຮູບ",
  "products.images.variant": "ຜູກກັບ variant",
  "products.images.productLevel": "ທັງສິນຄ້າ",
  "products.images.up": "ຍ້າຍຂຶ້ນ",
  "products.images.down": "ຍ້າຍລົງ",
  "products.images.remove": "ລຶບຮູບ",
  "products.images.empty": "ຍັງບໍ່ມີຮູບ",
  "products.images.save": "ບັນທຶກຮູບ",
  "products.form.issues": "ກະລຸນາແກ້ຂໍ້ມູນຕໍ່ໄປນີ້",
  "products.detail.title": "ແກ້ໄຂສິນຄ້າ",
  "products.detail.notFound": "ບໍ່ພົບສິນຄ້ານີ້",
  "products.delete": "ລຶບສິນຄ້າ",
  "products.deleteTitle": "ລຶບສິນຄ້ານີ້?",
  "products.deleteDescription": "ຖ້າສິນຄ້າ {name} ເຄີຍຖືກຂາຍ ລະບົບຈະເກັບຖາວອນ (archive) ແທນການລຶບ.",
  "products.toast.created": "ເພີ່ມສິນຄ້າແລ້ວ",
  "products.toast.updated": "ບັນທຶກສິນຄ້າແລ້ວ",
  "products.toast.variantSaved": "ບັນທຶກ variant ແລ້ວ",
  "products.toast.variantAdded": "ເພີ່ມ variant ແລ້ວ",
  "products.toast.imagesSaved": "ບັນທຶກຮູບແລ້ວ",
  "products.toast.deleted": "ລຶບສິນຄ້າແລ້ວ",
  "products.toast.archived": "ສິນຄ້າເຄີຍຖືກຂາຍ ຈຶ່ງຖືກເກັບຖາວອນແທນການລຶບ",
```
`en`:
```ts
  "products.title": "Products",
  "products.description": "Manage products, options (color/size) and prices",
  "products.count": "{count} items",
  "products.add": "Add product",
  "products.search": "Search name, SKU or barcode...",
  "products.filter.status": "Status",
  "products.filter.category": "Category",
  "products.filter.allStatuses": "All statuses",
  "products.filter.allCategories": "All categories",
  "products.col.product": "Product",
  "products.col.category": "Category",
  "products.col.status": "Status",
  "products.col.price": "Price",
  "products.col.available": "Available",
  "products.variantCount": "{count} variants",
  "products.status.DRAFT": "Draft",
  "products.status.ACTIVE": "Active",
  "products.status.ARCHIVED": "Archived",
  "products.empty.title": "No products yet",
  "products.empty.noResults": "No products match your search",
  "products.form.createTitle": "Add product",
  "products.form.createDescription": "Set the product details, options and the price of each variant",
  "products.section.general": "General",
  "products.section.options": "Options (color, size ...)",
  "products.section.variants": "Variants and prices",
  "products.section.images": "Images",
  "products.section.stock": "Stock",
  "products.field.name": "Product name",
  "products.field.slug": "Slug",
  "products.field.slugHint": "Leave empty to generate it from the name",
  "products.field.description": "Description",
  "products.field.status": "Status",
  "products.field.category": "Category",
  "products.field.noCategory": "— None —",
  "products.field.skuPrefix": "SKU prefix",
  "products.option.add": "Add option",
  "products.option.name": "Option name",
  "products.option.namePlaceholder": "e.g. Color",
  "products.option.valuesPlaceholder": "Type a value and press Enter",
  "products.option.addValue": "Add value",
  "products.option.remove": "Remove option",
  "products.option.removeValue": "Remove value",
  "products.option.limit": "At most 3 options",
  "products.option.help": "For example Color = Red, Blue and Size = S, M creates 4 variants automatically. Without options the product has 1 variant.",
  "products.option.readonly": "Options cannot be changed after the product is created. Create a new product to change them.",
  "products.variants.name": "Variant",
  "products.variants.single": "Single item (no options)",
  "products.variants.sku": "SKU",
  "products.variants.barcode": "Barcode",
  "products.variants.price": "Price",
  "products.variants.cost": "Cost",
  "products.variants.active": "For sale",
  "products.variants.stock": "Stock (available / reserved)",
  "products.variants.noStock": "No stock yet",
  "products.variants.tooMany": "The options would create more than 100 variants. Please reduce the option values",
  "products.variants.count": "{count} variants",
  "products.variants.save": "Save row",
  "products.variants.add": "Add variant",
  "products.variants.addTitle": "Add variant",
  "products.variants.addDescription": "Pick a value for each option (must not duplicate an existing variant)",
  "products.variants.stockLink": "View / receive stock",
  "products.images.add": "Add image",
  "products.images.url": "Image URL (http/https)",
  "products.images.alt": "Image description",
  "products.images.variant": "Linked variant",
  "products.images.productLevel": "Whole product",
  "products.images.up": "Move up",
  "products.images.down": "Move down",
  "products.images.remove": "Remove image",
  "products.images.empty": "No images yet",
  "products.images.save": "Save images",
  "products.form.issues": "Please fix the following",
  "products.detail.title": "Edit product",
  "products.detail.notFound": "This product was not found",
  "products.delete": "Delete product",
  "products.deleteTitle": "Delete this product?",
  "products.deleteDescription": "If {name} has ever been sold it is archived instead of deleted.",
  "products.toast.created": "Product added",
  "products.toast.updated": "Product saved",
  "products.toast.variantSaved": "Variant saved",
  "products.toast.variantAdded": "Variant added",
  "products.toast.imagesSaved": "Images saved",
  "products.toast.deleted": "Product deleted",
  "products.toast.archived": "The product has been sold before, so it was archived instead of deleted",
```

- [ ] **Step 2: ຂຽນ `product-status.tsx`**

```tsx
"use client";

import type { ProductStatus } from "@oca/shared";
import { StatusPill, type StatusTone } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

const TONES: Record<ProductStatus, StatusTone> = { DRAFT: "neutral", ACTIVE: "success", ARCHIVED: "warning" };

export function ProductStatusPill({ status }: { status: ProductStatus }) {
  const { t } = useT();
  return <StatusPill tone={TONES[status]}>{t(`products.status.${status}`)}</StatusPill>;
}
```

- [ ] **Step 3: ຂຽນ test `option-editor.test.tsx` ທີ່ຈະລົ້ມ**

```tsx
import { screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { OptionDraft } from "@/lib/variant-matrix";
import { renderWithProviders } from "@/test/render";
import { OptionEditor } from "./option-editor";

function Harness({ initial = [] as OptionDraft[] }) {
  const [options, setOptions] = useState<OptionDraft[]>(initial);
  return (
    <>
      <OptionEditor options={options} onChange={setOptions} />
      <pre data-testid="state">{JSON.stringify(options)}</pre>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "[]") as OptionDraft[];

describe("OptionEditor", () => {
  it("ເພີ່ມຕົວເລືອກ ຕັ້ງຊື່ ແລະ ເພີ່ມຄ່າດ້ວຍ Enter (ບໍ່ເພີ່ມຄ່າເປົ່າ/ຊ້ຳ)", async () => {
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option name"), "Color");
    const input = screen.getByPlaceholderText("Type a value and press Enter");
    await user.type(input, "Red{Enter}");
    await user.type(input, "Blue{Enter}");
    await user.type(input, "Red{Enter}");
    await user.type(input, "{Enter}");
    expect(state()).toEqual([{ name: "Color", values: ["Red", "Blue"] }]);
  });

  it("ລຶບຄ່າ ແລະ ລຶບຕົວເລືອກ", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: ["Red", "Blue"] }]} />);
    await user.click(screen.getByRole("button", { name: "Remove value Red" }));
    expect(state()[0]?.values).toEqual(["Blue"]);
    await user.click(screen.getByRole("button", { name: "Remove option" }));
    expect(state()).toEqual([]);
  });

  it("ສູງສຸດ 3 ຕົວເລືອກ: ປຸ່ມເພີ່ມຖືກປິດ ແລະ ມີຄຳອະທິບາຍ", () => {
    renderWithProviders(
      <Harness
        initial={[
          { name: "A", values: ["1"] },
          { name: "B", values: ["1"] },
          { name: "C", values: ["1"] },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Add option" })).toBeDisabled();
    expect(screen.getByText("At most 3 options")).toBeInTheDocument();
  });

  it("ແຕ່ລະຕົວເລືອກສະແດງຄ່າເປັນ chip", () => {
    renderWithProviders(<Harness initial={[{ name: "Size", values: ["S", "M"] }]} />);
    const group = screen.getByTestId("option-0");
    expect(within(group).getByText("S")).toBeInTheDocument();
    expect(within(group).getByText("M")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: ຣັນໃຫ້ລົ້ມ** — `pnpm --filter @oca/admin exec vitest run src/components/products/option-editor.test.tsx` → FAIL.

- [ ] **Step 5: ຂຽນ `option-editor.tsx`**

```tsx
"use client";

import { Button, Field, Input } from "@oca/ui";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { MAX_OPTIONS, type OptionDraft } from "@/lib/variant-matrix";

export interface OptionEditorProps {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
}

export function OptionEditor({ options, onChange }: OptionEditorProps) {
  const { t } = useT();
  const atLimit = options.length >= MAX_OPTIONS;

  const patch = (index: number, next: OptionDraft) => onChange(options.map((option, i) => (i === index ? next : option)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-secondary">{t("products.option.help")}</p>
      {options.map((option, index) => (
        <OptionRow
          // ຕຳແໜ່ງເປັນ key ເພາະຊື່ແກ້ໄດ້ຕະຫຼອດ
          key={index}
          index={index}
          option={option}
          onChange={(next) => patch(index, next)}
          onRemove={() => onChange(options.filter((_, i) => i !== index))}
        />
      ))}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outlinePrimary"
          className="rounded-lg"
          disabled={atLimit}
          onClick={() => onChange([...options, { name: "", values: [] }])}
        >
          <Plus aria-hidden="true" />
          {t("products.option.add")}
        </Button>
        {atLimit ? <span className="text-xs text-ink-muted">{t("products.option.limit")}</span> : null}
      </div>
    </div>
  );
}

function OptionRow({
  index,
  option,
  onChange,
  onRemove,
}: {
  index: number;
  option: OptionDraft;
  onChange: (option: OptionDraft) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    setDraft("");
    if (value === "" || option.values.includes(value)) return;
    onChange({ ...option, values: [...option.values, value] });
  }

  return (
    <div data-testid={`option-${index}`} className="rounded-xl border border-line p-3">
      <div className="flex items-end gap-3">
        <Field label={t("products.option.name")} htmlFor={`option-name-${index}`} className="flex-1">
          <Input
            id={`option-name-${index}`}
            value={option.name}
            placeholder={t("products.option.namePlaceholder")}
            onChange={(event) => onChange({ ...option, name: event.target.value })}
          />
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg"
          aria-label={t("products.option.remove")}
          title={t("products.option.remove")}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {option.values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-brand-soft-line bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink"
          >
            {value}
            <button
              type="button"
              aria-label={`${t("products.option.removeValue")} ${value}`}
              className="rounded-full hover:bg-brand/10"
              onClick={() => onChange({ ...option, values: option.values.filter((item) => item !== value) })}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          aria-label={t("products.option.addValue")}
          placeholder={t("products.option.valuesPlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          className="h-8 min-w-[200px] flex-1 rounded-lg border border-line bg-subtle px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: ຣັນໃຫ້ຜ່ານ + typecheck**

Run: `pnpm --filter @oca/admin exec vitest run src/components/products/option-editor.test.tsx && pnpm --filter @oca/admin typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/products/product-status.tsx apps/admin/src/components/products/option-editor.tsx apps/admin/src/components/products/option-editor.test.tsx apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): product option editor and status pill" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/products apps/admin/src/lib/i18n/dictionary.ts
```

---

### Task 5: `VariantGrid` (ຕອນສ້າງ) ແລະ `ImageListEditor`

**Files:**
- Create: `apps/admin/src/components/products/variant-grid.tsx`, `variant-grid.test.tsx`
- Create: `apps/admin/src/components/products/image-list-editor.tsx`, `image-list-editor.test.tsx`

- [ ] **Step 1: ຂຽນ test `variant-grid.test.tsx` ທີ່ຈະລົ້ມ**

```tsx
import { screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { VariantDraft } from "@/lib/variant-matrix";
import { renderWithProviders } from "@/test/render";
import { VariantGrid } from "./variant-grid";

const rows: VariantDraft[] = [
  { key: '["Red"]', sku: "TEE-Red", barcode: "", price: "100", costPrice: "60", isActive: true, optionValues: { Color: "Red" } },
  { key: '["Blue"]', sku: "TEE-Blue", barcode: "", price: "100", costPrice: "60", isActive: true, optionValues: { Color: "Blue" } },
];

function Harness({ showCost }: { showCost: boolean }) {
  const [variants, setVariants] = useState(rows);
  return (
    <>
      <VariantGrid variants={variants} onChange={setVariants} showCost={showCost} />
      <pre data-testid="state">{JSON.stringify(variants)}</pre>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "[]") as VariantDraft[];

describe("VariantGrid", () => {
  it("ສະແດງຊື່ variant ຈາກຄ່າ option ແລະ ແກ້ SKU/ລາຄາ/ເປີດຂາຍໄດ້", async () => {
    const { user } = renderWithProviders(<Harness showCost />);
    const red = screen.getByTestId("variant-row-0");
    expect(within(red).getByText("Red")).toBeInTheDocument();
    await user.clear(within(red).getByLabelText("SKU"));
    await user.type(within(red).getByLabelText("SKU"), "R1");
    await user.clear(within(red).getByLabelText("Price"));
    await user.type(within(red).getByLabelText("Price"), "250");
    await user.click(within(screen.getByTestId("variant-row-1")).getByRole("checkbox", { name: "For sale" }));
    expect(state()[0]).toMatchObject({ sku: "R1", price: "250" });
    expect(state()[1]?.isActive).toBe(false);
  });

  it("ບໍ່ມີ showCost: ບໍ່ມີຄອລຳຕົ້ນທຶນ", () => {
    renderWithProviders(<Harness showCost={false} />);
    expect(screen.queryByLabelText("Cost")).toBeNull();
  });

  it("showCost: ມີຄອລຳຕົ້ນທຶນທຸກແຖວ", () => {
    renderWithProviders(<Harness showCost />);
    expect(screen.getAllByLabelText("Cost")).toHaveLength(2);
  });

  it("ແຖວດຽວທີ່ບໍ່ມີ option ສະແດງ 'ສິນຄ້າດຽວ'", () => {
    function Single() {
      return (
        <VariantGrid
          variants={[{ key: "[]", sku: "", barcode: "", price: "", costPrice: "", isActive: true, optionValues: {} }]}
          onChange={() => {}}
          showCost={false}
        />
      );
    }
    renderWithProviders(<Single />);
    expect(screen.getByText("Single item (no options)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** → FAIL.

- [ ] **Step 3: ຂຽນ `variant-grid.tsx`**

```tsx
"use client";

import { Checkbox, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";
import type { VariantDraft } from "@/lib/variant-matrix";

export interface VariantGridProps {
  variants: VariantDraft[];
  onChange: (variants: VariantDraft[]) => void;
  /** ສະແດງ/ແກ້ຕົ້ນທຶນ (ຕ້ອງມີ costs:write) */
  showCost: boolean;
}

/** ຕາຕະລາງແກ້ໄຂ variant ຕອນສ້າງສິນຄ້າ (ແຖວມາຈາກ cartesian ຂອງ options) */
export function VariantGrid({ variants, onChange, showCost }: VariantGridProps) {
  const { t } = useT();
  const patch = (index: number, change: Partial<VariantDraft>) =>
    onChange(variants.map((variant, i) => (i === index ? { ...variant, ...change } : variant)));

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("products.variants.name")}</TableHead>
            <TableHead>{t("products.variants.sku")}</TableHead>
            <TableHead>{t("products.variants.barcode")}</TableHead>
            <TableHead>{t("products.variants.price")}</TableHead>
            {showCost ? <TableHead>{t("products.variants.cost")}</TableHead> : null}
            <TableHead className="text-center">{t("products.variants.active")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant, index) => {
            const label = Object.values(variant.optionValues).join(" / ") || t("products.variants.single");
            return (
              <TableRow key={variant.key} data-testid={`variant-row-${index}`}>
                <TableCell className="whitespace-nowrap font-medium text-ink">{label}</TableCell>
                <TableCell>
                  <Input
                    aria-label={t("products.variants.sku")}
                    value={variant.sku}
                    onChange={(event) => patch(index, { sku: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={t("products.variants.barcode")}
                    value={variant.barcode}
                    onChange={(event) => patch(index, { barcode: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={t("products.variants.price")}
                    inputMode="decimal"
                    value={variant.price}
                    onChange={(event) => patch(index, { price: event.target.value })}
                  />
                </TableCell>
                {showCost ? (
                  <TableCell>
                    <Input
                      aria-label={t("products.variants.cost")}
                      inputMode="decimal"
                      value={variant.costPrice}
                      onChange={(event) => patch(index, { costPrice: event.target.value })}
                    />
                  </TableCell>
                ) : null}
                <TableCell className="text-center">
                  <Checkbox
                    aria-label={t("products.variants.active")}
                    checked={variant.isActive}
                    onCheckedChange={(checked) => patch(index, { isActive: checked === true })}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: test `image-list-editor.test.tsx`**

```tsx
import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { ImageDraft } from "@/lib/product-form";
import { renderWithProviders } from "@/test/render";
import { ImageListEditor } from "./image-list-editor";

function Harness({ initial = [] as ImageDraft[] }) {
  const [images, setImages] = useState(initial);
  return (
    <>
      <ImageListEditor
        images={images}
        onChange={setImages}
        variants={[{ key: "v1", label: "Red" }]}
      />
      <pre data-testid="state">{JSON.stringify(images)}</pre>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "[]") as ImageDraft[];

describe("ImageListEditor", () => {
  it("ເພີ່ມຮູບ ໃສ່ URL/ຄຳອະທິບາຍ ແລະ ຜູກກັບ variant", async () => {
    const { user } = renderWithProviders(<Harness />);
    expect(screen.getByText("No images yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add image" }));
    await user.type(screen.getByLabelText("Image URL (http/https)"), "https://x/a.png");
    await user.type(screen.getByLabelText("Image description"), "front");
    await user.selectOptions(screen.getByLabelText("Linked variant"), "v1");
    expect(state()).toEqual([{ url: "https://x/a.png", alt: "front", variantKey: "v1" }]);
  });

  it("ຍ້າຍຂຶ້ນ/ລົງ ແລະ ລຶບ; ປຸ່ມຂຶ້ນຂອງແຖວທຳອິດ ແລະ ລົງຂອງແຖວສຸດທ້າຍຖືກປິດ", async () => {
    const { user } = renderWithProviders(
      <Harness
        initial={[
          { url: "https://x/1.png", alt: "", variantKey: "" },
          { url: "https://x/2.png", alt: "", variantKey: "" },
        ]}
      />,
    );
    const ups = screen.getAllByRole("button", { name: "Move up" });
    const downs = screen.getAllByRole("button", { name: "Move down" });
    expect(ups[0]).toBeDisabled();
    expect(downs[1]).toBeDisabled();
    await user.click(downs[0] as HTMLElement);
    expect(state().map((image) => image.url)).toEqual(["https://x/2.png", "https://x/1.png"]);
    await user.click(screen.getAllByRole("button", { name: "Remove image" })[0] as HTMLElement);
    expect(state().map((image) => image.url)).toEqual(["https://x/1.png"]);
  });

  it("preview ສະແດງສະເພາະ URL ທີ່ຂຶ້ນຕົ້ນດ້ວຍ http(s)", () => {
    renderWithProviders(
      <Harness
        initial={[
          { url: "https://x/ok.png", alt: "ok", variantKey: "" },
          { url: "javascript:alert(1)", alt: "bad", variantKey: "" },
        ]}
      />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
```

- [ ] **Step 5: ຣັນໃຫ້ລົ້ມ** → FAIL.

- [ ] **Step 6: ຂຽນ `image-list-editor.tsx`**

```tsx
"use client";

import { Button, Field, Input, Select } from "@oca/ui";
import { ArrowDown, ArrowUp, ImageOff, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/language-provider";
import type { ImageDraft } from "@/lib/product-form";

export interface ImageListEditorProps {
  images: ImageDraft[];
  onChange: (images: ImageDraft[]) => void;
  /** ຕົວເລືອກ variant ທີ່ຜູກໄດ້ (key = ຄ່າທີ່ເກັບໃນ ImageDraft.variantKey) */
  variants: { key: string; label: string }[];
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

export function ImageListEditor({ images, onChange, variants }: ImageListEditorProps) {
  const { t } = useT();
  const patch = (index: number, change: Partial<ImageDraft>) =>
    onChange(images.map((image, i) => (i === index ? { ...image, ...change } : image)));
  const move = (index: number, delta: -1 | 1) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    if (item) next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {images.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ImageOff className="size-4" aria-hidden="true" />
          {t("products.images.empty")}
        </p>
      ) : null}
      {images.map((image, index) => (
        <div key={index} className="flex flex-wrap items-start gap-3 rounded-xl border border-line p-3">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
            {isHttpUrl(image.url) ? (
              <img src={image.url.trim()} alt={image.alt} className="size-full object-cover" />
            ) : (
              <ImageOff className="size-5 text-ink-muted" aria-hidden="true" />
            )}
          </div>
          <div className="grid min-w-[240px] flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("products.images.url")} htmlFor={`image-url-${index}`} className="sm:col-span-3">
              <Input
                id={`image-url-${index}`}
                value={image.url}
                placeholder="https://"
                onChange={(event) => patch(index, { url: event.target.value })}
              />
            </Field>
            <Field label={t("products.images.alt")} htmlFor={`image-alt-${index}`} className="sm:col-span-2">
              <Input id={`image-alt-${index}`} value={image.alt} onChange={(event) => patch(index, { alt: event.target.value })} />
            </Field>
            <Field label={t("products.images.variant")} htmlFor={`image-variant-${index}`}>
              <Select
                id={`image-variant-${index}`}
                value={image.variantKey}
                onChange={(event) => patch(index, { variantKey: event.target.value })}
              >
                <option value="">{t("products.images.productLevel")}</option>
                {variants.map((variant) => (
                  <option key={variant.key} value={variant.key}>
                    {variant.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
              aria-label={t("products.images.up")}
              title={t("products.images.up")}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
              aria-label={t("products.images.down")}
              title={t("products.images.down")}
              disabled={index === images.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
              aria-label={t("products.images.remove")}
              title={t("products.images.remove")}
              onClick={() => onChange(images.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      {images.length < 20 ? (
        <Button
          type="button"
          variant="outlinePrimary"
          className="rounded-lg"
          onClick={() => onChange([...images, { url: "", alt: "", variantKey: "" }])}
        >
          <Plus aria-hidden="true" />
          {t("products.images.add")}
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: ຣັນໃຫ້ຜ່ານ + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/products && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src/components/products
git commit -m "feat(admin): variant grid and image list editor" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/products
```

---

### Task 6: ໜ້າລາຍການ `/products`

**Files:**
- Create: `apps/admin/src/components/products/product-list.tsx`, `product-list.test.tsx`
- Create: `apps/admin/src/app/(app)/products/page.tsx`
- Modify: `apps/admin/src/lib/nav.ts`, `apps/admin/src/lib/nav.test.ts`

- [ ] **Step 1: ຂຽນ test `product-list.test.tsx` ທີ່ຈະລົ້ມ**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { CategoryDto, Page, ProductListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ProductList } from "./product-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const items: ProductListItemDto[] = [
  { id: "p1", name: "Tee", slug: "tee", status: "ACTIVE", category: { id: "c1", name: "Apparel" }, imageUrl: "https://x/a.png", variantCount: 3, priceMin: "100.00", priceMax: "150.00", availableTotal: 12 },
  { id: "p2", name: "Mug", slug: "mug", status: "DRAFT", category: null, imageUrl: null, variantCount: 1, priceMin: "25000.00", priceMax: "25000.00", availableTotal: 0 },
];
const categories: CategoryDto[] = [{ id: "c1", name: "Apparel", slug: "apparel", parentId: null, position: 0, productCount: 1 }];

function mockApi(page: Page<ProductListItemDto> = { items, total: 2, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.startsWith("/products")) return page;
    if (path === "/categories") return categories;
    return undefined;
  }) as typeof apiFetch);
}
const lastProductsUrl = () =>
  vi.mocked(apiFetch).mock.calls.map((call) => call[0]).filter((path) => path.startsWith("/products")).at(-1);

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("ProductList", () => {
  it("ສະແດງແຖວ: ຊື່, ໝວດ, ສະຖານະ, ຊ່ວງລາຄາ, ສະຕ໋ອກຂາຍໄດ້ ແລະ ຈຳນວນ variant", async () => {
    renderWithProviders(<ProductList />);
    const tee = await screen.findByTestId("row-product-p1");
    expect(within(tee).getByText("Tee")).toBeInTheDocument();
    expect(within(tee).getByText("Apparel")).toBeInTheDocument();
    expect(within(tee).getByText("Active")).toBeInTheDocument();
    expect(within(tee).getByText("100.00 – 150.00")).toBeInTheDocument();
    expect(within(tee).getByText("12")).toBeInTheDocument();
    expect(within(tee).getByText("3 variants")).toBeInTheDocument();
    const mug = screen.getByTestId("row-product-p2");
    expect(within(mug).getByText("25,000.00")).toBeInTheDocument(); // min = max → ຄ່າດຽວ
    expect(within(tee).getByRole("link", { name: "Tee" })).toHaveAttribute("href", "/products/p1");
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("ຄົ້ນຫາ (debounce) ແລະ ກັ່ນຕອງສະຖານະ/ໝວດ ຖືກສົ່ງເປັນ query ແລະ ກັບໄປໜ້າ 1", async () => {
    const { user } = renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    await user.type(screen.getByPlaceholderText("Search name, SKU or barcode..."), "tee");
    await waitFor(() => expect(lastProductsUrl()).toContain("q=tee"));
    await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    await waitFor(() => expect(lastProductsUrl()).toContain("status=ACTIVE"));
    await user.selectOptions(screen.getByLabelText("Category"), "c1");
    await waitFor(() => expect(lastProductsUrl()).toContain("categoryId=c1"));
    expect(lastProductsUrl()).toContain("page=1");
  });

  it("ປ່ຽນໜ້າ: ສົ່ງ page=2", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastProductsUrl()).toContain("page=2"));
  });

  it("ວ່າງ (ບໍ່ມີ filter): empty state ພ້ອມປຸ່ມເພີ່ມ; ວ່າງ (ມີ filter): ບໍ່ພົບ + ລ້າງ", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<ProductList />);
    expect(await screen.findByText("No products yet")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search name, SKU or barcode..."), "zzz");
    expect(await screen.findByText("No products match your search")).toBeInTheDocument();
  });

  it("ບໍ່ມີ inventory:write: ບໍ່ມີປຸ່ມເພີ່ມສິນຄ້າ", async () => {
    auth.canWrite = false;
    renderWithProviders(<ProductList />);
    await screen.findByTestId("row-product-p1");
    expect(screen.queryByRole("link", { name: "Add product" })).toBeNull();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** → FAIL.

- [ ] **Step 3: ຂຽນ `product-list.tsx`**

```tsx
"use client";

import { PRODUCT_STATUSES } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  buttonVariants,
  cn,
} from "@oca/ui";
import { AlertCircle, ImageOff, Package, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { flattenCategories } from "@/lib/category-tree";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useCategories, useProducts } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import { ProductStatusPill } from "./product-status";

const COLUMNS = 5;

export function ProductList() {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const q = useDebounced(search.trim(), 300);

  const query = useProducts({ q, status, categoryId, page, pageSize });
  const categories = useCategories();
  const categoryRows = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);
  const rows = query.data?.items ?? [];
  const filtered = q !== "" || status !== "" || categoryId !== "";

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const addButton = canWrite ? (
    <Link href="/products/new" className={cn(buttonVariants(), "rounded-xl")}>
      <Plus aria-hidden="true" />
      {t("products.add")}
    </Link>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("products.title")]}
        title={t("products.title")}
        badge={query.data ? t("products.count", { count: query.data.total }) : undefined}
        description={t("products.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => resetPage(setSearch)(event.target.value)}
                placeholder={t("products.search")}
                aria-label={t("products.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Select
              aria-label={t("products.filter.status")}
              className="w-44"
              value={status}
              onChange={(event) => resetPage(setStatus)(event.target.value)}
            >
              <option value="">{t("products.filter.allStatuses")}</option>
              {PRODUCT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`products.status.${value}`)}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t("products.filter.category")}
              className="w-52"
              value={categoryId}
              onChange={(event) => resetPage(setCategoryId)(event.target.value)}
            >
              <option value="">{t("products.filter.allCategories")}</option>
              {categoryRows.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {`${"— ".repeat(depth)}${category.name}`}
                </option>
              ))}
            </Select>
          </div>

          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("products.col.product")}</TableHead>
                    <TableHead>{t("products.col.category")}</TableHead>
                    <TableHead>{t("products.col.status")}</TableHead>
                    <TableHead className="text-right">{t("products.col.price")}</TableHead>
                    <TableHead className="text-right">{t("products.col.available")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((product) => (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <ImageOff className="size-4 text-ink-muted" aria-hidden="true" />
                            )}
                          </div>
                          <div>
                            <Link href={`/products/${product.id}`} className="font-medium text-ink hover:text-brand-ink">
                              {product.name}
                            </Link>
                            <p className="text-xs text-ink-muted">{t("products.variantCount", { count: product.variantCount })}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-ink-secondary">{product.category?.name ?? "—"}</TableCell>
                      <TableCell>
                        <ProductStatusPill status={product.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {product.priceMin === product.priceMax
                          ? formatMoney(product.priceMin)
                          : `${formatMoney(product.priceMin)} – ${formatMoney(product.priceMax)}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(product.availableTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={filtered ? t("products.empty.noResults") : t("products.empty.title")}
                  action={
                    filtered ? (
                      <Button
                        variant="outlinePrimary"
                        className="rounded-lg"
                        onClick={() => {
                          setSearch("");
                          setStatus("");
                          setCategoryId("");
                          setPage(1);
                        }}
                      >
                        {t("common.clearSearch")}
                      </Button>
                    ) : (
                      addButton
                    )
                  }
                />
              ) : null}
              <ServerPager
                page={page}
                pageSize={pageSize}
                total={query.data?.total ?? 0}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
```

ໝາຍເຫດ: `Button` ຂອງ `@oca/ui` ບໍ່ມີ `asChild` ຈຶ່ງໃຊ້ `<Link>` ທີ່ໃສ່ class ຈາກ `buttonVariants` (ຜົນຄືປຸ່ມທີ່ເປັນລິ້ງ; test ຊອກດ້ວຍ role `link`).

ໝາຍເຫດ test: ກໍລະນີ "ວ່າງ (ບໍ່ມີ filter) → ພິມ zzz" ອາໄສ mock ທີ່ຕອບ `items: []` ທຸກ query ຈຶ່ງໄດ້ "ບໍ່ພົບ" ເມື່ອມີ filter.

- [ ] **Step 4: ໜ້າ** `apps/admin/src/app/(app)/products/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { ProductList } from "@/components/products/product-list";

export default function ProductsPage() {
  return (
    <PermissionGate permission="inventory:read">
      <ProductList />
    </PermissionGate>
  );
}
```

- [ ] **Step 5: nav** ໃນ `apps/admin/src/lib/nav.ts` ເພີ່ມ `Package` ໃນ import icon ແລະ ໃສ່ລາຍການ **ຕົ້ນ** `items` ຂອງກຸ່ມ `inventory`:

```ts
      { href: "/products", labelKey: "nav.products", icon: Package, permission: "inventory:read" },
```
dictionary: `lo` `"nav.products": "ສິນຄ້າ",` / `en` `"nav.products": "Products",`. ແກ້ test ໃນ `nav.test.ts` ຂອງກໍລະນີ `inventory:read`: `groups[0]?.items.map(href)` ເປັນ `["/products", "/warehouses", "/categories"]`.

- [ ] **Step 6: ຣັນ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/components/products/product-list.test.tsx src/lib/nav.test.ts && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

```bash
git add apps/admin/src/components/products/product-list.tsx apps/admin/src/components/products/product-list.test.tsx "apps/admin/src/app/(app)/products" apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): products list page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/products/product-list.tsx apps/admin/src/components/products/product-list.test.tsx "apps/admin/src/app/(app)/products" apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts apps/admin/src/lib/i18n/dictionary.ts
```

---

### Task 7: ຟອມສ້າງສິນຄ້າ `/products/new`

**Files:**
- Create: `apps/admin/src/components/products/product-create-form.tsx`, `product-create-form.test.tsx`
- Create: `apps/admin/src/app/(app)/products/new/page.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ** `product-create-form.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { ProductCreateForm } from "./product-create-form";

const auth = vi.hoisted(() => ({ costsWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "costs:write" ? auth.costsWrite : true),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  auth.costsWrite = true;
  router.push.mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/categories") return [{ id: "c1", name: "Apparel", slug: "apparel", parentId: null, position: 0, productCount: 0 }];
    if (path === "/products" && options?.method === "POST") return { id: "new-id" };
    return undefined;
  }) as typeof apiFetch);
});

describe("ProductCreateForm", () => {
  it("ສິນຄ້າທີ່ບໍ່ມີ option: 1 variant; ບັນທຶກແລ້ວໄປໜ້າແກ້ໄຂ", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Mug");
    const row = screen.getByTestId("variant-row-0");
    await user.type(within(row).getByLabelText("SKU"), "MUG-1");
    await user.type(within(row).getByLabelText("Price"), "25000");
    await user.type(within(row).getByLabelText("Cost"), "9000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/products", {
        method: "POST",
        body: {
          name: "Mug",
          status: "DRAFT",
          options: [],
          variants: [{ sku: "MUG-1", price: "25000", costPrice: "9000", isActive: true, optionValues: {} }],
          images: [],
        },
      }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products/new-id"));
  });

  it("ເພີ່ມ option ສີ (2 ຄ່າ) + ໄຊສ໌ (2 ຄ່າ) → 4 ແຖວ; SKU ແນະນຳຈາກ prefix; ແຖວທີ່ແກ້ຖືກຮັກສາ", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("SKU prefix"), "TEE");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option name"), "Color");
    const valueInputs = () => screen.getAllByPlaceholderText("Type a value and press Enter");
    await user.type(valueInputs()[0] as HTMLElement, "Red{Enter}Blue{Enter}");
    expect(screen.getAllByTestId(/variant-row-/)).toHaveLength(2);
    expect(within(screen.getByTestId("variant-row-0")).getByLabelText("SKU")).toHaveValue("TEE-Red");

    await user.clear(within(screen.getByTestId("variant-row-0")).getByLabelText("SKU"));
    await user.type(within(screen.getByTestId("variant-row-0")).getByLabelText("SKU"), "MINE");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getAllByLabelText("Option name")[1] as HTMLElement, "Size");
    await user.type(valueInputs()[1] as HTMLElement, "S{Enter}M{Enter}");

    expect(screen.getAllByTestId(/variant-row-/)).toHaveLength(4);
    expect(within(screen.getByTestId("variant-row-0")).getByLabelText("SKU")).toHaveValue("MINE");
  });

  it("ບໍ່ມີ costs:write: ບໍ່ມີຄອລຳຕົ້ນທຶນ ແລະ ບໍ່ສົ່ງ costPrice", async () => {
    auth.costsWrite = false;
    const { user } = renderWithProviders(<ProductCreateForm />);
    expect(screen.queryByLabelText("Cost")).toBeNull();
    await user.type(screen.getByLabelText("Product name"), "Mug");
    const row = screen.getByTestId("variant-row-0");
    await user.type(within(row).getByLabelText("SKU"), "MUG-1");
    await user.type(within(row).getByLabelText("Price"), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products", expect.anything()));
    const post = vi.mocked(apiFetch).mock.calls.find((call) => call[0] === "/products");
    expect(JSON.stringify(post?.[1])).not.toContain("costPrice");
  });

  it("ຂໍ້ມູນບໍ່ຄົບ: ສະແດງລາຍການ issue ແລະ ບໍ່ສົ່ງ API", async () => {
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Please fix the following")).toBeInTheDocument();
    expect(vi.mocked(apiFetch).mock.calls.some((call) => call[0] === "/products")).toBe(false);
  });

  it("API ຕອບ DUPLICATE_VALUE (SKU ຊ້ຳ): ສະແດງຂໍ້ຄວາມແປ ແລະ ບໍ່ໄປໜ້າອື່ນ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path === "/categories") return [];
      throw new ApiError(409, "Duplicate value: sku", [], "DUPLICATE_VALUE");
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductCreateForm />);
    await user.type(screen.getByLabelText("Product name"), "Mug");
    const row = screen.getByTestId("variant-row-0");
    await user.type(within(row).getByLabelText("SKU"), "DUP");
    await user.type(within(row).getByLabelText("Price"), "1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This value already exists");
    expect(router.push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** → FAIL.

- [ ] **Step 3: ຂຽນ `product-create-form.tsx`**

```tsx
"use client";

import { PRODUCT_STATUSES, createProductSchema } from "@oca/shared";
import { Button, Card, Field, Input, PageHeader, Select, toast } from "@oca/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { flattenCategories } from "@/lib/category-tree";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { type ProductFormState, emptyProductForm, formatIssues, toCreateProductInput } from "@/lib/product-form";
import { useCategories, useCreateProduct } from "@/lib/queries";
import { MAX_VARIANTS, type OptionDraft, countCombinations, syncVariants } from "@/lib/variant-matrix";
import { ImageListEditor } from "./image-list-editor";
import { OptionEditor } from "./option-editor";
import { VariantGrid } from "./variant-grid";

export function ProductCreateForm() {
  const { t } = useT();
  const router = useRouter();
  const canSetCost = useCan("costs:write");
  const categories = useCategories();
  const create = useCreateProduct();

  const [form, setForm] = useState<ProductFormState>(emptyProductForm);
  const [skuPrefix, setSkuPrefix] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categoryRows = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);
  const tooMany = countCombinations(form.options) > MAX_VARIANTS;

  const patch = (change: Partial<ProductFormState>) => setForm((current) => ({ ...current, ...change }));

  function changeOptions(options: OptionDraft[]) {
    setForm((current) => ({ ...current, options, variants: syncVariants(options, current.variants, skuPrefix) }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setApiMessage(null);
    const parsed = createProductSchema.safeParse(toCreateProductInput(form, canSetCost));
    if (!parsed.success) {
      setIssues(formatIssues(parsed.error.issues));
      return;
    }
    setIssues([]);
    setSaving(true);
    try {
      const created = await create.mutateAsync(parsed.data);
      toast.success(t("products.toast.created"));
      router.push(`/products/${created.id}`);
    } catch (error) {
      setApiMessage(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("products.title"), t("products.form.createTitle")]}
        title={t("products.form.createTitle")}
        description={t("products.form.createDescription")}
        actions={
          <>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => router.push("/products")}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="rounded-xl font-bold" loading={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        {issues.length > 0 ? (
          <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink">
            <p className="font-semibold">{t("products.form.issues")}</p>
            <ul className="mt-1 list-inside list-disc">
              {issues.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {apiMessage ? (
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-ink">
            {apiMessage}
          </p>
        ) : null}

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.general")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("products.field.name")} htmlFor="product-name" required className="sm:col-span-2">
              <Input id="product-name" value={form.name} onChange={(event) => patch({ name: event.target.value })} />
            </Field>
            <Field label={t("products.field.category")} htmlFor="product-category">
              <Select id="product-category" value={form.categoryId} onChange={(event) => patch({ categoryId: event.target.value })}>
                <option value="">{t("products.field.noCategory")}</option>
                {categoryRows.map(({ category, depth }) => (
                  <option key={category.id} value={category.id}>
                    {`${"— ".repeat(depth)}${category.name}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("products.field.status")} htmlFor="product-status">
              <Select
                id="product-status"
                value={form.status}
                onChange={(event) => patch({ status: event.target.value as ProductFormState["status"] })}
              >
                {PRODUCT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`products.status.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("products.field.slug")} htmlFor="product-slug">
              <Input id="product-slug" value={form.slug} onChange={(event) => patch({ slug: event.target.value })} />
              <p className="mt-1 text-xs text-ink-muted">{t("products.field.slugHint")}</p>
            </Field>
            <Field label={t("products.field.skuPrefix")} htmlFor="product-sku-prefix">
              <Input id="product-sku-prefix" value={skuPrefix} onChange={(event) => setSkuPrefix(event.target.value)} />
            </Field>
            <Field label={t("products.field.description")} htmlFor="product-description" className="sm:col-span-2">
              <textarea
                id="product-description"
                rows={3}
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </Field>
          </div>
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.options")}</h2>
          <OptionEditor options={form.options} onChange={changeOptions} />
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">
            {t("products.section.variants")}{" "}
            <span className="text-sm font-normal text-ink-secondary">
              ({t("products.variants.count", { count: form.variants.length })})
            </span>
          </h2>
          {tooMany ? (
            <p role="alert" className="mb-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
              {t("products.variants.tooMany")}
            </p>
          ) : null}
          <VariantGrid variants={form.variants} onChange={(variants) => patch({ variants })} showCost={canSetCost} />
        </Card>

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.images")}</h2>
          <ImageListEditor
            images={form.images}
            onChange={(images) => patch({ images })}
            variants={form.variants.map((variant) => ({
              key: variant.key,
              label: Object.values(variant.optionValues).join(" / ") || variant.sku || t("products.variants.single"),
            }))}
          />
        </Card>
      </div>
    </form>
  );
}
```

ໝາຍເຫດ: ເມື່ອ `tooMany` ປຸ່ມບັນທຶກຍັງກົດໄດ້ ແຕ່ `variants` ຍັງເປັນຊຸດເດີມ (syncVariants ຄືນ previous) ຈຶ່ງ submit ຜ່ານ schema ໄດ້ ໂດຍ `options` ຈະມີຄ່າທີ່ບໍ່ຕົງກັບ variants → schema ຈັບ `ຄ່າ option ບໍ່ຄົບ` ແລະສະແດງ issue. ຈຶ່ງເພີ່ມ `disabled={tooMany}` ໃສ່ປຸ່ມ Save ໃນ `actions` (ແກ້ໃນ step ນີ້: `loading={saving} disabled={tooMany}`).

- [ ] **Step 4: ໜ້າ** `apps/admin/src/app/(app)/products/new/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { ProductCreateForm } from "@/components/products/product-create-form";

export default function NewProductPage() {
  return (
    <PermissionGate permission="inventory:write">
      <ProductCreateForm />
    </PermissionGate>
  );
}
```

- [ ] **Step 5: ຣັນ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/components/products/product-create-form.test.tsx && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS. (ຖ້າ test "ເພີ່ມ option" ລົ້ມເພາະ `getAllByPlaceholderText` ລຳດັບ ໃຫ້ກວດວ່າແຕ່ລະ `OptionRow` ມີ input ຄ່າດຽວ ແລະ index ກົງກັບລຳດັບ option.)

```bash
git add apps/admin/src/components/products/product-create-form.tsx apps/admin/src/components/products/product-create-form.test.tsx "apps/admin/src/app/(app)/products/new"
git commit -m "feat(admin): create product form with option matrix" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/products/product-create-form.tsx apps/admin/src/components/products/product-create-form.test.tsx "apps/admin/src/app/(app)/products/new"
```

---

### Task 8: ໜ້າແກ້ໄຂ `/products/[id]`

ສ່ວນ: (1) ຂໍ້ມູນທົ່ວໄປ (PATCH ສະເພາະ field ທີ່ປ່ຽນ), (2) options read-only, (3) variants ແກ້ເປັນແຖວ (PATCH ສະເພາະ field ທີ່ປ່ຽນ) + ສະຕ໋ອກຕໍ່ສາງ + ລິ້ງໄປ `/stock?q=SKU` + ເພີ່ມ variant, (4) ຮູບ (PUT), (5) ລຶບ/archive.

**Files:**
- Create: `apps/admin/src/components/products/add-variant-dialog.tsx`
- Create: `apps/admin/src/components/products/product-detail.tsx`, `product-detail.test.tsx`
- Create: `apps/admin/src/app/(app)/products/[id]/page.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ** `product-detail.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { ProductDetailDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ProductDetail } from "./product-detail";

const auth = vi.hoisted(() => ({ perms: new Set(["inventory:write", "costs:read", "costs:write"]) }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => auth.perms.has(permission) }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const product: ProductDetailDto = {
  id: "p1",
  name: "Tee",
  slug: "tee",
  description: "Soft",
  status: "DRAFT",
  categoryId: null,
  options: [{ id: "o1", name: "Color", position: 0, values: [{ id: "ov1", value: "Red", position: 0 }, { id: "ov2", value: "Blue", position: 1 }] }],
  variants: [
    { id: "v1", sku: "TEE-R", barcode: null, name: "Red", price: "100.00", compareAtPrice: null, costPrice: "60.00", weightGrams: null, isActive: true, optionValues: { Color: "Red" }, stock: [{ warehouseId: "w1", onHand: 5, reserved: 2, available: 3 }] },
    { id: "v2", sku: "TEE-B", barcode: null, name: "Blue", price: "100.00", compareAtPrice: null, costPrice: "60.00", weightGrams: null, isActive: true, optionValues: { Color: "Blue" }, stock: [] },
  ],
  images: [{ id: "i1", url: "https://x/a.png", alt: "front", position: 0, variantId: null }],
};

function mockApi(detail: ProductDetailDto = product) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/products/p1" && !options?.method) return detail;
    if (path === "/categories") return [];
    if (path === "/warehouses") return [{ id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true }];
    return detail;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.perms = new Set(["inventory:write", "costs:read", "costs:write"]);
  router.push.mockReset();
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("ProductDetail", () => {
  it("ສະແດງຂໍ້ມູນ, options (ອ່ານຢ່າງດຽວ + ຄຳອະທິບາຍ), variants ພ້ອມສະຕ໋ອກຕໍ່ສາງ ແລະ ລິ້ງໄປສະຕ໋ອກ", async () => {
    renderWithProviders(<ProductDetail id="p1" />);
    expect(await screen.findByDisplayValue("Tee")).toBeInTheDocument();
    expect(screen.getByText("Options cannot be changed after the product is created. Create a new product to change them.")).toBeInTheDocument();
    const red = screen.getByTestId("detail-variant-v1");
    expect(within(red).getByDisplayValue("TEE-R")).toBeInTheDocument();
    expect(within(red).getByText("MAIN: 3 / 2")).toBeInTheDocument();
    expect(within(red).getByRole("link", { name: "View / receive stock" })).toHaveAttribute("href", "/stock?q=TEE-R");
    expect(within(screen.getByTestId("detail-variant-v2")).getByText("No stock yet")).toBeInTheDocument();
  });

  it("ແກ້ຂໍ້ມູນທົ່ວໄປ: PATCH ສະເພາະ field ທີ່ປ່ຽນ", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.clear(screen.getByLabelText("Product name"));
    await user.type(screen.getByLabelText("Product name"), "Tee 2");
    await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/products/p1", { method: "PATCH", body: { name: "Tee 2", status: "ACTIVE" } }),
    );
  });

  it("ແກ້ລາຄາຂອງ variant: PATCH /variants/:id ສະເພາະ price (ບໍ່ສົ່ງ costPrice ທີ່ບໍ່ປ່ຽນ)", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    const row = await screen.findByTestId("detail-variant-v1");
    await user.clear(within(row).getByLabelText("Price"));
    await user.type(within(row).getByLabelText("Price"), "120");
    await user.click(within(row).getByRole("button", { name: "Save row" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/variants/v1", { method: "PATCH", body: { price: "120" } }),
    );
  });

  it("ບໍ່ມີ costs:read: ບໍ່ມີຄອລຳຕົ້ນທຶນ", async () => {
    auth.perms = new Set(["inventory:write"]);
    renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    expect(screen.queryByLabelText("Cost")).toBeNull();
  });

  it("ມີ costs:read ແຕ່ບໍ່ມີ costs:write: ເຫັນຕົ້ນທຶນແຕ່ແກ້ບໍ່ໄດ້", async () => {
    auth.perms = new Set(["inventory:write", "costs:read"]);
    renderWithProviders(<ProductDetail id="p1" />);
    const row = await screen.findByTestId("detail-variant-v1");
    expect(within(row).getByLabelText("Cost")).toBeDisabled();
  });

  it("ບັນທຶກຮູບ: PUT /products/:id/images ພ້ອມລຳດັບ ແລະ variantId", async () => {
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.selectOptions(screen.getByLabelText("Linked variant"), "v2");
    await user.click(screen.getByRole("button", { name: "Save images" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/products/p1/images", {
        method: "PUT",
        body: { images: [{ url: "https://x/a.png", alt: "front", variantId: "v2" }] },
      }),
    );
  });

  it("ລຶບ: ຢືນຢັນແລ້ວ DELETE; 204 → ກັບໄປລາຍການ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (options?.method === "DELETE") return undefined;
      if (path === "/products/p1") return product;
      return [];
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.click(screen.getByRole("button", { name: "Delete product" }));
    // ConfirmDialog ມີປຸ່ມ confirm ຊື່ດຽວກັນ (ອັນສຸດທ້າຍໃນ DOM)
    const confirm = (await screen.findAllByRole("button", { name: "Delete product" })).at(-1) as HTMLElement;
    await user.click(confirm);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products/p1", { method: "DELETE" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/products"));
  });

  it("ລຶບແລ້ວຖືກ archive (200 { archived }): ບໍ່ໄປໜ້າອື່ນ; 409 ສະແດງ error ໂດຍບໍ່ crash", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (options?.method === "DELETE") return { archived: true };
      if (path === "/products/p1") return product;
      return [];
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    await user.click(screen.getByRole("button", { name: "Delete product" }));
    const confirm = (await screen.findAllByRole("button", { name: "Delete product" })).at(-1) as HTMLElement;
    await user.click(confirm);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/products/p1", { method: "DELETE" }));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("ບໍ່ພົບສິນຄ້າ (404): ສະແດງຂໍ້ຄວາມ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "Product not found", [], "PRODUCT_NOT_FOUND"));
    renderWithProviders(<ProductDetail id="p1" />);
    expect(await screen.findByText("This product was not found")).toBeInTheDocument();
  });

  it("ບໍ່ມີ inventory:write: ຟອມອ່ານຢ່າງດຽວ ບໍ່ມີປຸ່ມບັນທຶກ/ລຶບ/ເພີ່ມ", async () => {
    auth.perms = new Set(["costs:read"]);
    renderWithProviders(<ProductDetail id="p1" />);
    await screen.findByDisplayValue("Tee");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete product" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add variant" })).toBeNull();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** → FAIL.

- [ ] **Step 3: ຂຽນ `add-variant-dialog.tsx`**

```tsx
"use client";

import { variantInputSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Select, toast } from "@oca/ui";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { formatIssues } from "@/lib/product-form";
import { useAddVariant } from "@/lib/queries";
import type { ProductDetailDto } from "@/lib/types";

export interface AddVariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetailDto;
}

export function AddVariantDialog({ open, onOpenChange, product }: AddVariantDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <AddVariantForm product={product} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddVariantForm({ product, onDone }: { product: ProductDetailDto; onDone: () => void }) {
  const { t } = useT();
  const canSetCost = useCan("costs:write");
  const add = useAddVariant();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(product.options.map((option) => [option.name, option.values[0]?.value ?? ""])),
  );
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setApiMessage(null);
    const parsed = variantInputSchema.safeParse({
      sku: sku.trim(),
      ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      price: price.trim(),
      ...(canSetCost && cost.trim() ? { costPrice: cost.trim() } : {}),
      optionValues: values,
    });
    if (!parsed.success) {
      setIssues(formatIssues(parsed.error.issues));
      return;
    }
    setIssues([]);
    setSaving(true);
    try {
      await add.mutateAsync({ productId: product.id, input: parsed.data });
      toast.success(t("products.toast.variantAdded"));
      onDone();
    } catch (error) {
      setApiMessage(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("products.variants.addTitle")} description={t("products.variants.addDescription")} />
      <DialogBody>
        {issues.length > 0 ? (
          <ul role="alert" className="list-inside list-disc rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {issues.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {apiMessage ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {apiMessage}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {product.options.map((option) => (
            <Field key={option.id} label={option.name} htmlFor={`add-variant-${option.id}`}>
              <Select
                id={`add-variant-${option.id}`}
                value={values[option.name] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [option.name]: event.target.value }))}
              >
                {option.values.map((value) => (
                  <option key={value.id} value={value.value}>
                    {value.value}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
          <Field label={t("products.variants.sku")} htmlFor="add-variant-sku" required>
            <Input id="add-variant-sku" value={sku} onChange={(event) => setSku(event.target.value)} />
          </Field>
          <Field label={t("products.variants.barcode")} htmlFor="add-variant-barcode">
            <Input id="add-variant-barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
          </Field>
          <Field label={t("products.variants.price")} htmlFor="add-variant-price" required>
            <Input id="add-variant-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
          </Field>
          {canSetCost ? (
            <Field label={t("products.variants.cost")} htmlFor="add-variant-cost">
              <Input id="add-variant-cost" inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
            </Field>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 4: ຂຽນ `product-detail.tsx`**

```tsx
"use client";

import { PRODUCT_STATUSES, type UpdateProductInput } from "@oca/shared";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  toast,
} from "@oca/ui";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { flattenCategories } from "@/lib/category-tree";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import type { ImageDraft } from "@/lib/product-form";
import {
  useCategories,
  useDeleteProduct,
  useProduct,
  usePutImages,
  useUpdateProduct,
  useUpdateVariant,
  useWarehouses,
} from "@/lib/queries";
import type { ProductDetailDto, VariantDto } from "@/lib/types";
import { AddVariantDialog } from "./add-variant-dialog";
import { ImageListEditor } from "./image-list-editor";

export function ProductDetail({ id }: { id: string }) {
  const { t } = useT();
  const query = useProduct(id);

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertCircle}
          title={notFound ? t("products.detail.notFound") : t("common.error.load")}
          action={
            notFound ? null : (
              <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <ProductDetailBody product={query.data} />;
}

function ProductDetailBody({ product }: { product: ProductDetailDto }) {
  const { t } = useT();
  const router = useRouter();
  const canWrite = useCan("inventory:write");
  const canReadCost = useCan("costs:read");
  const canWriteCost = useCan("costs:write");
  const remove = useDeleteProduct();
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function doDelete() {
    try {
      const result = await remove.mutateAsync(product.id);
      if (result?.archived) {
        toast.info(t("products.toast.archived"));
      } else {
        toast.success(t("products.toast.deleted"));
        router.push("/products");
      }
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("products.title"), product.name]}
        title={product.name}
        description={t("products.detail.title")}
        actions={
          canWrite ? (
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden="true" />
              {t("products.delete")}
            </Button>
          ) : null
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <GeneralSection product={product} canWrite={canWrite} />

        <Card className="rounded-[20px] p-6">
          <h2 className="mb-3 text-base font-bold text-ink">{t("products.section.options")}</h2>
          {product.options.length === 0 ? (
            <p className="text-sm text-ink-secondary">{t("products.variants.single")}</p>
          ) : (
            <div className="space-y-2">
              {product.options.map((option) => (
                <div key={option.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{option.name}</span>
                  {option.values.map((value) => (
                    <span key={value.id} className="rounded-full border border-line bg-subtle px-2.5 py-0.5 text-xs text-ink-secondary">
                      {value.value}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-ink-muted">{t("products.option.readonly")}</p>
        </Card>

        <Card className="rounded-[20px] p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">
              {t("products.section.variants")}{" "}
              <span className="text-sm font-normal text-ink-secondary">
                ({t("products.variants.count", { count: product.variants.length })})
              </span>
            </h2>
            {canWrite && product.options.length > 0 ? (
              <Button type="button" variant="outlinePrimary" className="rounded-lg" onClick={() => setAddOpen(true)}>
                <Plus aria-hidden="true" />
                {t("products.variants.add")}
              </Button>
            ) : null}
          </div>
          <div className="space-y-3">
            {product.variants.map((variant) => (
              <VariantRow
                key={`${variant.id}:${variant.price}:${variant.sku}:${variant.costPrice ?? ""}:${variant.isActive}:${variant.barcode ?? ""}`}
                variant={variant}
                canWrite={canWrite}
                showCost={canReadCost}
                canEditCost={canWrite && canWriteCost}
              />
            ))}
          </div>
        </Card>

        <ImagesSection product={product} canWrite={canWrite} />
      </div>

      <AddVariantDialog open={addOpen} onOpenChange={setAddOpen} product={product} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("products.deleteTitle")}
        description={t("products.deleteDescription", { name: product.name })}
        confirmLabel={t("products.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={remove.isPending}
        onConfirm={doDelete}
      />
    </div>
  );
}

function GeneralSection({ product, canWrite }: { product: ProductDetailDto; canWrite: boolean }) {
  const { t } = useT();
  const update = useUpdateProduct();
  const categories = useCategories();
  const categoryRows = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [description, setDescription] = useState(product.description ?? "");
  const [status, setStatus] = useState(product.status);
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const input: UpdateProductInput = {};
    if (name.trim() !== product.name) input.name = name.trim();
    if (slug.trim() !== product.slug) input.slug = slug.trim();
    if (description.trim() !== (product.description ?? "")) input.description = description.trim() === "" ? null : description.trim();
    if (status !== product.status) input.status = status;
    if (categoryId !== (product.categoryId ?? "")) input.categoryId = categoryId === "" ? null : categoryId;
    if (Object.keys(input).length === 0) return;
    setMessage(null);
    setSaving(true);
    try {
      await update.mutateAsync({ id: product.id, input });
      toast.success(t("products.toast.updated"));
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-[20px] p-6">
      <form onSubmit={save} noValidate>
        <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.general")}</h2>
        {message ? (
          <p role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {message}
          </p>
        ) : null}
        <fieldset disabled={!canWrite} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("products.field.name")} htmlFor="detail-name" required className="sm:col-span-2">
            <Input id="detail-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={t("products.field.category")} htmlFor="detail-category">
            <Select id="detail-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">{t("products.field.noCategory")}</option>
              {categoryRows.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {`${"— ".repeat(depth)}${category.name}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("products.field.status")} htmlFor="detail-status">
            <Select id="detail-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              {PRODUCT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`products.status.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("products.field.slug")} htmlFor="detail-slug" className="sm:col-span-2">
            <Input id="detail-slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
          </Field>
          <Field label={t("products.field.description")} htmlFor="detail-description" className="sm:col-span-2">
            <textarea
              id="detail-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
            />
          </Field>
        </fieldset>
        {canWrite ? (
          <div className="mt-4 flex justify-end">
            <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function VariantRow({
  variant,
  canWrite,
  showCost,
  canEditCost,
}: {
  variant: VariantDto;
  canWrite: boolean;
  showCost: boolean;
  canEditCost: boolean;
}) {
  const { t } = useT();
  const update = useUpdateVariant();
  const warehouses = useWarehouses();
  const [sku, setSku] = useState(variant.sku);
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const [price, setPrice] = useState(variant.price);
  const [cost, setCost] = useState(variant.costPrice ?? "");
  const [isActive, setIsActive] = useState(variant.isActive);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const codeOf = (warehouseId: string) => warehouses.data?.find((item) => item.id === warehouseId)?.code ?? warehouseId;
  const label = Object.values(variant.optionValues).join(" / ") || t("products.variants.single");

  async function save() {
    const input: Record<string, unknown> = {};
    if (sku.trim() !== variant.sku) input.sku = sku.trim();
    if (barcode.trim() !== (variant.barcode ?? "")) input.barcode = barcode.trim() === "" ? null : barcode.trim();
    if (price.trim() !== variant.price) input.price = price.trim();
    if (canEditCost && cost.trim() !== (variant.costPrice ?? "")) input.costPrice = cost.trim();
    if (isActive !== variant.isActive) input.isActive = isActive;
    if (Object.keys(input).length === 0) return;
    setMessage(null);
    setSaving(true);
    try {
      await update.mutateAsync({ id: variant.id, input });
      toast.success(t("products.toast.variantSaved"));
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid={`detail-variant-${variant.id}`} className="rounded-xl border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink">{label}</span>
        <Link
          href={`/stock?q=${encodeURIComponent(variant.sku)}`}
          className="text-xs font-semibold text-brand-ink hover:underline"
        >
          {t("products.variants.stockLink")}
        </Link>
      </div>
      {message ? (
        <p role="alert" className="mb-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {message}
        </p>
      ) : null}
      <fieldset disabled={!canWrite} className="grid grid-cols-2 items-end gap-3 md:grid-cols-6">
        <Field label={t("products.variants.sku")} htmlFor={`sku-${variant.id}`}>
          <Input id={`sku-${variant.id}`} aria-label={t("products.variants.sku")} value={sku} onChange={(event) => setSku(event.target.value)} />
        </Field>
        <Field label={t("products.variants.barcode")} htmlFor={`barcode-${variant.id}`}>
          <Input id={`barcode-${variant.id}`} aria-label={t("products.variants.barcode")} value={barcode} onChange={(event) => setBarcode(event.target.value)} />
        </Field>
        <Field label={t("products.variants.price")} htmlFor={`price-${variant.id}`}>
          <Input id={`price-${variant.id}`} aria-label={t("products.variants.price")} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
        </Field>
        {showCost ? (
          <Field label={t("products.variants.cost")} htmlFor={`cost-${variant.id}`}>
            <Input
              id={`cost-${variant.id}`}
              aria-label={t("products.variants.cost")}
              inputMode="decimal"
              value={cost}
              disabled={!canEditCost}
              onChange={(event) => setCost(event.target.value)}
            />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <Checkbox aria-label={t("products.variants.active")} checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
          {t("products.variants.active")}
        </label>
        {canWrite ? (
          <Button type="button" variant="outlinePrimary" className="rounded-lg" loading={saving} onClick={() => void save()}>
            {t("products.variants.save")}
          </Button>
        ) : null}
      </fieldset>
      <div className="mt-2 text-xs text-ink-secondary">
        <span className="font-semibold">{t("products.variants.stock")}: </span>
        {variant.stock.length === 0 ? (
          <span>{t("products.variants.noStock")}</span>
        ) : (
          variant.stock.map((level) => (
            <span key={level.warehouseId} className="mr-3 inline-block">
              {`${codeOf(level.warehouseId)}: ${level.available} / ${level.reserved}`}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function ImagesSection({ product, canWrite }: { product: ProductDetailDto; canWrite: boolean }) {
  const { t } = useT();
  const put = usePutImages();
  const initial = useMemo<ImageDraft[]>(
    () => product.images.map((image) => ({ url: image.url, alt: image.alt ?? "", variantKey: image.variantId ?? "" })),
    [product.images],
  );
  const [images, setImages] = useState<ImageDraft[]>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setMessage(null);
    setSaving(true);
    try {
      await put.mutateAsync({
        id: product.id,
        input: {
          images: images
            .filter((image) => image.url.trim() !== "")
            .map((image) => ({
              url: image.url.trim(),
              ...(image.alt.trim() ? { alt: image.alt.trim() } : {}),
              ...(image.variantKey ? { variantId: image.variantKey } : {}),
            })),
        },
      });
      toast.success(t("products.toast.imagesSaved"));
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-[20px] p-6">
      <h2 className="mb-4 text-base font-bold text-ink">{t("products.section.images")}</h2>
      {message ? (
        <p role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {message}
        </p>
      ) : null}
      <fieldset disabled={!canWrite}>
        <ImageListEditor
          images={images}
          onChange={setImages}
          variants={product.variants.map((variant) => ({
            key: variant.id,
            label: Object.values(variant.optionValues).join(" / ") || variant.sku,
          }))}
        />
      </fieldset>
      {canWrite ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" className="h-10 rounded-xl px-6 font-bold" loading={saving} onClick={() => void save()}>
            {t("products.images.save")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
```

ຂໍ້ສັງເກດ: ໃນ `VariantRow` `key` ຂອງແຖວລວມຄ່າທີ່ເກັບໃນ server ເພື່ອໃຫ້ state ຂອງແຖວ reset ຫຼັງບັນທຶກ/refetch (ແທນ `useEffect` sync). ໃນ test "ແກ້ຂໍ້ມູນທົ່ວໄປ" ຫຼັງ PATCH mock ຄືນ `detail` ເດີມ (ບໍ່ປ່ຽນ) ຈຶ່ງບໍ່ກະທົບ assert.

- [ ] **Step 5: ໜ້າ** `apps/admin/src/app/(app)/products/[id]/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { ProductDetail } from "@/components/products/product-detail";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGate permission="inventory:read">
      <ProductDetail id={id} />
    </PermissionGate>
  );
}
```

- [ ] **Step 6: ຣັນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/products && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/products/add-variant-dialog.tsx apps/admin/src/components/products/product-detail.tsx apps/admin/src/components/products/product-detail.test.tsx "apps/admin/src/app/(app)/products/[id]"
git commit -m "feat(admin): product detail page (edit, variants, images, delete/archive)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/products/add-variant-dialog.tsx apps/admin/src/components/products/product-detail.tsx apps/admin/src/components/products/product-detail.test.tsx "apps/admin/src/app/(app)/products/[id]"
```

---

### Task 9: ກວດທັງ repo + smoke

- [ ] **Step 1:** `pnpm lint && pnpm build && pnpm test` → ຂຽວທັງໝົດ.
- [ ] **Step 2: smoke ໃນ browser** (ຂັ້ນຕອນເປີດ API :3002 + admin :3100 ຄືກັບ Plan A4 Task 11; ຫ້າມແຕະ 5432/6379):
  1. `/products/new`: ສ້າງ "ເສື້ອຍືດ" ມີ option "ສີ" (ແດງ, ຟ້າ) + "ໄຊສ໌" (S, M) → ເຫັນ 4 ແຖວ, SKU ເປັນ `prefix-ເລກ` (ເພາະຄ່າລາວ), ກອກລາຄາ/ຕົ້ນທຶນ, ໃສ່ຮູບ URL ແລ້ວບັນທຶກ → ໄປໜ້າແກ້ໄຂ.
  2. ໜ້າແກ້ໄຂ: ແກ້ລາຄາແຖວໜຶ່ງ, ບັນທຶກ; ປ່ຽນສະຖານະເປັນ ACTIVE; ເພີ່ມ variant (ຄ່າທີ່ຍັງບໍ່ມີ ຖ້າທຸກຄ່າຖືກໃຊ້ແລ້ວ API ຕອບ 409 → ເຫັນຂໍ້ຄວາມແປ); ຈັດລຳດັບຮູບ ແລະບັນທຶກ.
  3. `/products`: ເຫັນສິນຄ້າ, ຄົ້ນຫາດ້ວຍ SKU, ກັ່ນຕອງສະຖານະ, ແບ່ງໜ້າ.
  4. ເຂົ້າສູ່ລະບົບເປັນ user role WAREHOUSE (ສ້າງຜ່ານ `/staff`): ບໍ່ເຫັນຄອລຳຕົ້ນທຶນ; ແກ້ລາຄາຂາຍໄດ້.
  5. ລຶບສິນຄ້າ (ທີ່ຍັງບໍ່ເຄີຍມີສະຕ໋ອກ) → ກັບລາຍການ.
- [ ] **Step 3:** ເກັບກວາດຂໍ້ມູນທົດສອບ ແລະ ຢຸດ process ທີ່ເຮົາເປີດ.
- [ ] **Step 4:** ອັບເດດ memory `phase1-progress` (A5 ສຳເລັດ; ຕໍ່ໄປ A6).

---

## Self-review

* **Spec §10 `/products`, `/products/new`, `/products/[id]`:** ຕາຕະລາງ+filter+pagination+states (Task 6), ຟອມ+options+cartesian+ຮູບ (Task 2–5, 7), ໜ້າ [id] ມີສະຕ໋ອກຕໍ່ variant/ສາງ + ລິ້ງໄປປະຫວັດ + options read-only ພ້ອມຄຳອະທິບາຍ (Task 8). ປຸ່ມຂຽນຊ່ອນຕາມ `inventory:write` ແລະ ຕົ້ນທຶນຕາມ `costs:*` (spec §6.1).
* **ສັນຍາ API:** DELETE 204 vs `{archived}` (Task 1/8), `*_NOT_FOUND` 404 ສະແດງໜ້າ "ບໍ່ພົບ" (Task 8), `costPrice` ຫາຍ/403 (Task 3, 7, 8).
* **ຊື່ສອດຄ່ອງ:** `OptionDraft`/`VariantDraft` (variant-matrix) ໃຊ້ໃນ product-form, option-editor, variant-grid; `ImageDraft` (product-form) ໃຊ້ໃນ image-list-editor ແລະ product-detail; hooks ຈາກ Task 1 ໃຊ້ໃນ Task 6–8; `ProductStatusPill` (Task 4) ໃຊ້ໃນ Task 6.
* **ຄວາມສ່ຽງທີ່ຮູ້:** error ຂອງຟອມສ້າງເປັນລາຍການ (ບໍ່ highlight cell); ການກວດ `aria` ຂອງ `Checkbox` Radix ໃນ test ໃຊ້ `getByRole("checkbox")`.
