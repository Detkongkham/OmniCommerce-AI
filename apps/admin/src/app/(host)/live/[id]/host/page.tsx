import { notFound } from "next/navigation";
import { PermissionGate } from "@/components/auth/permission-gate";
import { HostScreen } from "@/components/live/host-screen";

/** id ຂອງ session ເປັນ cuid (ໂຕອັກສອນ/ເລກ/_-); ຮູບອື່ນບໍ່ມີທາງມີຢູ່ ຈຶ່ງ 404 ໂດຍບໍ່ຍິງ API */
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function LiveHostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SESSION_ID.test(id)) notFound();
  return (
    <PermissionGate permission="live-cf:read">
      <HostScreen key={id} id={id} />
    </PermissionGate>
  );
}
