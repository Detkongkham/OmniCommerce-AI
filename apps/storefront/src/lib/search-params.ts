import { SLUG_PATTERN } from "@oca/shared";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ProductsQuery {
  category: string | undefined;
  q: string | undefined;
  page: number;
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * ແປ query ຂອງ /products ໃຫ້ຢູ່ໃນຂອບເຂດທີ່ API ຮັບ (ຄົນພິມ URL ເອງ/bot ສົ່ງຄ່າແປກ ບໍ່ຄວນໄດ້ໜ້າ error).
 */
export function parseProductsParams(raw: RawSearchParams): ProductsQuery {
  const category = first(raw.category)?.trim();
  const q = first(raw.q)?.trim().slice(0, 100);
  const pageText = first(raw.page) ?? "";
  const page = /^\d{1,9}$/.test(pageText) ? Number(pageText) : 1;
  return {
    category: category && category.length <= 100 && SLUG_PATTERN.test(category) ? category : undefined,
    q: q || undefined,
    page: Math.min(Math.max(page, 1), 10_000),
  };
}
