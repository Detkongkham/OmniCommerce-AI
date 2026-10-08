"use client";

import type { StaffKpiRowDto } from "@oca/shared";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from "@oca/ui";
import { useState } from "react";
import { SimpleBarChart } from "@/components/reports/bar-chart";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useStaffKpiDaily } from "@/lib/queries";
import { type DateRange, formatDuration, shortDay } from "@/lib/reports";

const METRICS = ["salesAmount", "ordersPacked", "messagesSent"] as const;
type Metric = (typeof METRICS)[number];
const METRIC_KEYS = {
  salesAmount: "kpi.col.salesAmount",
  ordersPacked: "kpi.col.packed",
  messagesSent: "kpi.col.messages",
} as const;

export function StaffKpiDailyDialog({
  row,
  range,
  onOpenChange,
}: {
  row: StaffKpiRowDto | null;
  range: DateRange;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const [metric, setMetric] = useState<Metric>("salesAmount");
  const query = useStaffKpiDaily(row?.user.id ?? null, range);
  const days = query.data?.days ?? [];
  const format = (value: number) => (metric === "salesAmount" ? formatMoney(String(value)) : formatQuantity(value));

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" closeLabel={t("common.close")}>
        <DialogHeader
          title={t("kpi.daily.heading", { name: row?.user.name ?? "" })}
          description={t("kpi.daily.range", { from: range.from, to: range.to })}
        />
        <DialogBody>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t("kpi.daily.metric")}>
            {METRICS.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={metric === option ? "default" : "ghost"}
                className="rounded-lg"
                aria-pressed={metric === option}
                onClick={() => setMetric(option)}
              >
                {t(METRIC_KEYS[option])}
              </Button>
            ))}
          </div>
          {query.isError ? (
            <p className="py-6 text-center text-sm text-danger">{t("common.error.load")}</p>
          ) : (
            <>
              <SimpleBarChart
                height={240}
                ariaLabel={t("kpi.daily.heading", { name: row?.user.name ?? "" })}
                seriesName={t(METRIC_KEYS[metric])}
                formatValue={format}
                data={days.map((day) => ({ label: shortDay(day.date), value: Number(day[metric]) }))}
              />
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("kpi.col.date")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.salesClosed")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.salesAmount")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.avgResponse")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.messages")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.packed")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={6} rows={4} /> : null}
                  {days.map((day) => (
                    <TableRow key={day.date} data-testid={`row-day-${day.date}`}>
                      <TableCell className="tabular-nums">{shortDay(day.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(day.salesClosed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(day.salesAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatDuration(day.avgResponseSeconds)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(day.messagesSent)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(day.ordersPacked)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
