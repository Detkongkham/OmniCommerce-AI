import type {
  CreateCategoryInput,
  CreateProductInput,
  CreateStaffInput,
  CreateWarehouseInput,
  PutProductImagesInput,
  RoleInput,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateStaffInput,
  UpdateStoreSettingsInput,
  UpdateVariantInput,
  UpdateWarehouseInput,
  VariantInput,
} from "@oca/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { toQueryString } from "./query-string";
import type {
  CategoryDto,
  Page,
  ProductDetailDto,
  ProductListItemDto,
  RoleDto,
  StaffDto,
  StoreSettingsDto,
  VariantDto,
  WarehouseDto,
} from "./types";

export const queryKeys = {
  staff: ["staff"] as const,
  roles: ["roles"] as const,
  warehouses: ["warehouses"] as const,
  categories: ["categories"] as const,
  storeSettings: ["store-settings"] as const,
  products: ["products"] as const,
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
  const invalidate = useInvalidate(queryKeys.warehouses);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWarehouseInput }) =>
      apiFetch<WarehouseDto>(`/warehouses/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useSetDefaultWarehouse() {
  const invalidate = useInvalidate(queryKeys.warehouses);
  return useMutation({
    mutationFn: (id: string) => apiFetch<WarehouseDto>(`/warehouses/${id}/default`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: () => apiFetch<CategoryDto[]>("/categories") });
}

export function useSaveCategory() {
  const invalidate = useInvalidate(queryKeys.categories);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateCategoryInput | UpdateCategoryInput }) =>
      id
        ? apiFetch<CategoryDto>(`/categories/${id}`, { method: "PATCH", body: input })
        : apiFetch<CategoryDto>("/categories", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate(queryKeys.categories);
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
