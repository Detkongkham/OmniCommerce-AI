"use client";

import type { OrderStatus } from "@oca/shared";
import { StatusPill, type StatusTone } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

const TONES: Record<OrderStatus, StatusTone> = {
  PENDING_PAYMENT: "warning",
  PAID: "info",
  PACKING: "brand",
  SHIPPED: "brand",
  COMPLETED: "success",
  CANCELLED: "neutral",
  EXPIRED: "danger",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const { t } = useT();
  return <StatusPill tone={TONES[status]}>{t(`orders.status.${status}`)}</StatusPill>;
}
