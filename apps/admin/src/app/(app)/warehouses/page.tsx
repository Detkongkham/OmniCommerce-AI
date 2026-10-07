import { PermissionGate } from "@/components/auth/permission-gate";
import { WarehouseList } from "@/components/warehouses/warehouse-list";

export default function WarehousesPage() {
  return (
    <PermissionGate permission="inventory:read">
      <WarehouseList />
    </PermissionGate>
  );
}
