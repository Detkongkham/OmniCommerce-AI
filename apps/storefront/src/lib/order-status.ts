import type { OrderStatus } from "@oca/shared";
import type { StatusTone } from "@oca/ui";

/** ຂັ້ນຕອນທີ່ລູກຄ້າເຫັນໃນໜ້າບິນ */
export const ORDER_STEPS: readonly { status: OrderStatus; label: string }[] = [
  { status: "PENDING_PAYMENT", label: "ລໍຖ້າຊຳລະ" },
  { status: "PAID", label: "ຊຳລະແລ້ວ" },
  { status: "PACKING", label: "ກຳລັງແພັກ" },
  { status: "SHIPPED", label: "ສົ່ງແລ້ວ" },
];

/** ຕຳແໜ່ງໃນ ORDER_STEPS; -1 = ບິນທີ່ບໍ່ຢູ່ໃນເສັ້ນທາງປົກກະຕິ (ຍົກເລີກ/ໝົດອາຍຸ) */
export function orderStepIndex(status: OrderStatus): number {
  if (status === "COMPLETED") return ORDER_STEPS.length - 1;
  return ORDER_STEPS.findIndex((step) => step.status === status);
}

const LABELS: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  PENDING_PAYMENT: { label: "ລໍຖ້າຊຳລະ", tone: "warning" },
  PAID: { label: "ຊຳລະແລ້ວ", tone: "success" },
  PACKING: { label: "ກຳລັງແພັກ", tone: "info" },
  SHIPPED: { label: "ສົ່ງແລ້ວ", tone: "info" },
  COMPLETED: { label: "ສຳເລັດ", tone: "success" },
  CANCELLED: { label: "ຍົກເລີກແລ້ວ", tone: "danger" },
  EXPIRED: { label: "ໝົດເວລາຊຳລະ", tone: "neutral" },
};

export function orderStatusLabel(status: OrderStatus): { label: string; tone: StatusTone } {
  return LABELS[status];
}
