import { PermissionGate } from "@/components/auth/permission-gate";
import { StaffList } from "@/components/staff/staff-list";

export default function StaffPage() {
  return (
    <PermissionGate permission="staff:read">
      <StaffList />
    </PermissionGate>
  );
}
