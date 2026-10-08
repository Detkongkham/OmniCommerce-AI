"use client";

import { LIVE_SESSION_STATUSES, type LiveSessionStatus } from "@oca/shared";
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
} from "@oca/ui";
import { AlertCircle, Plus, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { formatDateTime } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { useLiveSessions } from "@/lib/queries";
import { LiveStatusPill } from "./live-status";
import { SessionFormDialog } from "./session-form-dialog";

const COLUMNS = 6;
const HEADERS: { key: TranslationKey; right?: boolean }[] = [
  { key: "live.col.title" },
  { key: "live.col.kind" },
  { key: "live.col.status" },
  { key: "live.col.items", right: true },
  { key: "live.col.comments", right: true },
  { key: "live.col.created" },
];

export function SessionList() {
  const { t } = useT();
  const router = useRouter();
  const canWrite = useCan("live-cf:write");
  const [status, setStatus] = useState<LiveSessionStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const query = useLiveSessions({ status, page, pageSize });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const busy = query.isPending || query.isPlaceholderData;
  const isEmpty = !busy && rows.length === 0 && total === 0;

  // ຂໍ້ມູນຫຼຸດລົງຈົນໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ: ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => setCreateOpen(true)}>
      <Plus aria-hidden="true" />
      {t("live.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("live.title")]}
        title={t("live.title")}
        badge={query.data ? t("live.count", { count: query.data.total }) : undefined}
        description={t("live.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
            <Select
              aria-label={t("live.filter.status")}
              className="w-48"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as LiveSessionStatus | "");
                setPage(1);
              }}
            >
              <option value="">{t("live.filter.allStatuses")}</option>
              {LIVE_SESSION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`live.status.${value}`)}
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
                {!busy && rows.length > 0 ? t("live.found", { count: total }) : ""}
              </p>
              <Table aria-label={t("live.table")} aria-busy={busy}>
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
                  {rows.map((session) => (
                    <TableRow key={session.id} data-testid={`row-live-${session.id}`}>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <Link href={`/live/${session.id}`} className="font-semibold text-brand-ink hover:underline">
                          {session.title}
                        </Link>
                        {session.externalPostId ? (
                          <p className="font-mono text-xs text-ink-muted">{session.externalPostId}</p>
                        ) : null}
                      </th>
                      <TableCell className="text-ink-secondary">{t(`live.kind.${session.kind}`)}</TableCell>
                      <TableCell>
                        <LiveStatusPill status={session.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{session.itemCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{session.commentCount}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(session.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isEmpty ? (
                <div role="status">
                  <EmptyState
                    icon={Radio}
                    title={status !== "" ? t("live.empty.noResults") : t("live.empty.title")}
                    description={status !== "" ? undefined : t("live.empty.hint")}
                    action={
                      status !== "" ? (
                        <Button
                          variant="outlinePrimary"
                          className="rounded-lg"
                          onClick={() => {
                            setStatus("");
                            setPage(1);
                          }}
                        >
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
      {canWrite ? (
        <SessionFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          session={null}
          onSaved={(session) => router.push(`/live/${session.id}`)}
        />
      ) : null}
    </div>
  );
}
