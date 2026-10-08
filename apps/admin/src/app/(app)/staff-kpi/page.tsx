import { PermissionGate } from "@/components/auth/permission-gate";
import { StaffKpiPage } from "@/components/staff-kpi/staff-kpi-page";

export default function StaffKpiRoute() {
  return (
    <PermissionGate permission="staff:read">
      <StaffKpiPage />
    </PermissionGate>
  );
}
