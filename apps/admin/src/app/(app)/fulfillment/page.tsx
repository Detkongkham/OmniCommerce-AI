import { PermissionGate } from "@/components/auth/permission-gate";
import { FulfillmentQueue } from "@/components/logistics/fulfillment-queue";

export default function FulfillmentRoute() {
  return (
    <PermissionGate permission="logistics:read">
      <FulfillmentQueue />
    </PermissionGate>
  );
}
