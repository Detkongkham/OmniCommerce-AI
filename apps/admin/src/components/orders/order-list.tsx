"use client";

import { ORDER_STATUSES, type OrderStatus } from "@oca/shared";
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
  buttonVariants,
  cn,
} from "@oca/ui";
import { AlertCircle, ClipboardList, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { useOrders } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import { OrderStatusPill } from "./order-status";

const COLUMNS = 6;
const RANGE_ERROR_ID = "orders-range-error";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_INPUT_CLASS =
  "mt-1 block h-9 rounded-xl border border-input bg-background px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger";
const HEADERS: { key: TranslationKey; right?: boolean }[] = [
  { key: "orders.col.number" },
  { key: "orders.col.customer" },
  { key: "orders.col.channel" },
  { key: "orders.col.status" },
  { key: "orders.col.total", right: true },
  { key: "orders.col.created" },
];

export function OrderList({ initialQuery, initialStatus }: { initialQuery: string; initialStatus: OrderStatus | "" }) {
  const { t } = useT();
  const canWrite = useCan("orders:write");
  const [search, setSearch] = useState(initialQuery);
  const [status, setStatus] = useState<OrderStatus | "">(initialStatus);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const trimmed = search.trim();
  const debounced = useDebounced(trimmed, 300);
  // ລ້າງຊ່ອງຄົ້ນຫາມີຜົນທັນທີ (ບໍ່ລໍ debounce)
  const q = trimmed === "" ? "" : debounced;

  // ປ່ຽນຄຳຄົ້ນຫາ (ຄ່າທີ່ debounce ແລ້ວ) ກັບໄປໜ້າ 1 ໃນ render ດຽວກັນ ຈຶ່ງບໍ່ມີ request (q ເກົ່າ, page 1)
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setPage(1);
  }

  // ວັນທີເລີ່ມຫຼັງວັນທີສິ້ນສຸດ (YYYY-MM-DD ປຽບທຽບເປັນ string ໄດ້): ບໍ່ສົ່ງ request
  // ແລະ ຮູບແບບຕ້ອງເປັນ YYYY-MM-DD ປີ 4 ຫຼັກ (browser ອະນຸຍາດປີ 5+ ຫຼັກ)
  const rangeInvalid =
    (from !== "" && !DATE_PATTERN.test(from)) || (to !== "" && !DATE_PATTERN.test(to)) || (from !== "" && to !== "" && from > to);
  const query = useOrders({ q, status, from, to, page, pageSize }, { enabled: !rangeInvalid });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const filtered = q !== "" || status !== "" || from !== "" || to !== "";
  const busy = query.isPending || query.isPlaceholderData;
  const isEmpty = !busy && rows.length === 0 && total === 0;

  // ຂໍ້ມູນຫຼຸດລົງຈົນໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ: ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  const reset = () => setPage(1);
  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const addButton = canWrite ? (
    <Link href="/orders/new" className={cn(buttonVariants(), "rounded-xl")}>
      <Plus aria-hidden="true" />
      {t("orders.add")}
    </Link>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("orders.title")]}
        title={t("orders.title")}
        badge={query.data ? t("orders.count", { count: query.data.total }) : undefined}
        description={t("orders.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("orders.search")}
                aria-label={t("orders.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Select
              aria-label={t("orders.filter.status")}
              className="w-48"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatus | "");
                reset();
              }}
            >
              <option value="">{t("orders.filter.allStatuses")}</option>
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`orders.status.${value}`)}
                </option>
              ))}
            </Select>
            <label className="text-xs font-semibold text-ink-secondary">
              {t("orders.filter.from")}
              <input
                type="date"
                value={from}
                max={to || undefined}
                aria-invalid={rangeInvalid}
                aria-describedby={rangeInvalid ? RANGE_ERROR_ID : undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  reset();
                }}
                className={DATE_INPUT_CLASS}
              />
            </label>
            <label className="text-xs font-semibold text-ink-secondary">
              {t("orders.filter.to")}
              <input
                type="date"
                value={to}
                min={from || undefined}
                aria-invalid={rangeInvalid}
                aria-describedby={rangeInvalid ? RANGE_ERROR_ID : undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  reset();
                }}
                className={DATE_INPUT_CLASS}
              />
            </label>
          </div>

          {rangeInvalid ? (
            <p id={RANGE_ERROR_ID} role="alert" className="px-3 pb-4 text-sm font-medium text-danger-ink sm:px-6">
              {t("orders.rangeInvalid")}
            </p>
          ) : query.isError ? (
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
                {!busy && rows.length > 0 ? t("orders.found", { count: total }) : ""}
              </p>
              <Table aria-label={t("orders.table")} aria-busy={busy}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {HEADERS.map((header) => (
                      <TableHead key={header.key} scope="col" className={header.right ? "text-right" : undefined}>
                        {t(header.key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((order) => (
                    <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <Link href={`/orders/${order.id}`} className="font-mono font-semibold text-brand-ink hover:underline">
                          {order.orderNumber}
                        </Link>
                        <p className="text-xs text-ink-muted">{t("orders.itemCount", { count: order.itemCount })}</p>
                      </th>
                      <TableCell className="text-ink">
                        {order.customer ? (
                          <>
                            <p>{order.customer.name}</p>
                            {order.customer.phone ? <p className="text-xs text-ink-muted">{order.customer.phone}</p> : null}
                          </>
                        ) : (
                          <span className="text-ink-secondary">{t("orders.walkIn")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-ink-secondary">{t(`orders.channel.${order.channel}`)}</TableCell>
                      <TableCell>
                        <OrderStatusPill status={order.status} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(order.total)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(order.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isEmpty ? (
                <div role="status">
                  <EmptyState
                    icon={ClipboardList}
                    title={filtered ? t("orders.empty.noResults") : t("orders.empty.title")}
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
