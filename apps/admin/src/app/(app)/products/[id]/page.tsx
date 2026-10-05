import { PermissionGate } from "@/components/auth/permission-gate";
import { ProductDetail } from "@/components/products/product-detail";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGate permission="inventory:read">
      <ProductDetail id={id} />
    </PermissionGate>
  );
}
