"use client";

import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@oca/ui";
import { formatDateTime, formatMovementQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import type { OrderMovementDto } from "@/lib/types";

/** ປະຫວັດການເຄື່ອນໄຫວສະຕ໋ອກຂອງບິນ (ຈອງ/ປ່ອຍ/ຕັດສົ່ງ) */
export function OrderMovementsCard({ movements }: { movements: OrderMovementDto[] }) {
  const { t } = useT();
  return (
    <Card className="overflow-hidden rounded-[20px]">
      <h2 className="px-6 pt-5 text-base font-bold text-ink">{t("orders.detail.movements")}</h2>
      {movements.length === 0 ? (
        <p className="px-6 py-4 text-sm text-ink-muted">{t("orders.detail.noMovements")}</p>
      ) : (
        <Table aria-label={t("orders.detail.movements")}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">{t("stock.mov.col.type")}</TableHead>
              <TableHead scope="col">{t("stock.mov.col.item")}</TableHead>
              <TableHead scope="col">{t("stock.mov.col.warehouse")}</TableHead>
              <TableHead scope="col" className="text-right">{t("stock.mov.col.quantity")}</TableHead>
              <TableHead scope="col">{t("stock.mov.col.time")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((movement) => (
              <TableRow key={movement.id} data-testid={`order-movement-${movement.id}`}>
                <TableHead scope="row" className="font-medium text-ink">
                  {t(`stock.type.${movement.type}`)}
                </TableHead>
                <TableCell className="font-mono text-xs">{movement.sku}</TableCell>
                <TableCell className="font-mono text-sm">{movement.warehouseCode}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMovementQuantity(movement.type, movement.quantity)}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(movement.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
