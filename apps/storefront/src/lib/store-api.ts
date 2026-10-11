import type { Page, StoreCategory, StoreConfig, StoreOrder, StoreProductDetail, StoreProductListItem } from "./types";

/** ອາຍຸ cache ຂອງຂໍ້ມູນສິນຄ້າຝັ່ງ server (ວິນາທີ). ລາຄາ/ສະຕ໋ອກຕອນ checkout ກວດສົດສະເໝີ */
export const CATALOG_REVALIDATE_SECONDS = 60;

export class StoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`Store API responded ${status}${code ? ` (${code})` : ""}`);
    this.name = "StoreApiError";
  }
}

function apiBase(): string {
  return (process.env.API_URL || "http://localhost:3001").replace(/\/+$/, "");
}

/** ເອີ້ນ API ຈາກຝັ່ງ server (Server Component / route). `revalidate: 0` = ບໍ່ cache */
export async function storeFetch<T>(path: string, revalidate: number = CATALOG_REVALIDATE_SECONDS): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { next: { revalidate } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
    throw new StoreApiError(res.status, typeof body?.code === "string" ? body.code : undefined);
  }
  return (await res.json()) as T;
}

async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof StoreApiError && error.status === 404) return null;
    throw error;
  }
}

export function getStoreConfig(): Promise<StoreConfig> {
  return storeFetch<StoreConfig>("/store/config");
}

export function listCategories(): Promise<StoreCategory[]> {
  return storeFetch<StoreCategory[]>("/store/categories");
}

export interface ProductListParams {
  category?: string;
  q?: string;
  page?: number;
}

export function listProducts(params: ProductListParams): Promise<Page<StoreProductListItem>> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.q) query.set("q", params.q);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return storeFetch<Page<StoreProductListItem>>(`/store/products${suffix}`);
}

export function getProduct(slug: string): Promise<StoreProductDetail | null> {
  return orNull(storeFetch<StoreProductDetail>(`/store/products/${encodeURIComponent(slug)}`));
}

/** ບິນບໍ່ cache: ສະຖານະ ແລະ ເວລາຈອງຕ້ອງສົດ */
export function getOrder(token: string): Promise<StoreOrder | null> {
  return orNull(storeFetch<StoreOrder>(`/store/orders/${encodeURIComponent(token)}`, 0));
}
