import { PermissionGate } from "@/components/auth/permission-gate";
import { CustomerList } from "@/components/customers/customer-list";

export default function CustomersRoute() {
  return (
    <PermissionGate permission="crm:read">
      <CustomerList />
    </PermissionGate>
  );
}
