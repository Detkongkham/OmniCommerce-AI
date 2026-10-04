"use client";

import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  DataTableFooter,
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
  formatDate,
  paginate,
  toast,
} from "@oca/ui";
import { AlertCircle, CheckCircle2, Pencil, Plus, Search, UserCheck, UserX, Users, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useRoleList, useStaffList, useUpdateStaff } from "@/lib/queries";
import type { StaffDto } from "@/lib/types";
import { StaffFormDialog } from "./staff-form-dialog";

const COLUMNS = 6;

export function StaffList() {
  const { t } = useT();
  const canWrite = useCan("staff:write");
  const staffQuery = useStaffList();
  const rolesQuery = useRoleList();
  const updateStaff = useUpdateStaff();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [formStaff, setFormStaff] = useState<StaffDto | null>(null);
  const [deactivating, setDeactivating] = useState<StaffDto | null>(null);

  const all = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return all;
    return all.filter((s) => [s.name, s.email, s.roleName].some((value) => value.toLowerCase().includes(query)));
  }, [all, search]);
  const slice = paginate(filtered, page, pageSize);

  function openCreate() {
    setFormStaff(null);
    setFormOpen(true);
  }

  function openEdit(staff: StaffDto) {
    setFormStaff(staff);
    setFormOpen(true);
  }

  async function setActive(staff: StaffDto, isActive: boolean) {
    try {
      await updateStaff.mutateAsync({ id: staff.id, input: { isActive } });
      toast.success(t(isActive ? "staff.toast.activated" : "staff.toast.deactivated"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setDeactivating(null);
    }
  }

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={openCreate}>
      <Plus aria-hidden="true" />
      {t("staff.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("staff.title")]}
        title={t("staff.title")}
        badge={staffQuery.data ? t("staff.count", { count: all.length }) : undefined}
        description={t("staff.description")}
        actions={addButton}
      />

      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="px-3 py-4 sm:px-6">
            <div className="relative max-w-md min-w-[240px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t("staff.search")}
                aria-label={t("staff.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>

          {staffQuery.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void staffQuery.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("staff.col.name")}</TableHead>
                    <TableHead>{t("staff.col.email")}</TableHead>
                    <TableHead>{t("staff.col.role")}</TableHead>
                    <TableHead>{t("staff.col.status")}</TableHead>
                    <TableHead>{t("staff.col.lastLogin")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffQuery.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {slice.rows.map((staff) => (
                    <TableRow key={staff.id} data-testid={`row-staff-${staff.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={staff.name} className="size-8" />
                          <span className="font-medium text-ink">{staff.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-ink-secondary">{staff.email}</TableCell>
                      <TableCell>
                        <StatusPill tone="brand">{staff.roleName}</StatusPill>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={staff.isActive ? "success" : "neutral"} icon={staff.isActive ? CheckCircle2 : XCircle}>
                          {staff.isActive ? t("status.active") : t("status.inactive")}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="tabular-nums text-ink-secondary">{formatDate(staff.lastLoginAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t("staff.edit")} ${staff.name}`}
                                title={t("staff.edit")}
                                onClick={() => openEdit(staff)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              {staff.isActive ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("staff.deactivate")} ${staff.name}`}
                                  title={t("staff.deactivate")}
                                  onClick={() => setDeactivating(staff)}
                                >
                                  <UserX aria-hidden="true" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("staff.activate")} ${staff.name}`}
                                  title={t("staff.activate")}
                                  onClick={() => void setActive(staff, true)}
                                >
                                  <UserCheck aria-hidden="true" />
                                </Button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {!staffQuery.isPending && filtered.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={all.length === 0 ? t("staff.empty.title") : t("staff.empty.noResults")}
                  action={
                    all.length === 0 ? (
                      addButton
                    ) : (
                      <Button variant="outlinePrimary" className="rounded-lg" onClick={() => setSearch("")}>
                        {t("common.clearSearch")}
                      </Button>
                    )
                  }
                />
              ) : null}

              <DataTableFooter
                page={slice.page}
                totalPages={slice.totalPages}
                pageSize={pageSize}
                summary={t("page.showing", { from: slice.from, to: slice.to, total: slice.total })}
                labels={{
                  show: t("page.show"),
                  perPage: t("page.perPage"),
                  all: t("page.all"),
                  previous: t("page.previous"),
                  next: t("page.next"),
                }}
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

      <StaffFormDialog open={formOpen} onOpenChange={setFormOpen} staff={formStaff} roles={rolesQuery.data ?? []} />

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        title={t("staff.deactivateTitle")}
        description={t("staff.deactivateDescription", { name: deactivating?.name ?? "" })}
        confirmLabel={t("staff.deactivate")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={updateStaff.isPending}
        onConfirm={() => (deactivating ? setActive(deactivating, false) : undefined)}
      />
    </div>
  );
}
