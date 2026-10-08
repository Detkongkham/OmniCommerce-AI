import { notFound } from "next/navigation";
import { PermissionGate } from "@/components/auth/permission-gate";
import { PackPage } from "@/components/logistics/pack-page";

/** id ຂອງບິນເປັນ cuid (ໂຕອັກສອນ/ເລກ/_-); ຮູບອື່ນບໍ່ມີທາງມີຢູ່ ຈຶ່ງ 404 ໂດຍບໍ່ຍິງ API */
const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function PackRoute({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!ORDER_ID.test(orderId)) notFound();
  return (
    <PermissionGate permission="logistics:read">
      <PackPage key={orderId} orderId={orderId} />
    </PermissionGate>
  );
}
