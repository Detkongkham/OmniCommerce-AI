import { AnalyticsPage } from "@/components/analytics/analytics-page";
import { PermissionGate } from "@/components/auth/permission-gate";

export default function AnalyticsRoute() {
  return (
    <PermissionGate permission="analytics:read">
      <AnalyticsPage />
    </PermissionGate>
  );
}
