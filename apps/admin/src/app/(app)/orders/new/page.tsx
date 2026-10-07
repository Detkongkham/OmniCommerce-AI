import { PermissionGate } from "@/components/auth/permission-gate";
import { ChatOrderPage } from "@/components/orders/chat-order-page";
import { OrderForm } from "@/components/orders/order-form";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string | string[] }>;
}) {
  const { conversationId } = await searchParams;
  const chatId = typeof conversationId === "string" && conversationId.trim() !== "" ? conversationId.trim() : null;
  if (chatId) {
    // ບິນຈາກແຊັດ: ນອກຈາກສິດສ້າງບິນ ຕ້ອງ inbox:write (API ບັງຄັບຄືກັນ) ເພາະຜູກເຄສ + ສົ່ງສະຫຼຸບເຂົ້າແຊັດ
    return (
      <PermissionGate permission={["orders:write", "inventory:read", "inbox:write"]}>
        {/* key ເຮັດໃຫ້ remount ເມື່ອ URL ປ່ຽນເຄສ (state ຂອງຟອມ/ຜົນລັບບໍ່ຮົ່ວຂ້າມເຄສ) */}
        <ChatOrderPage key={chatId} conversationId={chatId} />
      </PermissionGate>
    );
  }
  return (
    <PermissionGate permission={["orders:write", "inventory:read"]}>
      <OrderForm />
    </PermissionGate>
  );
}
