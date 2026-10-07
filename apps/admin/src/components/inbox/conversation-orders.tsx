"use client";

import { Button } from "@oca/ui";
import Link from "next/link";
import { OrderStatusPill } from "@/components/orders/order-status";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useOrders } from "@/lib/queries";

const LIMIT = 20;

/** ບິນທີ່ເປີດຈາກເຄສນີ້ (GET /orders?conversationId=, ຕ້ອງ orders:read: ຜູ້ເອີ້ນເປັນຜູ້ກວດສິດກ່ອນ mount) */
export function ConversationOrders({ conversationId }: { conversationId: string }) {
  const { t } = useT();
  const orders = useOrders({ conversationId, page: 1, pageSize: LIMIT });

  if (orders.isPending) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("common.loading")}
      </p>
    );
  }

  const error = orders.isError ? (
    <p role="alert" className="flex items-center gap-2 text-xs text-danger">
      {t("common.error.load")}
      <Button variant="ghost" size="sm" onClick={() => void orders.refetch()}>
        {t("common.retry")}
      </Button>
    </p>
  ) : null;

  // ລົ້ມແລະບໍ່ມີຂໍ້ມູນເລີຍ: ສະແດງສະເພາະ error. ລົ້ມຕອນ refetch ທີ່ມີຂໍ້ມູນແລ້ວ: ຍັງສະແດງລາຍການ + error
  if (!orders.data) return error;

  const items = orders.data.items;
  return (
    <>
      {error}
      {items.length === 0 ? (
        error ? null : <p className="text-sm text-ink-muted">{t("inbox.panel.noOrders")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((order) => (
            <li key={order.id} className="rounded-xl border border-line bg-subtle px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/orders/${order.id}`} className="font-mono text-sm font-semibold text-brand-ink hover:underline">
                  {order.orderNumber}
                </Link>
                <OrderStatusPill status={order.status} />
              </div>
              <p className="mt-1 text-xs tabular-nums text-ink-secondary">{formatMoney(order.total)}</p>
            </li>
          ))}
        </ul>
      )}
      {orders.data.total > items.length ? (
        <p className="text-xs text-ink-muted">{t("inbox.panel.ordersMore", { shown: items.length, total: orders.data.total })}</p>
      ) : null}
    </>
  );
}
