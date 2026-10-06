import { PermissionGate } from "@/components/auth/permission-gate";
import { InboxPage } from "@/components/inbox/inbox-page";

export default async function InboxRoute({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const { c } = await searchParams;
  const conversationId = typeof c === "string" && c.trim() !== "" ? c.trim() : null;
  // ຄ່າຈາກ URL ເປັນພຽງຄ່າເລີ່ມຕົ້ນຂອງການເລືອກ; key ເຮັດໃຫ້ remount ເມື່ອ URL ປ່ຽນ (ເຊັ່ນ ລິ້ງຈາກໜ້າອື່ນ)
  return (
    <PermissionGate permission="inbox:read">
      <InboxPage key={conversationId ?? "none"} initialConversationId={conversationId} />
    </PermissionGate>
  );
}
