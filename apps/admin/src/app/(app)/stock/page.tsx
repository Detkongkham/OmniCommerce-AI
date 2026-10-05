import { PermissionGate } from "@/components/auth/permission-gate";
import { StockPage } from "@/components/stock/stock-page";

export default async function StockRoute({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; tab?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = Array.isArray(params.q) ? (params.q[0] ?? "") : (params.q ?? "");
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab = tab === "movements" ? "movements" : "levels";
  return (
    <PermissionGate permission="inventory:read">
      {/* key: remount ເມື່ອ ?q=/?tab= ປ່ຽນ ເພາະ StockLevels ອ່ານ initialQuery ຕອນ mount ເທົ່ານັ້ນ */}
      <StockPage key={`${initialTab}:${q}`} initialQuery={q} initialTab={initialTab} />
    </PermissionGate>
  );
}
