"use client";

import { CF_OUTCOMES, type CfOutcome } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  toast,
} from "@oca/ui";
import { AlertCircle, MessageSquareText, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { cfReplyErrorKey } from "@/lib/live";
import { useCfComments, useResendCfReply } from "@/lib/queries";
import type { CfCommentDto } from "@/lib/types";
import { CfOutcomePill, CfReplyStatusPill } from "./live-status";

const COLUMNS = 6;
const HEADERS: TranslationKey[] = [
  "live.comments.col.time",
  "live.comments.col.author",
  "live.comments.col.message",
  "live.comments.col.outcome",
  "live.comments.col.order",
  "live.comments.col.reply",
];

/** ledger ຄອມເມັ້ນຂອງ session; `live` = ກຳລັງດັກ CF → poll ທຸກ 5 ວິ */
export function CommentLedgerCard({ sessionId, live }: { sessionId: string; live: boolean }) {
  const { t } = useT();
  const canResend = useCan("live-cf:write");
  const canReadOrders = useCan("orders:read");
  const resend = useResendCfReply();
  const [outcome, setOutcome] = useState<CfOutcome | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  // ຄອມເມັ້ນທີ່ກຳລັງສົ່ງໃໝ່ (ປຸ່ມຂອງແຖວນັ້ນ loading; ແຖວອື່ນກົດໄດ້ຫຼັງຈົບ)
  const [resendingId, setResendingId] = useState<string | null>(null);
  const query = useCfComments(sessionId, { outcome, page, pageSize }, { live });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const busy = query.isPending || query.isPlaceholderData;
  const isEmpty = !busy && rows.length === 0 && total === 0;

  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  async function onResend(comment: CfCommentDto) {
    if (resendingId) return;
    setResendingId(comment.id);
    try {
      // API ຕອບ 200 ພ້ອມສະຖານະປັດຈຸບັນ: ຕ້ອງອ່ານ replyStatus (ອາດລົ້ມອີກ ຫຼື ມີຄຳຂໍອື່ນກຳລັງສົ່ງ)
      const result = await resend.mutateAsync({ sessionId, commentId: comment.id });
      if (result.replyStatus === "SENT") toast.success(t("live.comments.toast.resent"));
      else if (result.replyStatus === "SENDING") toast.info(t("live.comments.toast.resendPending"));
      else toast.error(t("live.comments.toast.resendFailed", { reason: t(cfReplyErrorKey(result.replyErrorCode)) }));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setResendingId(null);
    }
  }

  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-end justify-between gap-3 px-3 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-bold text-ink">{t("live.comments.title")}</h2>
          <p className="text-xs text-ink-muted">{t("live.comments.description")}</p>
        </div>
        <Select
          aria-label={t("live.comments.filter.outcome")}
          className="w-48"
          value={outcome}
          onChange={(event) => {
            setOutcome(event.target.value as CfOutcome | "");
            setPage(1);
          }}
        >
          <option value="">{t("live.comments.filter.all")}</option>
          {CF_OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {t(`live.outcome.${value}`)}
            </option>
          ))}
        </Select>
      </div>

      {query.isError && !query.data ? (
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
          <Table aria-label={t("live.comments.table")} aria-busy={busy}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {HEADERS.map((key) => (
                  <TableHead key={key} scope="col">
                    {t(key)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
              {rows.map((comment) => (
                <TableRow key={comment.id} data-testid={`row-comment-${comment.id}`}>
                  <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(comment.createdAt)}</TableCell>
                  <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                    {comment.authorName}
                  </th>
                  <TableCell className="max-w-[280px] break-words text-ink">{comment.message}</TableCell>
                  <TableCell>
                    <CfOutcomePill outcome={comment.outcome} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {comment.orderId && comment.orderNumber ? (
                      canReadOrders ? (
                        <Link href={`/orders/${comment.orderId}`} className="font-mono font-semibold text-brand-ink hover:underline">
                          {comment.orderNumber}
                        </Link>
                      ) : (
                        <span className="font-mono">{comment.orderNumber}</span>
                      )
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <CfReplyStatusPill status={comment.replyStatus} />
                      {comment.replyStatus === "FAILED" && canResend ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          aria-label={t("live.comments.resendLabel", { name: comment.authorName })}
                          loading={resendingId === comment.id}
                          disabled={resendingId !== null && resendingId !== comment.id}
                          onClick={() => void onResend(comment)}
                        >
                          <RotateCw aria-hidden="true" />
                          {t("live.comments.resend")}
                        </Button>
                      ) : null}
                    </div>
                    {comment.replyStatus === "FAILED" ? (
                      <p className="mt-1 max-w-[260px] text-xs text-danger-ink">{t(cfReplyErrorKey(comment.replyErrorCode))}</p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isEmpty ? (
            <div role="status">
              <EmptyState
                icon={MessageSquareText}
                title={outcome !== "" ? t("live.comments.emptyFiltered") : t("live.comments.empty")}
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
