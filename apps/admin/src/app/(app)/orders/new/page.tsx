import { PermissionGate } from "@/components/auth/permission-gate";
import { OrderForm } from "@/components/orders/order-form";

export default function NewOrderPage() {
  return (
    <PermissionGate permission={["orders:write", "inventory:read"]}>
      <OrderForm />
    </PermissionGate>
  );
}
