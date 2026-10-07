export type PageItem = number | "ellipsis-start" | "ellipsis-end";

/** ຕົວເລືອກຕໍ່ໜ້າຕາມ DESIGN.md §9.9; 0 = ທັງໝົດ. */
export const PAGE_SIZE_OPTIONS = [10, 30, 50, 0] as const;

/** ຫຼາຍກວ່າ 7 ໜ້າ ຫຍໍ້ເປັນ `1 … x-1 x x+1 … ສຸດທ້າຍ`. */
export function getPageItems(current: number, total: number): PageItem[] {
  const last = Math.max(1, total);
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);
  const from = Math.max(2, current - 1);
  const to = Math.min(last - 1, current + 1);
  const items: PageItem[] = [1];
  if (from > 2) items.push("ellipsis-start");
  for (let page = from; page <= to; page++) items.push(page);
  if (to < last - 1) items.push("ellipsis-end");
  items.push(last);
  return items;
}

export interface PageSlice<T> {
  rows: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const total = items.length;
  const size = pageSize <= 0 ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * size;
  const rows = items.slice(start, start + size);
  return {
    rows,
    page: current,
    pageSize,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
  };
}
