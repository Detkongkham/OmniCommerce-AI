"use client";

import { Card } from "@oca/ui";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import type { OrderDetailDto } from "@/lib/types";

/** ເສັ້ນເວລາ: ສະແດງສະເພາະຂັ້ນທີ່ເກີດແລ້ວ ເປັນຂໍ້ຄວາມ + ເວລາ (ບໍ່ອາໄສສີຢ່າງດຽວ) */
export function OrderTimeline({ order }: { order: OrderDetailDto }) {
  const { t } = useT();
  const entries: { key: string; label: string; at: string | null }[] = [
    { key: "created", label: t("orders.detail.createdAt"), at: order.createdAt },
    { key: "paid", label: t("orders.detail.paidAt"), at: order.paidAt },
    { key: "shipped", label: t("orders.detail.shippedAt"), at: order.shippedAt },
    { key: "completed", label: t("orders.detail.completedAt"), at: order.completedAt },
    { key: "cancelled", label: t("orders.detail.cancelledAt"), at: order.cancelledAt },
    // ບິນໝົດເວລາຈອງ ບໍ່ມີເວລາ expire ແຍກ: ໃຊ້ເວລາສິ້ນສຸດການຈອງ
    { key: "expired", label: t("orders.detail.expiredAt"), at: order.status === "EXPIRED" ? order.reservedUntil : null },
  ];
  return (
    <Card className="rounded-[20px] p-6">
      <h2 id="order-timeline-heading" className="mb-3 text-base font-bold text-ink">
        {t("orders.detail.timeline")}
      </h2>
      <ol role="list" aria-labelledby="order-timeline-heading" className="space-y-2 text-sm">
        {entries
          .filter((entry) => entry.at !== null)
          .map((entry) => (
            <li key={entry.key} className="flex justify-between gap-3">
              <span className="text-ink-secondary">{entry.label}</span>
              <time dateTime={entry.at ?? undefined} className="tabular-nums text-ink">
                {formatDateTime(entry.at)}
              </time>
            </li>
          ))}
      </ol>
    </Card>
  );
}
