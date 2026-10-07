import { PermissionGate } from "@/components/auth/permission-gate";
import { StockPage } from "@/components/stock/stock-page";
import { parseStockSearchParams } from "@/components/stock/stock-search-params";

export default async function StockRoute({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; tab?: string | string[] }>;
}) {
  const { q, tab } = parseStockSearchParams(await searchParams);
  // ຄ່າຈາກ server ເປັນພຽງຄ່າເລີ່ມຕົ້ນ; ຫຼັງຈາກນັ້ນ StockPage ຕາມ URL ຝັ່ງ client (useSearchParams).
  return (
    <PermissionGate permission="inventory:read">
      <StockPage initialQuery={q} initialTab={tab} />
    </PermissionGate>
  );
}
