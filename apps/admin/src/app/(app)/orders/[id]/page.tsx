import { notFound } from "next/navigation";
import { PermissionGate } from "@/components/auth/permission-gate";
import { OrderDetail } from "@/components/orders/order-detail";

/** id ຂອງບິນເປັນ cuid (ໂຕອັກສອນ/ເລກ/_-); ຮູບອື່ນບໍ່ມີທາງມີຢູ່ ຈຶ່ງ 404 ໂດຍບໍ່ຍິງ API */
const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ORDER_ID.test(id)) notFound();
  return (
    <PermissionGate permission="orders:read">
      <OrderDetail id={id} />
    </PermissionGate>
  );
}
