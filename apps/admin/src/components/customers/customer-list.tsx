"use client";

import { CRM_CUSTOMER_SORTS, type CrmCustomerSort, RFM_SEGMENTS, type RfmSegment } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  cn,
} from "@oca/ui";
import { AlertCircle, Contact, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ServerPager } from "@/components/common/server-pager";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useCrmCustomers, useCrmSegments } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import { SEGMENT_TONE } from "./segment";

const COLUMNS = 5;
const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** ລາຍຊື່ລູກຄ້າ: ຄົ້ນຫາ, ກັ່ນຕອງຕາມກຸ່ມ RFM, ລຽງ, ແບ່ງໜ້າຝັ່ງ server */
export function CustomerList() {
  const { t } = useT();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<RfmSegment | "">("");
  const [sort, setSort] = useState<CrmCustomerSort>("lastOrder");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const trimmed = search.trim();
  const debounced = useDebounced(trimmed, 300);
  const q = trimmed === "" ? "" : debounced;

  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setPage(1);
  }

  const summary = useCrmSegments();
  const query = useCrmCustomers({ q, segment, sort, page, pageSize });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const filtered = q !== "" || segment !== "";
  const busy = query.isPending || query.isPlaceholderData;
  const isEmpty = !busy && rows.length === 0 && total === 0;

  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  const pickSegment = (value: RfmSegment | "") => {
    setSegment((current) => (current === value ? "" : value));
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setSegment("");
    setPage(1);
  };
  const chip = (value: RfmSegment | "", label: string, count: number | undefined) => (
    <button
      key={value || "all"}
      type="button"
      aria-pressed={segment === value}
      onClick={() => pickSegment(value)}
      className={cn(CHIP_CLASS, segment === value ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-secondary hover:text-ink")}
    >
      {label}
      <span className="tabular-nums text-ink-muted">{count ?? "–"}</span>
    </button>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("customers.title")]}
        title={t("customers.title")}
        badge={query.data ? t("customers.count", { count: query.data.total }) : undefined}
        description={t("customers.description")}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <div role="group" aria-label={t("customers.segments.label")} className="flex flex-wrap gap-2">
          {chip("", t("customers.segments.all"), summary.data?.total)}
          {RFM_SEGMENTS.map((value) => chip(value, t(`customers.segment.${value}`), summary.data?.segments[value]))}
        </div>
        <Card className="overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("customers.search")}
                aria-label={t("customers.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Select
              aria-label={t("customers.sort")}
              className="w-48"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as CrmCustomerSort);
                setPage(1);
              }}
            >
              {CRM_CUSTOMER_SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`customers.sort.${value}`)}
                </option>
              ))}
            </Select>
          </div>

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
              <p role="status" className="sr-only">
                {!busy && rows.length > 0 ? t("customers.found", { count: total }) : ""}
              </p>
              <Table aria-label={t("customers.table")} aria-busy={busy}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">{t("customers.col.customer")}</TableHead>
                    <TableHead scope="col">{t("customers.col.segment")}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {t("customers.col.orders")}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {t("customers.col.spent")}
                    </TableHead>
                    <TableHead scope="col">{t("customers.col.lastOrder")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((customer) => (
                    <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <Link href={`/customers/${customer.id}`} className="font-semibold text-brand-ink hover:underline">
                          {customer.name}
                        </Link>
                        <p className="text-xs text-ink-muted">{customer.phone ?? t("customers.noPhone")}</p>
                      </th>
                      <TableCell>
                        {customer.segment ? (
                          <StatusPill tone={SEGMENT_TONE[customer.segment]}>{t(`customers.segment.${customer.segment}`)}</StatusPill>
                        ) : (
                          <span className="text-sm text-ink-muted">{t("customers.never")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{customer.orderCount}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(customer.totalSpent)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">
                        {customer.lastPaidAt ? formatDateTime(customer.lastPaidAt) : t("customers.never")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isEmpty ? (
                <div role="status">
                  <EmptyState
                    icon={Contact}
                    title={filtered ? t("customers.empty.noResults") : t("customers.empty.title")}
                    action={
                      filtered ? (
                        <Button variant="outlinePrimary" className="rounded-lg" onClick={clearFilters}>
                          {t("common.clearSearch")}
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : null}
              <ServerPager
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
