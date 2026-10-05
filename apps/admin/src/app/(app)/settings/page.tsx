import { PermissionGate } from "@/components/auth/permission-gate";
import { StoreSettingsForm } from "@/components/settings/store-settings-form";

export default function SettingsPage() {
  return (
    <PermissionGate permission="inventory:read">
      <StoreSettingsForm />
    </PermissionGate>
  );
}
