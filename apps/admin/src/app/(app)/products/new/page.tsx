import { PermissionGate } from "@/components/auth/permission-gate";
import { ProductCreateForm } from "@/components/products/product-create-form";

export default function NewProductPage() {
  return (
    <PermissionGate permission="inventory:write">
      <ProductCreateForm />
    </PermissionGate>
  );
}
