import { PermissionGate } from "@/components/auth/permission-gate";
import { PromotionsPage } from "@/components/promotion/promotions-page";

export default function PromotionsRoute() {
  return (
    <PermissionGate permission="promotion:read">
      <PromotionsPage />
    </PermissionGate>
  );
}
