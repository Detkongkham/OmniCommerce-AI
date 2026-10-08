"use client";

import type { ChannelSalesDto, DeadstockItemDto, SalesSummaryDto, TopProductDto } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  toast,
} from "@oca/ui";
import { AlertCircle, Banknote, Download, PackageX, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { SimpleBarChart } from "@/components/reports/bar-chart";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { StatTile } from "@/components/reports/stat-tile";
import { apiDownload, saveBlob } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import {
  useAnalyticsChannels,
  useAnalyticsDaily,
  useAnalyticsSummary,
  useDeadstock,
  useTopProducts,
} from "@/lib/queries";
import { toQueryString } from "@/lib/query-string";
import { type DateRange, presetRange, shortDay } from "@/lib/reports";

const DEADSTOCK_DAYS = [30, 60, 90] as const;

export function AnalyticsPage() {
  const { t } = useT();
  const canCost = useCan("costs:read");
  const [range, setRange] = useState<DateRange>(() => presetRange("last30"));
  const [exporting, setExporting] = useState(false);

  const summary = useAnalyticsSummary(range);
  const daily = useAnalyticsDaily(range);
  const channels = useAnalyticsChannels(range);
  const top = useTopProducts(range, 10);

  async function exportCsv() {
    setExporting(true);
    try {
      const file = await apiDownload(`/analytics/export.csv${toQueryString({ ...range })}`, `sales-${range.from}-${range.to}.csv`);
      saveBlob(file.blob, file.filename);
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setExporting(false);
    }
  }

  const s = summary.data;
  const marginHint = s?.grossMargin ? t("analytics.marginHint", { margin: s.grossMargin }) : undefined;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("analytics.title")]}
        title={t("analytics.title")}
        description={t("analytics.description")}
        actions={
          <Button variant="outlinePrimary" className="rounded-xl" onClick={() => void exportCsv()} loading={exporting}>
            <Download aria-hidden="true" />
            {t("analytics.export")}
          </Button>
        }
      />

      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="rounded-[20px] p-4 sm:px-6">
          <DateRangeFilter value={range} onChange={setRange} />
          <p className="mt-3 text-xs text-ink-muted">{t("analytics.basis")}</p>
        </Card>

        {summary.isError ? (
          <Card className="rounded-[20px]">
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void summary.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-busy={summary.isFetching}>
            <StatTile icon={Banknote} label={t("analytics.stat.revenue")} value={s ? formatMoney(s.revenue) : "…"} hint={t("analytics.stat.revenueHint")} />
            <StatTile icon={Receipt} label={t("analytics.stat.orders")} value={s ? formatQuantity(s.orders) : "…"} hint={s ? t("analytics.stat.units", { units: formatQuantity(s.units) }) : undefined} />
            <StatTile icon={ShoppingBag} label={t("analytics.stat.aov")} value={s ? formatMoney(s.avgOrderValue) : "…"} hint={s ? t("analytics.stat.customers", { count: formatQuantity(s.customers) }) : undefined} />
            {canCost ? (
              <StatTile icon={TrendingUp} label={t("analytics.stat.grossProfit")} value={s ? formatMoney(s.grossProfit) : "…"} hint={marginHint} />
            ) : null}
            <StatTile icon={Wallet} label={t("analytics.stat.pending")} value={s ? formatMoney(s.pendingAmount) : "…"} hint={t("analytics.stat.pendingHint")} />
            <StatTile icon={PackageX} label={t("analytics.stat.cancelled")} value={s ? formatQuantity(s.cancelled) : "…"} />
          </div>
        )}

        <Card className="rounded-[20px] p-4 sm:p-6">
          <h2 className="text-base font-semibold text-ink">{t("analytics.daily.title")}</h2>
          {daily.isError ? (
            <p className="py-8 text-center text-sm text-danger">{t("common.error.load")}</p>
          ) : (
            <div className="mt-3">
              <SimpleBarChart
                ariaLabel={t("analytics.daily.aria", { from: range.from, to: range.to })}
                seriesName={t("analytics.stat.revenue")}
                formatValue={(value) => formatMoney(String(value))}
                data={(daily.data?.days ?? []).map((day) => ({ label: shortDay(day.date), value: Number(day.revenue) }))}
              />
            </div>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <ProfitLossCard s={s} canCost={canCost} />
          <ChannelsCard
            loading={channels.isPending}
            error={channels.isError}
            channels={channels.data?.channels ?? []}
            sources={channels.data?.sources ?? []}
            canCost={canCost}
          />
        </div>

        <TopProductsCard loading={top.isPending} error={top.isError} rows={top.data ?? []} canCost={canCost} />
        <DeadstockCard canCost={canCost} />
      </div>
    </div>
  );
}

function ProfitLossCard({ s, canCost }: { s: SalesSummaryDto | undefined; canCost: boolean }) {
  const { t } = useT();
  const rows: { key: TranslationKey; value: string | undefined; strong?: boolean; negative?: boolean }[] = [
    { key: "analytics.pl.grossSales", value: s?.grossSales },
    { key: "analytics.pl.discounts", value: s?.discounts, negative: true },
    { key: "analytics.pl.shipping", value: s?.shippingIncome },
    { key: "analytics.pl.vat", value: s?.vat, negative: true },
    { key: "analytics.pl.revenue", value: s?.revenue, strong: true },
    ...(canCost
      ? [
          { key: "analytics.pl.cogs" as const, value: s?.cogs, negative: true },
          { key: "analytics.pl.grossProfit" as const, value: s?.grossProfit, strong: true },
        ]
      : []),
  ];
  return (
    <Card className="rounded-[20px] p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t("analytics.pl.title")}</h2>
      <p className="mt-0.5 text-xs text-ink-muted">{t("analytics.pl.note")}</p>
      <dl className="mt-4 divide-y divide-line">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between py-2.5 text-sm">
            <dt className={row.strong ? "font-semibold text-ink" : "text-ink-secondary"}>{t(row.key)}</dt>
            <dd className={row.strong ? "font-semibold tabular-nums text-ink" : "tabular-nums text-ink"}>
              {row.value === undefined ? "…" : `${row.negative && Number(row.value) > 0 ? "−" : ""}${formatMoney(row.value)}`}
            </dd>
          </div>
        ))}
        {canCost && s ? (
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-ink-secondary">{t("analytics.pl.margin")}</dt>
            <dd className="tabular-nums text-ink">{s.grossMargin ? `${s.grossMargin}%` : "—"}</dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

function ChannelsCard({
  loading,
  error,
  channels,
  sources,
  canCost,
}: {
  loading: boolean;
  error: boolean;
  channels: ChannelSalesDto<string>[];
  sources: ChannelSalesDto<string>[];
  canCost: boolean;
}) {
  const { t } = useT();
  const [view, setView] = useState<"channel" | "source">("channel");
  const rows = view === "channel" ? channels : sources;
  const label = (key: string) =>
    t((view === "channel" ? `orders.channel.${key}` : `report.source.${key}`) as TranslationKey);
  const withSales = rows.filter((row) => row.orders > 0);
  return (
    <Card className="rounded-[20px] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{t("analytics.channels.title")}</h2>
        <div className="flex gap-1" role="group" aria-label={t("analytics.channels.view")}>
          {(["channel", "source"] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={view === option ? "default" : "ghost"}
              className="rounded-lg"
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {t(option === "channel" ? "analytics.channels.byChannel" : "analytics.channels.bySource")}
            </Button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="py-8 text-center text-sm text-danger">{t("common.error.load")}</p>
      ) : (
        <>
          {withSales.length > 0 ? (
            <div className="mt-3">
              <SimpleBarChart
                horizontal
                height={Math.max(160, withSales.length * 44)}
                ariaLabel={t("analytics.channels.title")}
                seriesName={t("analytics.stat.revenue")}
                formatValue={(value) => formatMoney(String(value))}
                data={withSales.map((row) => ({ label: label(row.key), value: Number(row.revenue) }))}
              />
            </div>
          ) : null}
          <Table className="mt-2">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t(view === "channel" ? "analytics.col.channel" : "analytics.col.source")}</TableHead>
                <TableHead className="text-right">{t("analytics.col.orders")}</TableHead>
                <TableHead className="text-right">{t("analytics.col.revenue")}</TableHead>
                <TableHead className="text-right">{t("analytics.col.share")}</TableHead>
                {canCost ? <TableHead className="text-right">{t("analytics.col.grossProfit")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableSkeletonRows columns={canCost ? 5 : 4} rows={4} /> : null}
              {rows.map((row) => (
                <TableRow key={row.key} data-testid={`row-${view}-${row.key}`} className={row.orders === 0 ? "text-ink-muted" : undefined}>
                  <TableCell>{label(row.key)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(row.orders)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(row.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                  {canCost ? <TableCell className="text-right tabular-nums">{formatMoney(row.grossProfit)}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Card>
  );
}

function TopProductsCard({ loading, error, rows, canCost }: { loading: boolean; error: boolean; rows: TopProductDto[]; canCost: boolean }) {
  const { t } = useT();
  const columns = canCost ? 5 : 4;
  return (
    <Card className="overflow-hidden rounded-[20px]">
      <h2 className="px-4 pt-4 text-base font-semibold text-ink sm:px-6">{t("analytics.top.title")}</h2>
      {error ? (
        <p className="py-8 text-center text-sm text-danger">{t("common.error.load")}</p>
      ) : (
        <Table className="mt-2">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("analytics.col.product")}</TableHead>
              <TableHead className="text-right">{t("analytics.col.units")}</TableHead>
              <TableHead className="text-right">{t("analytics.col.revenue")}</TableHead>
              {canCost ? <TableHead className="text-right">{t("analytics.col.grossProfit")}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableSkeletonRows columns={columns} rows={5} /> : null}
            {rows.map((row, index) => (
              <TableRow key={row.variantId} data-testid={`row-top-${row.sku}`}>
                <TableCell className="tabular-nums text-ink-muted">{index + 1}</TableCell>
                <TableCell>
                  <ProductName name={row.productName} variant={row.variantName} sku={row.sku} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatQuantity(row.units)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(row.revenue)}</TableCell>
                {canCost ? <TableCell className="text-right tabular-nums">{formatMoney(row.grossProfit)}</TableCell> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!loading && !error && rows.length === 0 ? <EmptyState icon={ShoppingBag} title={t("analytics.top.empty")} /> : null}
    </Card>
  );
}

function DeadstockCard({ canCost }: { canCost: boolean }) {
  const { t } = useT();
  const [days, setDays] = useState<number>(60);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useDeadstock({ days, page, pageSize });
  const rows: DeadstockItemDto[] = query.data?.items ?? [];
  const columns = canCost ? 4 : 3;
  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-ink">{t("analytics.dead.title")}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{t("analytics.dead.description", { days })}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          {t("analytics.dead.days")}
          <Select
            className="w-[120px]"
            value={String(days)}
            onChange={(event) => {
              setDays(Number(event.target.value));
              setPage(1);
            }}
          >
            {DEADSTOCK_DAYS.map((option) => (
              <option key={option} value={option}>
                {t("analytics.dead.daysOption", { days: option })}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {query.isError ? (
        <p className="py-8 text-center text-sm text-danger">{t("common.error.load")}</p>
      ) : (
        <>
          <Table className="mt-2">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("analytics.col.product")}</TableHead>
                <TableHead className="text-right">{t("analytics.col.onHand")}</TableHead>
                {canCost ? <TableHead className="text-right">{t("analytics.col.stockValue")}</TableHead> : null}
                <TableHead>{t("analytics.col.lastSold")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? <TableSkeletonRows columns={columns} rows={5} /> : null}
              {rows.map((row) => (
                <TableRow key={row.variantId} data-testid={`row-dead-${row.sku}`}>
                  <TableCell>
                    <ProductName name={row.productName} variant={row.variantName} sku={row.sku} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(row.onHand)}</TableCell>
                  {canCost ? <TableCell className="text-right tabular-nums">{formatMoney(row.stockValue)}</TableCell> : null}
                  <TableCell className="tabular-nums text-ink-secondary">
                    {row.lastSoldAt ? formatDateTime(row.lastSoldAt) : t("analytics.dead.never")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!query.isPending && rows.length === 0 ? <EmptyState icon={PackageX} title={t("analytics.dead.empty")} /> : null}
          <ServerPager
            page={page}
            pageSize={pageSize}
            total={query.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </Card>
  );
}

function ProductName({ name, variant, sku }: { name: string; variant: string | null; sku: string }) {
  return (
    <div className="min-w-0">
      <Link href={`/stock?q=${encodeURIComponent(sku)}`} className="font-medium text-ink hover:text-brand hover:underline">
        {name}
        {variant ? <span className="text-ink-secondary"> · {variant}</span> : null}
      </Link>
      <p className="font-mono text-xs text-ink-muted">{sku}</p>
    </div>
  );
}
