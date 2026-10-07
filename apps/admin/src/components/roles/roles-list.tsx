"use client";

import { PERMISSIONS } from "@oca/shared";
import {
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
  formatNumber,
  paginate,
  toast,
} from "@oca/ui";
import { AlertCircle, Eye, Lock, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useDeleteRole, useRoleList } from "@/lib/queries";
import type { RoleDto } from "@/lib/types";
import { RoleFormDialog } from "./role-form-dialog";

const COLUMNS = 5;

export function RolesList() {
  const { t } = useT();
  const canWrite = useCan("staff:write");
  const rolesQuery = useRoleList();
  const deleteRole = useDeleteRole();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [formRole, setFormRole] = useState<RoleDto | null>(null);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);

  const all = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return all;
    return all.filter((role) => [role.name, role.description ?? ""].some((value) => value.toLowerCase().includes(query)));
  }, [all, search]);
  const slice = paginate(filtered, page, pageSize);

  function openForm(role: RoleDto | null) {
    setFormRole(role);
    setFormOpen(true);
  }

  async function confirmDelete(role: RoleDto) {
    try {
      await deleteRole.mutateAsync(role.id);
      toast.success(t("roles.toast.deleted"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setDeleting(null);
    }
  }

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => openForm(null)}>
      <Plus aria-hidden="true" />
      {t("roles.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("roles.title")]}
        title={t("roles.title")}
        badge={rolesQuery.data ? t("roles.count", { count: all.length }) : undefined}
        description={t("roles.description")}
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
                placeholder={t("roles.search")}
                aria-label={t("roles.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>

          {rolesQuery.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void rolesQuery.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("roles.col.name")}</TableHead>
                    <TableHead>{t("roles.col.description")}</TableHead>
                    <TableHead className="text-right">{t("roles.col.permissions")}</TableHead>
                    <TableHead className="text-right">{t("roles.col.users")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rolesQuery.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {slice.rows.map((role) => {
                    const readOnly = !canWrite || role.isSystem;
                    return (
                      <TableRow key={role.id} data-testid={`row-role-${role.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink">{role.name}</span>
                            {role.isSystem ? (
                              <StatusPill tone="info" icon={Lock}>
                                {t("roles.system")}
                              </StatusPill>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-ink-secondary">{role.description ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-ink-secondary">
                          {role.permissions.length}/{PERMISSIONS.length}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-ink-secondary">
                          {formatNumber(role.userCount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-lg"
                              aria-label={`${readOnly ? t("common.view") : t("common.edit")} ${role.name}`}
                              title={readOnly ? t("common.view") : t("common.edit")}
                              onClick={() => openForm(role)}
                            >
                              {readOnly ? <Eye aria-hidden="true" /> : <Pencil aria-hidden="true" />}
                            </Button>
                            {canWrite && !role.isSystem ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg text-danger"
                                aria-label={`${t("common.delete")} ${role.name}`}
                                title={t("common.delete")}
                                onClick={() => setDeleting(role)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {!rolesQuery.isPending && filtered.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title={all.length === 0 ? t("roles.empty.title") : t("roles.empty.noResults")}
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

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={formRole}
        readOnly={!canWrite || formRole?.isSystem === true}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("roles.deleteTitle")}
        description={t("common.deleteConfirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={deleteRole.isPending}
        onConfirm={() => (deleting ? confirmDelete(deleting) : undefined)}
      />
    </div>
  );
}
