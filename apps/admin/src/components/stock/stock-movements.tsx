"use client";

import { STOCK_MOVEMENT_TYPES, type StockMovementType } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  Select,
  StatusPill,
  type StatusTone,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  cn,
} from "@oca/ui";
import { AlertCircle, History, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ServerPager } from "@/components/common/server-pager";
import { VariantPicker } from "@/components/common/variant-picker";
import { formatDateTime, formatMovementQuantity } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { useStockMovements, useWarehouses } from "@/lib/queries";

const COLUMNS = 8;
const DATE_INPUT_CLASS =
  "mt-1 block h-9 rounded-xl border border-input bg-background px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HEADERS: { key: TranslationKey; right?: boolean }[] = [
  { key: "stock.mov.col.time" },
  { key: "stock.mov.col.type" },
  { key: "stock.mov.col.item" },
  { key: "stock.mov.col.warehouse" },
  { key: "stock.mov.col.quantity", right: true },
  { key: "stock.mov.col.order" },
  { key: "stock.mov.col.note" },
  { key: "stock.mov.col.actor" },
] as const;

// engine ບັນທຶກໝາຍເຫດ transfer ເປັນ `from <warehouseId>` / `to <warehouseId>` (ຂໍ້ມູນເກົ່າກໍເປັນແບບນີ້)
const TRANSFER_NOTE = /^(from|to) (\S+)$/;

const TONES: Record<StockMovementType, StatusTone> = {
  RECEIVE: "success",
  RETURN: "success",
  TRANSFER_IN: "info",
  TRANSFER_OUT: "info",
  ADJUST: "warning",
  RESERVE: "brand",
  RELEASE: "neutral",
  SHIP: "neutral",
};

export function StockMovements() {
  const { t } = useT();
  const [type, setType] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [variant, setVariant] = useState<{ id: string; label: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ວັນທີເລີ່ມຫຼັງວັນທີສິ້ນສຸດ (YYYY-MM-DD ປຽບທຽບເປັນ string ໄດ້): ບໍ່ສົ່ງ request
  // ແລະ ຮູບແບບຕ້ອງເປັນ YYYY-MM-DD ປີ 4 ຫຼັກ (browser ອະນຸຍາດປີ 5+ ຫຼັກ)
  const rangeInvalid =
    (from !== "" && !DATE_PATTERN.test(from)) || (to !== "" && !DATE_PATTERN.test(to)) || (from !== "" && to !== "" && from > to);
  const query = useStockMovements({ type, warehouseId, variantId: variant?.id ?? "", from, to, page, pageSize }, { enabled: !rangeInvalid });
  const warehouses = useWarehouses();
  const warehouseById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse.code]));
  // ໝາຍເຫດ transfer ທີ່ເປັນ id ດິບ -> ຂໍ້ຄວາມແປ; ໝາຍເຫດອື່ນສະແດງຕາມເດີມ; ລະຫວ່າງໂຫຼດສາງສະແດງ "—" ບໍ່ໃຫ້ເຫັນ id
  const noteText = (movement: { type: StockMovementType; note: string | null }): string => {
    if (movement.note === null) return "—";
    const match = movement.type === "TRANSFER_IN" || movement.type === "TRANSFER_OUT" ? TRANSFER_NOTE.exec(movement.note) : null;
    if (!match) return movement.note;
    if (warehouses.isPending) return "—";
    const code = warehouseById.get(match[2] ?? "") ?? t("stock.mov.unknownWarehouse");
    return t(match[1] === "from" ? "stock.mov.noteFrom" : "stock.mov.noteTo", { code });
  };
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const filtered = type !== "" || warehouseId !== "" || from !== "" || to !== "" || variant !== null;
  const busy = query.isPending || query.isPlaceholderData;
  const isEmpty = !busy && rows.length === 0 && total === 0;

  // ຂໍ້ມູນຫຼຸດລົງຈົນໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ: ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  // ຍ້າຍ focus ຫຼັງ chip/picker ສະຫຼັບກັນ (ຕ້ອງເຮັດຫຼັງ render ເພາະ element ເກົ່າຖືກຖອດ)
  const chipRef = useRef<HTMLButtonElement>(null);
  const focusRequest = useRef<"chip" | "picker" | null>(null);
  useEffect(() => {
    if (focusRequest.current === "chip") chipRef.current?.focus();
    else if (focusRequest.current === "picker") document.getElementById("movement-variant")?.focus();
    focusRequest.current = null;
  }, [variant]);

  const reset = () => setPage(1);
  const clearFilters = () => {
    setType("");
    setWarehouseId("");
    setFrom("");
    setTo("");
    setVariant(null);
    setPage(1);
  };

  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
        <Select
          aria-label={t("stock.mov.filter.type")}
          className="w-44"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            reset();
          }}
        >
          <option value="">{t("stock.mov.filter.allTypes")}</option>
          {STOCK_MOVEMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`stock.type.${value}`)}
            </option>
          ))}
        </Select>
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
        <label className="text-xs font-semibold text-ink-secondary">
          {t("stock.mov.filter.from")}
          <input
            type="date"
            value={from}
            max={to || undefined}
            aria-invalid={rangeInvalid}
            aria-describedby={rangeInvalid ? "movement-range-error" : undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              reset();
            }}
            className={DATE_INPUT_CLASS}
          />
        </label>
        <label className="text-xs font-semibold text-ink-secondary">
          {t("stock.mov.filter.to")}
          <input
            type="date"
            value={to}
            min={from || undefined}
            aria-invalid={rangeInvalid}
            aria-describedby={rangeInvalid ? "movement-range-error" : undefined}
            onChange={(event) => {
              setTo(event.target.value);
              reset();
            }}
            className={DATE_INPUT_CLASS}
          />
        </label>
        <div className="min-w-[260px] flex-1">
          {variant ? (
            <div className="flex h-9 items-center justify-between gap-2 rounded-xl border border-line bg-subtle px-3 text-sm">
              <span className="truncate">
                <span className="text-xs font-semibold text-ink-secondary">{t("stock.mov.filter.variant")}: </span>
                {variant.label}
              </span>
              <button
                ref={chipRef}
                type="button"
                aria-label={`${t("stock.mov.filter.clear")} ${t("stock.mov.filter.variant")}: ${variant.label}`}
                className="rounded p-0.5 hover:bg-hover"
                onClick={() => {
                  focusRequest.current = "picker";
                  setVariant(null);
                  reset();
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <VariantPicker
              id="movement-variant"
              label={t("stock.mov.filter.variant")}
              includeInactive
              onSelect={(item) => {
                focusRequest.current = "chip";
                setVariant({ id: item.id, label: `${item.sku}${item.name ? ` — ${item.name}` : ""}` });
                reset();
              }}
            />
          )}
        </div>
      </div>

      {rangeInvalid ? (
        <p id="movement-range-error" role="alert" className="px-3 pb-4 text-sm font-medium text-danger-ink sm:px-6">
          {t("stock.mov.rangeInvalid")}
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
            {!busy && rows.length > 0 ? t("stock.mov.count", { count: total }) : ""}
          </p>
          <Table aria-label={t("stock.mov.table")} aria-busy={busy}>
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
              {rows.map((movement) => (
                <TableRow key={movement.id} data-testid={`row-movement-${movement.id}`}>
                  <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(movement.createdAt)}</TableCell>
                  <TableCell>
                    <StatusPill tone={TONES[movement.type]}>{t(`stock.type.${movement.type}`)}</StatusPill>
                  </TableCell>
                  <th scope="row" className={cn("px-4 py-3 text-left font-mono text-xs font-normal")}>
                    {movement.sku}
                  </th>
                  <TableCell className="font-mono text-sm">{movement.warehouseCode}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatMovementQuantity(movement.type, movement.quantity)}</TableCell>
                  <TableCell>
                    {movement.orderId && movement.orderNumber ? (
                      <Link href={`/orders/${movement.orderId}`} className="font-medium text-brand-ink hover:underline">
                        {movement.orderNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-ink-secondary">{noteText(movement)}</TableCell>
                  <TableCell className="text-ink-secondary">{movement.actorName ?? t("stock.mov.system")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isEmpty ? (
            <div role="status">
              <EmptyState
                icon={History}
                title={t("stock.mov.empty")}
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
  );
}
