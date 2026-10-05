export type StockTab = "levels" | "movements";

type Raw = string | string[] | null | undefined;

function first(value: Raw): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** ແປງ ?q=&tab= (ຈາກ server searchParams ຫຼື URLSearchParams) ເປັນຄ່າທີ່ປອດໄພ. */
export function parseStockSearchParams(params: { q?: Raw; tab?: Raw }): { q: string; tab: StockTab } {
  return {
    q: first(params.q).trim(),
    tab: first(params.tab) === "movements" ? "movements" : "levels",
  };
}
