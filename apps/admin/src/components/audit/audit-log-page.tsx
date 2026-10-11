"use client";

import type { AuditLogDto } from "@oca/shared";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  cn,
} from "@oca/ui";
import { AlertCircle, Eye, ScrollText } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useId, useState } from "react";
import { ServerPager } from "@/components/common/server-pager";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { type AuditLogParams, useAuditFacets, useAuditLogs, useStaffList } from "@/lib/queries";
import { actionGroups, auditDiff, entityHref } from "./audit-diff";

const COLUMNS = 6;

export interface AuditLogPageProps {
  initialEntity?: string;
  initialEntityId?: string;
}

export function AuditLogPage({ initialEntity = "", initialEntityId = "" }: AuditLogPageProps) {
  const { t } = useT();
  const id = useId();
  const [filters, setFilters] = useState({
    userId: "",
    action: "",
    entity: initialEntity,
    entityId: initialEntityId,
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<AuditLogDto | null>(null);

  const rangeInvalid = filters.from !== "" && filters.to !== "" && filters.to < filters.from;
  const params: AuditLogParams = {
    ...filters,
    ...(rangeInvalid ? { from: "", to: "" } : {}),
    page,
    pageSize,
  };
  const query = useAuditLogs(params);
  const facets = useAuditFacets();
  const staff = useStaffList();
  const actions = facets.data?.actions ?? [];

  function set<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }
  const hasFilters = Object.values(filters).some((value) => value !== "");
  const rows = query.data?.items ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("audit.title")]}
        title={t("audit.title")}
        badge={query.data ? t("audit.count", { count: query.data.total }) : undefined}
        description={t("audit.description")}
      />

      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="grid gap-3 px-3 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-6">
            <FilterLabel htmlFor={`${id}-user`} label={t("audit.filter.user")}>
              <Select id={`${id}-user`} value={filters.userId} onChange={(event) => set("userId", event.target.value)}>
                <option value="">{t("audit.filter.all")}</option>
                {(staff.data ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </FilterLabel>
            <FilterLabel htmlFor={`${id}-action`} label={t("audit.filter.action")}>
              <Select id={`${id}-action`} value={filters.action} onChange={(event) => set("action", event.target.value)}>
                <option value="">{t("audit.filter.all")}</option>
                {actionGroups(actions).map((group) => (
                  <option key={group} value={group}>
                    {t("audit.filter.group", { prefix: group.slice(0, -2) })}
                  </option>
                ))}
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </Select>
            </FilterLabel>
            <FilterLabel htmlFor={`${id}-entity`} label={t("audit.filter.entity")}>
              <Select id={`${id}-entity`} value={filters.entity} onChange={(event) => set("entity", event.target.value)}>
                <option value="">{t("audit.filter.all")}</option>
                {(facets.data?.entities ?? []).map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </Select>
            </FilterLabel>
            <FilterLabel htmlFor={`${id}-entityId`} label={t("audit.filter.entityId")}>
              <Input
                id={`${id}-entityId`}
                value={filters.entityId}
                onChange={(event) => set("entityId", event.target.value.trim())}
                placeholder="ID"
              />
            </FilterLabel>
            <FilterLabel htmlFor={`${id}-from`} label={t("report.range.from")}>
              <Input id={`${id}-from`} type="date" value={filters.from} invalid={rangeInvalid} onChange={(event) => set("from", event.target.value)} />
            </FilterLabel>
            <FilterLabel htmlFor={`${id}-to`} label={t("report.range.to")}>
              <Input id={`${id}-to`} type="date" value={filters.to} invalid={rangeInvalid} onChange={(event) => set("to", event.target.value)} />
            </FilterLabel>
          </div>
          {hasFilters ? (
            <div className="-mt-2 px-3 pb-3 sm:px-6">
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => {
                  setFilters({ userId: "", action: "", entity: "", entityId: "", from: "", to: "" });
                  setPage(1);
                }}
              >
                {t("audit.filter.clear")}
              </Button>
            </div>
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
              <Table aria-busy={query.isFetching}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("audit.col.time")}</TableHead>
                    <TableHead>{t("audit.col.user")}</TableHead>
                    <TableHead>{t("audit.col.action")}</TableHead>
                    <TableHead>{t("audit.col.entity")}</TableHead>
                    <TableHead>{t("audit.col.ip")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((row) => {
                    const href = entityHref(row.entity, row.entityId);
                    return (
                      <TableRow key={row.id} data-testid={`row-audit-${row.id}`}>
                        <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(row.createdAt)}</TableCell>
                        <TableCell>{row.user ? row.user.name : <span className="text-ink-muted">{t("audit.system")}</span>}</TableCell>
                        <TableCell>
                          <code className="rounded bg-subtle px-1.5 py-0.5 text-xs text-ink">{row.action}</code>
                        </TableCell>
                        <TableCell>
                          <span className="text-ink-secondary">{row.entity}</span>
                          {row.entityId ? (
                            href ? (
                              <Link href={href} className="ml-1.5 font-mono text-xs text-brand hover:underline">
                                {row.entityId}
                              </Link>
                            ) : (
                              <span className="ml-1.5 font-mono text-xs text-ink-muted">{row.entityId}</span>
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-ink-muted">{row.ip ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-lg"
                              aria-label={t("audit.detail.open", { action: row.action })}
                              title={t("audit.detail.title")}
                              onClick={() => setSelected(row)}
                            >
                              <Eye aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? <EmptyState icon={ScrollText} title={t("audit.empty")} /> : null}
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
      </div>

      <AuditDetailDialog
        row={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}

function FilterLabel({ htmlFor, label, children }: { htmlFor: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs text-ink-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}

function AuditDetailDialog({ row, onOpenChange }: { row: AuditLogDto | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  const diff = row ? auditDiff(row.before, row.after) : [];
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t("common.close")}>
        <DialogHeader
          title={t("audit.detail.title")}
          description={row ? `${row.action} · ${formatDateTime(row.createdAt)} · ${row.user?.name ?? t("audit.system")}` : ""}
        />
        <DialogBody>
          {row ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-secondary">{t("audit.col.entity")}</dt>
              <dd className="break-all font-mono text-xs text-ink">
                {row.entity}
                {row.entityId ? ` · ${row.entityId}` : ""}
              </dd>
              <dt className="text-ink-secondary">{t("audit.col.ip")}</dt>
              <dd className="font-mono text-xs text-ink">{row.ip ?? "—"}</dd>
              {row.user ? (
                <>
                  <dt className="text-ink-secondary">{t("audit.col.user")}</dt>
                  <dd className="text-ink">
                    {row.user.name} <span className="text-ink-muted">({row.user.email})</span>
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {diff.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("audit.detail.noData")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("audit.detail.field")}</TableHead>
                  <TableHead>{t("audit.detail.before")}</TableHead>
                  <TableHead>{t("audit.detail.after")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diff.map((line) => (
                  <TableRow key={line.key} data-changed={line.changed || undefined} className={cn(line.changed && "bg-warning-soft/40")}>
                    <TableCell className="font-mono text-xs">{line.key}</TableCell>
                    <TableCell className="max-w-[220px] break-all font-mono text-xs text-ink-secondary">{line.before}</TableCell>
                    <TableCell className={cn("max-w-[220px] break-all font-mono text-xs", line.changed ? "font-semibold text-ink" : "text-ink-secondary")}>
                      {line.after}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
