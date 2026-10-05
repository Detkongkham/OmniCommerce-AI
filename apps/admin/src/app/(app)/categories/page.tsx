import { PermissionGate } from "@/components/auth/permission-gate";
import { CategoryList } from "@/components/categories/category-list";

export default function CategoriesPage() {
  return (
    <PermissionGate permission="inventory:read">
      <CategoryList />
    </PermissionGate>
  );
}
