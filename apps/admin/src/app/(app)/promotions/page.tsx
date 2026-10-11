import { PermissionGate } from "@/components/auth/permission-gate";
import { CouponList } from "@/components/promotion/coupon-list";

export default function PromotionsRoute() {
  return (
    <PermissionGate permission="promotion:read">
      <CouponList />
    </PermissionGate>
  );
}
