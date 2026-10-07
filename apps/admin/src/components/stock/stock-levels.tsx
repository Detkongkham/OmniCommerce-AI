"use client";

import {
  Button,
  Card,
  EmptyState,
  Select,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from "@oca/ui";
import { AlertCircle, AlertTriangle, ArrowLeftRight, BellRing, Boxes, PackagePlus, Search, SlidersHorizontal, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { type StockOpMode, useStockLevels, useWarehouses } from "@/lib/queries";
import type { StockLevelDto } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { StockOpDialog, type StockOpTarget } from "./stock-op-dialog";
import { ThresholdDialog } from "./threshold-dialog";

const COLUMNS = 7;

interface OpState {
  mode: StockOpMode;
  target: StockOpTarget | null;
}

export function StockLevels({ initialQuery }: { initialQuery: string }) {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const [search, setSearch] = useState(initialQuery);
  const [warehouseId, setWarehouseId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [op, setOp] = useState<OpState | null>(null);
  const [thresholdLevel, setThresholdLevel] = useState<StockLevelDto | null>(null);
  const q = useDebounced(search.trim(), 300);

  const query = useStockLevels({ q, warehouseId, lowStock: lowOnly, page, pageSize });
  const warehouses = useWarehouses();
  const rows = query.data?.items ?? [];
  const busy = query.isPending || query.isPlaceholderData;
  const filtered = q !== "" || warehouseId !== "" || lowOnly;

  const reset = () => setPage(1);
  const total = query.data?.total ?? 0;

  // ຂໍ້ມູນຫຼຸດລົງຈົນໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ: ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  const clearFilters = () => {
    setSearch("");
    setWarehouseId("");
    setLowOnly(false);
    setPage(1);
  };
  const targetOf = (level: StockLevelDto): StockOpTarget => ({
    variantId: level.variantId,
    warehouseId: level.warehouseId,
    label: `${level.productName}${level.variantName ? ` — ${level.variantName}` : ""} (${level.sku})`,
  });

  const receiveButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => setOp({ mode: "receive", target: null })}>
      <PackagePlus aria-hidden="true" />
      {t("stock.receiveNew")}
    </Button>
  ) : null;

  const actions: { mode: StockOpMode; icon: typeof PackagePlus }[] = [
    { mode: "receive", icon: PackagePlus },
    { mode: "adjust", icon: SlidersHorizontal },
    { mode: "transfer", icon: ArrowLeftRight },
    { mode: "return", icon: Undo2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{receiveButton}</div>
      <Card className="overflow-hidden rounded-[20px]">
        <div className="flex flex-wrap items-center gap-3 px-3 py-4 sm:px-6">
          <div className="relative min-w-[240px] max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                reset();
              }}
              placeholder={t("stock.search")}
              aria-label={t("stock.search")}
              className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Select
            aria-label={t("stock.filter.warehouse")}
            className="w-48"
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
              reset();
            }}
          >
            <option value="">{t("stock.filter.allWarehouses")}</option>
            {(warehouses.data ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {`${warehouse.code} — ${warehouse.name}`}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 rounded border-line accent-[var(--color-brand)]"
              checked={lowOnly}
              onChange={(event) => {
                setLowOnly(event.target.checked);
                reset();
              }}
            />
            {t("stock.filter.lowOnly")}
          </label>
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
              {!busy && rows.length > 0 ? t("stock.found", { count: total }) : ""}
            </p>
            <Table aria-label={t("stock.table")} aria-busy={busy}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">{t("stock.col.item")}</TableHead>
                  <TableHead scope="col">{t("stock.col.warehouse")}</TableHead>
                  <TableHead scope="col" className="text-right">{t("stock.col.onHand")}</TableHead>
                  <TableHead scope="col" className="text-right">{t("stock.col.reserved")}</TableHead>
                  <TableHead scope="col" className="text-right">{t("stock.col.available")}</TableHead>
                  <TableHead scope="col" className="text-right">{t("stock.col.threshold")}</TableHead>
                  <TableHead scope="col" className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                {rows.map((level) => (
                  <TableRow key={level.id} data-testid={`row-stock-${level.id}`}>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <p className="font-medium text-ink">
                        {level.productName}
                        {level.variantName ? ` — ${level.variantName}` : ""}
                      </p>
                      <p className="font-mono text-xs text-ink-muted">{level.sku}</p>
                    </th>
                    <TableCell className="font-mono text-sm">{level.warehouseCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQuantity(level.onHand)}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-secondary">{formatQuantity(level.reserved)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-2">
                        {level.isLow ? (
                          <StatusPill tone="warning" icon={AlertTriangle}>
                            {t("stock.low")}
                          </StatusPill>
                        ) : null}
                        <span className="font-semibold text-ink">{formatQuantity(level.available)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ink-secondary">
                      {level.lowStockThreshold === null ? "—" : formatQuantity(level.lowStockThreshold)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canWrite ? (
                          <>
                            {actions.map(({ mode, icon: Icon }) => (
                              <Button
                                key={mode}
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t(`stock.op.${mode}`)} ${level.sku}`}
                                title={t(`stock.op.${mode}`)}
                                onClick={() => setOp({ mode, target: targetOf(level) })}
                              >
                                <Icon aria-hidden="true" />
                              </Button>
                            ))}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-lg"
                              aria-label={`${t("stock.op.threshold")} ${level.sku}`}
                              title={t("stock.op.threshold")}
                              onClick={() => setThresholdLevel(level)}
                            >
                              <BellRing aria-hidden="true" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!query.isPending && rows.length === 0 && total === 0 ? (
              <div role="status">
              <EmptyState
                icon={Boxes}
                title={filtered ? t("stock.empty.noResults") : t("stock.empty.title")}
                description={filtered ? undefined : t("stock.empty.hint")}
                action={
                  filtered ? (
                    <Button variant="outlinePrimary" className="rounded-lg" onClick={clearFilters}>
                      {t("common.clearSearch")}
                    </Button>
                  ) : (
                    receiveButton
                  )
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

      {op ? (
        <StockOpDialog
          open
          onOpenChange={(open) => {
            if (!open) setOp(null);
          }}
          mode={op.mode}
          target={op.target}
        />
      ) : null}
      <ThresholdDialog level={thresholdLevel} onOpenChange={(open) => (open ? undefined : setThresholdLevel(null))} />
    </div>
  );
}
