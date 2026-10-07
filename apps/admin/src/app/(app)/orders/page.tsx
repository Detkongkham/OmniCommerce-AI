import { PermissionGate } from "@/components/auth/permission-gate";
import { OrderList } from "@/components/orders/order-list";
import { parseOrderSearchParams } from "@/components/orders/order-search-params";

export default async function OrdersRoute({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const { q, status } = parseOrderSearchParams(await searchParams);
  // ຄ່າຈາກ URL ເປັນພຽງຄ່າເລີ່ມຕົ້ນ; filter ຫຼັງຈາກນັ້ນຢູ່ໃນ state ຂອງ component (ບໍ່ຂຽນກັບລົງ URL).
  // key ເຮັດໃຫ້ remount ເມື່ອ URL ປ່ຽນ (ເຊັ່ນ ລິ້ງຈາກໜ້າອື່ນ) ເພື່ອໃຫ້ filter ຕາມ URL.
  return (
    <PermissionGate permission="orders:read">
      <OrderList key={`${q}|${status}`} initialQuery={q} initialStatus={status} />
    </PermissionGate>
  );
}
