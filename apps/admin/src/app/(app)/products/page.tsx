import { PermissionGate } from "@/components/auth/permission-gate";
import { ProductList } from "@/components/products/product-list";

export default function ProductsPage() {
  return (
    <PermissionGate permission="inventory:read">
      <ProductList />
    </PermissionGate>
  );
}
