import { PermissionGate } from "@/components/auth/permission-gate";
import { CourierList } from "@/components/logistics/courier-list";

export default function CouriersRoute() {
  return (
    <PermissionGate permission="logistics:read">
      <CourierList />
    </PermissionGate>
  );
}
