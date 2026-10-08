"use client";

import { FULFILLMENT_STATUSES, type FulfillmentStatus } from "@oca/shared";
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
  buttonVariants,
  cn,
} from "@oca/ui";
import { AlertCircle, PackageCheck, Printer, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { OrderStatusPill } from "@/components/orders/order-status";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useFulfillmentQueue, useWarehouses } from "@/lib/queries";
import { toQueryString } from "@/lib/query-string";
import type { FulfillmentListItemDto, Page } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

/** ພິມໃບປະໜ້າໄດ້ສູງສຸດເທົ່ານີ້ຕໍ່ຄັ້ງ (ໜ້າ labels ໂຫຼດທີລະບິນ) */
export const MAX_LABELS = 50;
const COLUMNS = 7;

export function FulfillmentQueue() {
  const { t } = useT();
  const router = useRouter();
  const canReadWarehouses = useCan("inventory:read");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FulfillmentStatus | "">("");
  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [selected, setSelected] = useState<string[]>([]);
  const [scanMessage, setScanMessage] = useState("");
  const trimmed = search.trim();
  const debounced = useDebounced(trimmed, 300);
  const q = trimmed === "" ? "" : debounced;
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setPage(1);
  }

  const warehouses = useWarehouses({ enabled: canReadWarehouses });
  const query = useFulfillmentQueue({ status, warehouseId: warehouseId || undefined, q: q || undefined, page, pageSize });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const busy = query.isPending || query.isPlaceholderData;
  const filtered = q !== "" || status !== "" || warehouseId !== "";

  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  /** ເຄື່ອງຍິງສົ່ງ Enter ຕາມຫຼັງເລກບິນ: ຊອກບິນທີ່ກົງທຸກຕົວ ແລ້ວເປີດໜ້າແພັກທັນທີ */
  async function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const code = trimmed.toUpperCase();
    if (code === "") return;
    setScanMessage("");
    try {
      const found = await apiFetch<Page<FulfillmentListItemDto>>(`/fulfillment${toQueryString({ q: code, page: 1, pageSize: 5 })}`);
      const match = found.items.find((row) => row.orderNumber.toUpperCase() === code);
      if (match) router.push(`/fulfillment/${match.id}`);
      else setScanMessage(t("fulfillment.scanNotFound", { code }));
    } catch {
      setScanMessage(t("common.error.generic"));
    }
  }

  const pageIds = rows.map((row) => row.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const toggleAll = () => setSelected((current) => (allSelected ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])]));
  const printIds = selected.slice(0, MAX_LABELS);

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("fulfillment.title")]}
        title={t("fulfillment.title")}
        badge={query.data ? t("fulfillment.count", { count: query.data.total }) : undefined}
        description={t("fulfillment.description")}
        actions={
          printIds.length > 0 ? (
            <a
              href={`/fulfillment/labels?ids=${printIds.join(",")}`}
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants(), "rounded-xl")}
            >
              <Printer aria-hidden="true" />
              {t("fulfillment.printSelected", { count: printIds.length })}
            </a>
          ) : null
        }
      />
      <div className="px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                autoFocus
                onChange={(event) => {
                  setSearch(event.target.value);
                  setScanMessage("");
                }}
                onKeyDown={(event) => void onSearchKeyDown(event)}
                placeholder={t("fulfillment.search")}
                aria-label={t("fulfillment.search")}
                aria-describedby={scanMessage ? "fulfillment-scan-message" : undefined}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Select
              aria-label={t("fulfillment.filter.status")}
              className="w-52"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as FulfillmentStatus | "");
                setPage(1);
              }}
            >
              <option value="">{t("fulfillment.filter.all")}</option>
              {FULFILLMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`orders.status.${value}`)}
                </option>
              ))}
            </Select>
            {canReadWarehouses && warehouses.data ? (
              <Select
                aria-label={t("fulfillment.filter.warehouse")}
                className="w-48"
                value={warehouseId}
                onChange={(event) => {
                  setWarehouseId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("fulfillment.filter.allWarehouses")}</option>
                {warehouses.data.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} · {warehouse.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
          {scanMessage ? (
            <p id="fulfillment-scan-message" role="alert" className="px-3 pb-3 text-sm font-medium text-danger-ink sm:px-6">
              {scanMessage}
            </p>
          ) : null}

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
              <Table aria-label={t("fulfillment.table")} aria-busy={busy}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col" className="w-10">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-brand)]"
                        aria-label={t("fulfillment.selectAll")}
                        checked={allSelected}
                        disabled={pageIds.length === 0}
                        onChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead scope="col">{t("fulfillment.col.order")}</TableHead>
                    <TableHead scope="col">{t("fulfillment.col.customer")}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {t("fulfillment.col.items")}
                    </TableHead>
                    <TableHead scope="col">{t("fulfillment.col.status")}</TableHead>
                    <TableHead scope="col">{t("fulfillment.col.check")}</TableHead>
                    <TableHead scope="col">{t("fulfillment.col.paidAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((row) => (
                    <TableRow key={row.id} data-testid={`row-fulfillment-${row.id}`}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-brand)]"
                          aria-label={t("fulfillment.select", { number: row.orderNumber })}
                          checked={selected.includes(row.id)}
                          onChange={() => toggle(row.id)}
                        />
                      </TableCell>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <Link href={`/fulfillment/${row.id}`} className="font-mono font-semibold text-brand-ink hover:underline">
                          {row.orderNumber}
                        </Link>
                      </th>
                      <TableCell className="text-ink">
                        {row.customer ? (
                          <>
                            <p>{row.customer.name}</p>
                            {row.customer.phone ? <p className="text-xs text-ink-muted">{row.customer.phone}</p> : null}
                          </>
                        ) : (
                          <span className="text-ink-secondary">{t("orders.walkIn")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.itemCount}</TableCell>
                      <TableCell>
                        <OrderStatusPill status={row.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.hasShippingInfo ? null : <StatusPill tone="warning">{t("fulfillment.noAddress")}</StatusPill>}
                          {row.verified ? <StatusPill tone="success">{t("fulfillment.verified")}</StatusPill> : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(row.paidAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!busy && rows.length === 0 ? (
                <div role="status">
                  <EmptyState icon={PackageCheck} title={filtered ? t("fulfillment.emptyFiltered") : t("fulfillment.empty")} />
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
