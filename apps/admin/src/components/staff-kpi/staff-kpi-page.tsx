"use client";

import type { StaffKpiRowDto } from "@oca/shared";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from "@oca/ui";
import { AlertCircle, BarChart3, Users } from "lucide-react";
import { useState } from "react";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useStaffKpi } from "@/lib/queries";
import { type DateRange, formatDuration, presetRange } from "@/lib/reports";
import { StaffKpiDailyDialog } from "./staff-kpi-daily-dialog";

const COLUMNS = 10;

export function StaffKpiPage() {
  const { t } = useT();
  const [range, setRange] = useState<DateRange>(() => presetRange("last7"));
  const [selected, setSelected] = useState<StaffKpiRowDto | null>(null);
  const query = useStaffKpi(range);
  const rows = query.data?.rows ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("kpi.title")]}
        title={t("kpi.title")}
        description={t("kpi.description")}
      />

      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="rounded-[20px] p-4 sm:px-6">
          <DateRangeFilter value={range} onChange={setRange} />
        </Card>

        <Card className="overflow-hidden rounded-[20px]">
          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table aria-busy={query.isFetching}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("kpi.col.staff")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.salesClosed")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.salesAmount")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.avgResponse")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.messages")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.packed")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.shipped")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.cancelled")}</TableHead>
                    <TableHead className="text-right">{t("kpi.col.adjustments")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((row) => (
                    <TableRow key={row.user.id} data-testid={`row-kpi-${row.user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={row.user.name} className="size-8" />
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{row.user.name}</p>
                            <div className="flex items-center gap-1.5">
                              <StatusPill tone="brand">{row.user.roleName}</StatusPill>
                              {row.user.isActive ? null : <StatusPill tone="neutral">{t("status.inactive")}</StatusPill>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(row.salesClosed)}
                        <span className="text-ink-muted"> / {formatQuantity(row.ordersCreated)}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(row.salesAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(row.avgResponseSeconds)}
                        {row.responses > 0 ? (
                          <span className="block text-xs text-ink-muted">{t("kpi.responses", { count: formatQuantity(row.responses) })}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(row.messagesSent)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(row.ordersPacked)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(row.ordersShipped)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(row.ordersCancelled)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(row.stockAdjustments)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg"
                            aria-label={t("kpi.daily.open", { name: row.user.name })}
                            title={t("kpi.daily.title")}
                            onClick={() => setSelected(row)}
                          >
                            <BarChart3 aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? <EmptyState icon={Users} title={t("kpi.empty")} /> : null}
            </>
          )}
        </Card>

        <dl className="grid gap-x-6 gap-y-1 text-xs text-ink-muted sm:grid-cols-2">
          <div>
            <dt className="inline font-semibold">{t("kpi.col.salesClosed")}: </dt>
            <dd className="inline">{t("kpi.help.salesClosed")}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{t("kpi.col.avgResponse")}: </dt>
            <dd className="inline">{t("kpi.help.avgResponse")}</dd>
          </div>
        </dl>
      </div>

      <StaffKpiDailyDialog
        row={selected}
        range={range}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
