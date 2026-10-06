import type {
  AdjustStockInput,
  CreateCategoryInput,
  CreateOrderInput,
  CreateStaffInput,
  CreateWarehouseInput,
  PutProductImagesInput,
  ReceiveStockInput,
  ReturnStockInput,
  RoleInput,
  TransferStockInput,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateStaffInput,
  UpdateStoreSettingsInput,
  UpdateVariantInput,
  UpdateWarehouseInput,
  createProductSchema,
  variantInputSchema,
} from "@oca/shared";
import type { z } from "zod";
import { useCallback } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { toQueryString } from "./query-string";
import type {
  CategoryDto,
  CustomerDto,
  OrderDetailDto,
  OrderListItemDto,
  Page,
  ProductDetailDto,
  ProductListItemDto,
  RoleDto,
  StaffDto,
  StockLevelDto,
  StockMovementDto,
  StoreSettingsDto,
  VariantDto,
  VariantSearchItemDto,
  WarehouseDto,
} from "./types";

export const queryKeys = {
  staff: ["staff"] as const,
  roles: ["roles"] as const,
  warehouses: ["warehouses"] as const,
  categories: ["categories"] as const,
  storeSettings: ["store-settings"] as const,
  products: ["products"] as const,
  stock: ["stock"] as const,
  variants: ["variants"] as const,
  orders: ["orders"] as const,
  customers: ["customers"] as const,
};

export function useStaffList() {
  return useQuery({ queryKey: queryKeys.staff, queryFn: () => apiFetch<StaffDto[]>("/staff") });
}

export function useRoleList() {
  return useQuery({ queryKey: queryKeys.roles, queryFn: () => apiFetch<RoleDto[]>("/roles") });
}

/** ຄືນ callback ທີ່ invalidate query key ທີ່ໃຫ້ມາທັງໝົດ (ໃຊ້ເປັນ onSuccess ຂອງ mutation). */
function useInvalidate(...keys: (readonly string[])[]) {
  const queryClient = useQueryClient();
  return () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useCreateStaff() {
  const invalidate = useInvalidate(queryKeys.staff, queryKeys.roles);
  return useMutation({
    mutationFn: (input: CreateStaffInput) => apiFetch<StaffDto>("/staff", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateStaff() {
  const invalidate = useInvalidate(queryKeys.staff, queryKeys.roles);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStaffInput }) =>
      apiFetch<StaffDto>(`/staff/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useSaveRole() {
  const invalidate = useInvalidate(queryKeys.roles, queryKeys.staff);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RoleInput }) =>
      id
        ? apiFetch<RoleDto>(`/roles/${id}`, { method: "PUT", body: input })
        : apiFetch<RoleDto>("/roles", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidate(queryKeys.roles);
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Inventory: ສາງ / ໝວດໝູ່ / ຕັ້ງຄ່າຮ້ານ
// ---------------------------------------------------------------------------
export function useWarehouses() {
  return useQuery({ queryKey: queryKeys.warehouses, queryFn: () => apiFetch<WarehouseDto[]>("/warehouses") });
}

export function useCreateWarehouse() {
  const invalidate = useInvalidate(queryKeys.warehouses);
  return useMutation({
    mutationFn: (input: CreateWarehouseInput) => apiFetch<WarehouseDto>("/warehouses", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateWarehouse() {
  const invalidate = useInvalidate(queryKeys.warehouses, queryKeys.stock, queryKeys.variants);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWarehouseInput }) =>
      apiFetch<WarehouseDto>(`/warehouses/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useSetDefaultWarehouse() {
  const invalidate = useInvalidate(queryKeys.warehouses, queryKeys.stock, queryKeys.variants);
  return useMutation({
    mutationFn: (id: string) => apiFetch<WarehouseDto>(`/warehouses/${id}/default`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: () => apiFetch<CategoryDto[]>("/categories") });
}

export function useSaveCategory() {
  const invalidate = useInvalidate(queryKeys.categories, queryKeys.products);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateCategoryInput | UpdateCategoryInput }) =>
      id
        ? apiFetch<CategoryDto>(`/categories/${id}`, { method: "PATCH", body: input })
        : apiFetch<CategoryDto>("/categories", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate(queryKeys.categories, queryKeys.products);
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useStoreSettings() {
  return useQuery({ queryKey: queryKeys.storeSettings, queryFn: () => apiFetch<StoreSettingsDto>("/settings/store") });
}

export function useUpdateStoreSettings() {
  const invalidate = useInvalidate(queryKeys.storeSettings);
  return useMutation({
    mutationFn: (input: UpdateStoreSettingsInput) =>
      apiFetch<StoreSettingsDto>("/settings/store", { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

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

// ສ້າງ/ແກ້/ລຶບສິນຄ້າປ່ຽນ CategoryDto.productCount ຈຶ່ງ invalidate categories ນຳ
export function useCreateProduct() {
  const invalidate = useInvalidate(queryKeys.products, queryKeys.categories);
  return useMutation({
    // the request side of the schema: costPrice is optional (defaults to "0" server-side)
    mutationFn: (input: z.input<typeof createProductSchema>) => apiFetch<ProductDetailDto>("/products", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidate(queryKeys.products, queryKeys.variants, queryKeys.stock, queryKeys.categories);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      apiFetch<ProductDetailDto>(`/products/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

/**
 * 204 → undefined (ລຶບແທ້); 200 → { archived: true } (ຖືກ archive ເພາະເຄີຍຖືກຂາຍ).
 * ເມື່ອລຶບແທ້ ຕ້ອງເອົາ detail query ຂອງ id ນັ້ນອອກຈາກ cache ກ່ອນ invalidate ບໍ່ດັ່ງນັ້ນໜ້າແກ້ໄຂທີ່ຍັງ mount
 * ຢູ່ຈະ refetch ແລ້ວໄດ້ 404.
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidate(queryKeys.products, queryKeys.variants, queryKeys.stock, queryKeys.categories);
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ archived: true } | undefined>(`/products/${id}`, { method: "DELETE" }),
    onSuccess: (result, id) => {
      if (!result) queryClient.removeQueries({ queryKey: [...queryKeys.products, "detail", id] });
      return invalidate();
    },
  });
}

// the request side of the schema: costPrice is optional (users without costs:write must not send it)
export function useAddVariant() {
  const invalidate = useInvalidate(queryKeys.products, queryKeys.variants, queryKeys.stock);
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: z.input<typeof variantInputSchema> }) =>
      apiFetch<VariantDto>(`/products/${productId}/variants`, { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateVariant() {
  const invalidate = useInvalidate(queryKeys.products, queryKeys.variants, queryKeys.stock);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateVariantInput }) =>
      apiFetch<VariantDto>(`/variants/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function usePutImages() {
  const invalidate = useInvalidate(queryKeys.products, queryKeys.variants, queryKeys.stock);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PutProductImagesInput }) =>
      apiFetch<ProductDetailDto>(`/products/${id}/images`, { method: "PUT", body: input }),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// ສະຕ໋ອກ
// ---------------------------------------------------------------------------
export interface StockListParams {
  q?: string;
  warehouseId?: string;
  lowStock?: boolean;
  page: number;
  pageSize: number;
}

export function useStockLevels(params: StockListParams) {
  return useQuery({
    queryKey: [...queryKeys.stock, "levels", params],
    queryFn: () => apiFetch<Page<StockLevelDto>>(`/stock${toQueryString({ ...params, lowStock: params.lowStock ? true : undefined })}`),
    placeholderData: keepPreviousData,
  });
}

export interface StockMovementParams {
  type?: string;
  variantId?: string;
  warehouseId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export function useStockMovements(params: StockMovementParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    // ໝາຍເຫດ: ເມື່ອ enabled=false ແລະ ບໍ່ມີຂໍ້ມູນ isPending ຍັງເປັນ true (ຜູ້ໃຊ້ຕ້ອງບໍ່ສະແດງ skeleton ຈາກມັນ)
    enabled: options.enabled ?? true,
    queryKey: [...queryKeys.stock, "movements", params],
    queryFn: () => apiFetch<Page<StockMovementDto>>(`/stock/movements${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

/** ຄົ້ນຫາ variant (autocomplete): ບໍ່ຍິງເມື່ອ q ເປົ່າ */
export function useVariantSearch(params: { q: string; includeInactive?: boolean; pageSize?: number }) {
  const q = params.q.trim();
  const pageSize = params.pageSize ?? 8;
  return useQuery({
    queryKey: [...queryKeys.variants, "search", q, params.includeInactive ?? false, pageSize],
    queryFn: () =>
      apiFetch<Page<VariantSearchItemDto>>(
        `/variants${toQueryString({ q, includeInactive: params.includeInactive ? true : undefined, page: 1, pageSize })}`,
      ),
    enabled: q !== "",
  });
}

export type StockOpMode = "receive" | "adjust" | "transfer" | "return";
export type StockOpInput = ReceiveStockInput | AdjustStockInput | TransferStockInput | ReturnStockInput;

export function useStockOperation() {
  const invalidate = useInvalidate(queryKeys.stock, queryKeys.products, queryKeys.variants);
  return useMutation({
    mutationFn: ({ mode, input }: { mode: StockOpMode; input: StockOpInput }) =>
      apiFetch<unknown>(`/stock/${mode}`, { method: "POST", body: input }),
    onSuccess: invalidate,
    // ລົ້ມ (ເຊັ່ນ 409 INSUFFICIENT_STOCK) ຕົວເລກທີ່ສະແດງອາດເກົ່າ → refetch
    onError: invalidate,
  });
}

export function useSetThreshold() {
  const invalidate = useInvalidate(queryKeys.stock);
  return useMutation({
    mutationFn: ({ id, lowStockThreshold }: { id: string; lowStockThreshold: number | null }) =>
      apiFetch<StockLevelDto>(`/stock/${id}/threshold`, { method: "PATCH", body: { lowStockThreshold } }),
    onSuccess: invalidate,
    // ລົ້ມ (ເຊັ່ນ 409 INSUFFICIENT_STOCK) ຕົວເລກທີ່ສະແດງອາດເກົ່າ → refetch
    onError: invalidate,
  });
}

// ---------------------------------------------------------------------------
// ຄຳສັ່ງຊື້
// ---------------------------------------------------------------------------
export interface OrderListParams {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export function useOrders(params: OrderListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    // ໝາຍເຫດ: ເມື່ອ enabled=false ແລະ ບໍ່ມີຂໍ້ມູນ isPending ຍັງເປັນ true (ຜູ້ໃຊ້ຕ້ອງບໍ່ສະແດງ skeleton ຈາກມັນ)
    enabled: options.enabled ?? true,
    queryKey: [...queryKeys.orders, "list", params],
    queryFn: () => apiFetch<Page<OrderListItemDto>>(`/orders${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

/**
 * ບິນທີ່ຍັງ PENDING_PAYMENT ແຕ່ນັບຖອຍຮອດ 0 (worker ຍັງບໍ່ໄດ້ expire) → poll ຈົນສະຖານະປ່ຽນ:
 * API ບອກ 0 = ທຸກ 15 ວິ; `clientExpiredAt` (client ນັບຮອດ 0 ແຕ່ API ຍັງບອກເຫຼືອ) = ທຸກ 5 ວິ.
 * `clientExpiredAt` ຄື dataUpdatedAt ຂອງຂໍ້ມູນທີ່ນັບຮອດ 0: ໄດ້ຂໍ້ມູນໃໝ່ແລ້ວ ການ poll ຢຸດຈົນນັບຮອດ 0 ອີກ.
 * interval ລອງໃໝ່ເອງເມື່ອ refetch ລົ້ມ ແລະ ມີຂອບເຂດ (ບໍ່ຍິງທຸກວິ ເຖິງ server ຍັງບອກເຫຼືອ ≥1).
 */
export function useOrder(id: string, options: { clientExpiredAt?: number | null } = {}) {
  const { clientExpiredAt = null } = options;
  return useQuery({
    queryKey: [...queryKeys.orders, "detail", id],
    queryFn: () => apiFetch<OrderDetailDto>(`/orders/${id}`),
    refetchInterval: (query) => {
      const order = query.state.data;
      if (order?.status !== "PENDING_PAYMENT") return false;
      if (order.secondsUntilExpiry === 0) return 15_000;
      return clientExpiredAt !== null && clientExpiredAt === query.state.dataUpdatedAt ? 5_000 : false;
    },
  });
}

/**
 * ບິນຫຼ້າສຸດໃນ cache ແບບທັນທີ (ບໍ່ຜ່ານ render): ຫຼັງ refetch ສຳເລັດ React ອາດຍັງບໍ່ທັນ render ຂໍ້ມູນໃໝ່
 * ຜູ້ເອີ້ນຈຶ່ງໃຊ້ອັນນີ້ ເມື່ອຕ້ອງຮູ້ສະຖານະຈິງ ທັນທີຫຼັງ await action.
 */
export function useOrderSnapshot(id: string) {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.getQueryData<OrderDetailDto>([...queryKeys.orders, "detail", id]), [queryClient, id]);
}

/** ບິນໃໝ່ຈອງສະຕ໋ອກ ແລະ ອາດສ້າງລູກຄ້າໃໝ່ → invalidate orders/stock/products/variants/customers */
export function useCreateOrder() {
  const invalidate = useInvalidate(queryKeys.orders, queryKeys.stock, queryKeys.products, queryKeys.variants, queryKeys.customers);
  return useMutation({
    // idempotencyKey: ຄີດຽວກັນ + body ດຽວກັນ = API ຄືນບິນເດີມ (ລອງໃໝ່ຫຼັງ network ລົ້ມໄດ້ໂດຍບໍ່ສ້າງບິນຊ້ຳ)
    mutationFn: ({ input, idempotencyKey }: { input: CreateOrderInput; idempotencyKey: string }) =>
      apiFetch<OrderDetailDto>("/orders", { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey } }),
    onSuccess: invalidate,
  });
}

export type OrderAction = "pay" | "pack" | "ship" | "complete" | "cancel";

export function useOrderAction() {
  const invalidate = useInvalidate(queryKeys.orders, queryKeys.stock, queryKeys.products, queryKeys.variants);
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: OrderAction; reason?: string }) =>
      apiFetch<OrderDetailDto>(
        `/orders/${id}/${action}`,
        action === "cancel" ? { method: "POST", body: reason ? { reason } : {} } : { method: "POST" },
      ),
    onSuccess: invalidate,
    // ຖ້າລົ້ມ (ເຊັ່ນ ORDER_INVALID_STATE/RESERVATION_EXPIRED) ບິນອາດຖືກປ່ຽນໄປແລ້ວ → refetch ໃຫ້ສະແດງສະຖານະຫຼ້າສຸດ
    onError: invalidate,
  });
}

/** ຄົ້ນຫາລູກຄ້າ (ຟອມບິນ): ບໍ່ຍິງເມື່ອ q ເປົ່າ */
export function useCustomers(params: { q: string }) {
  const q = params.q.trim();
  return useQuery({
    queryKey: [...queryKeys.customers, q],
    queryFn: () => apiFetch<Page<CustomerDto>>(`/customers${toQueryString({ q, page: 1, pageSize: 8 })}`),
    enabled: q !== "",
  });
}
