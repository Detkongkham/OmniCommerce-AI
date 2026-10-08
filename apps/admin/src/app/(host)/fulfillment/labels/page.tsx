import { PermissionGate } from "@/components/auth/permission-gate";
import { ShippingLabels } from "@/components/logistics/shipping-labels";

/** /fulfillment/labels?ids=a,b,c — ໜ້າພິມໃບປະໜ້າ (ບໍ່ມີ sidebar/topbar) */
export default async function LabelsRoute({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const { ids } = await searchParams;
  const raw = Array.isArray(ids) ? ids.join(",") : (ids ?? "");
  const list = [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)))];
  return (
    <PermissionGate permission="logistics:read">
      <ShippingLabels ids={list} />
    </PermissionGate>
  );
}
