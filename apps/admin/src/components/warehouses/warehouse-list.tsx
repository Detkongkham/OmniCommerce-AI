"use client";

import {
  Button,
  Card,
  ConfirmDialog,
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
  toast,
} from "@oca/ui";
import { AlertCircle, CheckCircle2, Pencil, Plus, Power, PowerOff, Star, Warehouse, XCircle } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useSetDefaultWarehouse, useUpdateWarehouse, useWarehouses } from "@/lib/queries";
import type { WarehouseDto } from "@/lib/types";
import { WarehouseFormDialog } from "./warehouse-form-dialog";

const COLUMNS = 5;

export function WarehouseList() {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const query = useWarehouses();
  const update = useUpdateWarehouse();
  const setDefault = useSetDefaultWarehouse();

  const [formOpen, setFormOpen] = useState(false);
  const [formWarehouse, setFormWarehouse] = useState<WarehouseDto | null>(null);
  const [deactivating, setDeactivating] = useState<WarehouseDto | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rows = query.data ?? [];
  const mutating = update.isPending || setDefault.isPending;

  function openForm(warehouse: WarehouseDto | null) {
    setFormWarehouse(warehouse);
    setFormOpen(true);
  }

  async function setActive(warehouse: WarehouseDto, isActive: boolean) {
    try {
      await update.mutateAsync({ id: warehouse.id, input: { isActive } });
      toast.success(t(isActive ? "warehouses.toast.activated" : "warehouses.toast.deactivated"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setConfirmOpen(false);
    }
  }

  async function makeDefault(warehouse: WarehouseDto) {
    try {
      await setDefault.mutateAsync(warehouse.id);
      toast.success(t("warehouses.toast.defaultSet"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => openForm(null)}>
      <Plus aria-hidden="true" />
      {t("warehouses.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("warehouses.title")]}
        title={t("warehouses.title")}
        badge={query.data ? t("warehouses.count", { count: rows.length }) : undefined}
        description={t("warehouses.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
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
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("warehouses.col.code")}</TableHead>
                    <TableHead>{t("warehouses.col.name")}</TableHead>
                    <TableHead>{t("warehouses.col.address")}</TableHead>
                    <TableHead>{t("warehouses.col.status")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((warehouse) => (
                    <TableRow key={warehouse.id} data-testid={`row-warehouse-${warehouse.id}`}>
                      <TableCell className="font-mono text-sm font-semibold text-ink">{warehouse.code}</TableCell>
                      <TableCell className="font-medium text-ink">{warehouse.name}</TableCell>
                      <TableCell className="text-ink-secondary">{warehouse.address ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill
                            tone={warehouse.isActive ? "success" : "neutral"}
                            icon={warehouse.isActive ? CheckCircle2 : XCircle}
                          >
                            {warehouse.isActive ? t("status.active") : t("status.inactive")}
                          </StatusPill>
                          {warehouse.isDefault ? (
                            <StatusPill tone="brand" icon={Star}>
                              {t("warehouses.default")}
                            </StatusPill>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t("warehouses.edit")} ${warehouse.code}`}
                                title={t("warehouses.edit")}
                                onClick={() => openForm(warehouse)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              {warehouse.isActive && !warehouse.isDefault ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("warehouses.makeDefault")} ${warehouse.code}`}
                                  title={t("warehouses.makeDefault")}
                                  disabled={mutating}
                                  onClick={() => void makeDefault(warehouse)}
                                >
                                  <Star aria-hidden="true" />
                                </Button>
                              ) : null}
                              {warehouse.isActive && !warehouse.isDefault ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("warehouses.deactivate")} ${warehouse.code}`}
                                  title={t("warehouses.deactivate")}
                                  disabled={mutating}
                                  onClick={() => {
                                    setDeactivating(warehouse);
                                    setConfirmOpen(true);
                                  }}
                                >
                                  <PowerOff aria-hidden="true" />
                                </Button>
                              ) : null}
                              {!warehouse.isActive ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("warehouses.activate")} ${warehouse.code}`}
                                  title={t("warehouses.activate")}
                                  disabled={mutating}
                                  onClick={() => void setActive(warehouse, true)}
                                >
                                  <Power aria-hidden="true" />
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? (
                <EmptyState icon={Warehouse} title={t("warehouses.empty.title")} action={addButton} />
              ) : null}
            </>
          )}
        </Card>
      </div>

      <WarehouseFormDialog open={formOpen} onOpenChange={setFormOpen} warehouse={formWarehouse} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("warehouses.deactivateTitle")}
        description={t("warehouses.deactivateDescription", { name: deactivating?.name ?? "" })}
        confirmLabel={t("warehouses.deactivate")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={update.isPending}
        onConfirm={() => (deactivating ? setActive(deactivating, false) : undefined)}
      />
    </div>
  );
}
