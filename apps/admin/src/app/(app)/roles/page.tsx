import { PermissionGate } from "@/components/auth/permission-gate";
import { RolesList } from "@/components/roles/roles-list";

export default function RolesPage() {
  return (
    <PermissionGate permission="staff:read">
      <RolesList />
    </PermissionGate>
  );
}
