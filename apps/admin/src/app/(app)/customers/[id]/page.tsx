import { notFound } from "next/navigation";
import { PermissionGate } from "@/components/auth/permission-gate";
import { CustomerDetail } from "@/components/customers/customer-detail";

const CUSTOMER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CUSTOMER_ID.test(id)) notFound();
  return (
    <PermissionGate permission="crm:read">
      {/* key = id: ໄປລູກຄ້າອື່ນ (ເຊັ່ນ ຫຼັງລວມ) ແລ້ວ state ເກົ່າບໍ່ຕິດໄປ */}
      <CustomerDetail key={id} id={id} />
    </PermissionGate>
  );
}
