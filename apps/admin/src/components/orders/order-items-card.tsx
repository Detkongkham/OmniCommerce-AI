"use client";

import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@oca/ui";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import type { OrderDetailDto } from "@/lib/types";

/** ລາຍການສິນຄ້າ + ສະຫຼຸບເງິນ (ຄ່າຈິງຈາກ API, ເປັນ string ທັງໝົດ); ຄອລຳຕົ້ນທຶນສະແດງເມື່ອ showCost */
export function OrderItemsCard({ order, showCost }: { order: OrderDetailDto; showCost: boolean }) {
  const { t } = useT();
  return (
    <Card className="overflow-hidden rounded-[20px]">
      <h2 className="px-6 pt-5 text-base font-bold text-ink">{t("orders.detail.items")}</h2>
      <Table aria-label={t("orders.items.table")}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">{t("orders.items.product")}</TableHead>
            <TableHead scope="col" className="text-right">{t("orders.items.unitPrice")}</TableHead>
            {showCost ? <TableHead scope="col" className="text-right">{t("orders.detail.unitCost")}</TableHead> : null}
            <TableHead scope="col" className="text-right">{t("orders.items.quantity")}</TableHead>
            <TableHead scope="col" className="text-right">{t("orders.items.discount")}</TableHead>
            <TableHead scope="col" className="text-right">{t("orders.items.lineTotal")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.items.map((item) => (
            <TableRow key={item.id} data-testid={`order-item-${item.id}`}>
              <TableHead scope="row" className="whitespace-normal font-normal text-ink">
                <p className="font-medium text-ink">
                  {item.productName}
                  {item.variantName ? ` — ${item.variantName}` : ""}
                </p>
                <p className="font-mono text-xs text-ink-muted">{item.sku}</p>
              </TableHead>
              <TableCell className="text-right tabular-nums">{formatMoney(item.unitPrice)}</TableCell>
              {showCost ? <TableCell className="text-right tabular-nums text-ink-secondary">{formatMoney(item.unitCost)}</TableCell> : null}
              <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
              <TableCell className="text-right tabular-nums text-ink-secondary">{formatMoney(item.discount)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMoney(item.lineTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <dl className="ml-auto max-w-xs space-y-1 px-6 py-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-secondary">{t("orders.summary.subtotal")}</dt>
          <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-secondary">{t("orders.summary.discount")}</dt>
          <dd className="tabular-nums">{formatMoney(order.discountTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-secondary">{t("orders.summary.shipping")}</dt>
          <dd className="tabular-nums">{formatMoney(order.shippingFee)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-secondary">{t("orders.summary.vat", { rate: formatMoney(order.vatRate) })}</dt>
          <dd className="tabular-nums">{formatMoney(order.vatAmount)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
          <dt>{t("orders.summary.total")}</dt>
          <dd className="tabular-nums" data-testid="detail-total">
            {formatMoney(order.total)} {order.currency}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
