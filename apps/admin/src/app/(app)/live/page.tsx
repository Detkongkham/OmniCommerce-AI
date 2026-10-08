import { PermissionGate } from "@/components/auth/permission-gate";
import { SessionList } from "@/components/live/session-list";

export default function LiveRoute() {
  return (
    <PermissionGate permission="live-cf:read">
      <SessionList />
    </PermissionGate>
  );
}
