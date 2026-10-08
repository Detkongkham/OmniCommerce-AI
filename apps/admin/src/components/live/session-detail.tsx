"use client";

import { Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, buttonVariants, cn, toast } from "@oca/ui";
import { AlertCircle, ArrowLeft, Pencil, Play, RefreshCw, Square } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { startBlocker } from "@/lib/live";
import { type LiveSessionAction, useLiveSession, useLiveSessionAction } from "@/lib/queries";
import type { LiveSessionDetailDto } from "@/lib/types";
import { CommentLedgerCard } from "./comment-ledger-card";
import { LiveStatusPill } from "./live-status";
import { SessionFormDialog } from "./session-form-dialog";
import { SessionItemsCard } from "./session-items-card";

const START_HINT_ID = "live-start-hint";

function BackLink() {
  const { t } = useT();
  return (
    <Link href="/live" className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 rounded-xl px-3")}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("live.detail.back")}
    </Link>
  );
}

export function SessionDetail({ id }: { id: string }) {
  const { t } = useT();
  const query = useLiveSession(id);

  if (!query.data) {
    if (query.isError) {
      const notFound = query.error instanceof ApiError && (query.error.status === 404 || query.error.code === "LIVE_SESSION_NOT_FOUND");
      return (
        <div className="p-6">
          <EmptyState
            icon={AlertCircle}
            title={notFound ? t("live.detail.notFound") : t("common.error.load")}
            description={notFound ? undefined : errorMessage(query.error, t)}
            action={
              notFound ? (
                <BackLink />
              ) : (
                <div className="flex gap-2">
                  <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                    {t("common.retry")}
                  </Button>
                  <BackLink />
                </div>
              )
            }
          />
        </div>
      );
    }
    return (
      <div role="status" aria-busy="true" aria-label={t("common.loading")} className="space-y-4 p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <SessionDetailBody session={query.data} stale={query.isRefetchError} />;
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function SessionDetailBody({ session, stale }: { session: LiveSessionDetailDto; stale: boolean }) {
  const { t } = useT();
  const canWrite = useCan("live-cf:write");
  const act = useLiveSessionAction();
  const [editOpen, setEditOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  // ຜູກກັບສະຖານະຕອນເກີດ: refetch ໄດ້ສະຖານະໃໝ່ ແລ້ວຂໍ້ຄວາມເກົ່າບໍ່ຄ້າງ
  const [error, setError] = useState<{ message: string; status: LiveSessionDetailDto["status"] } | null>(null);
  const live = session.status === "LIVE";
  const blocker = session.status === "DRAFT" ? startBlocker(session) : null;

  async function run(action: LiveSessionAction) {
    if (act.isPending) return;
    setError(null);
    try {
      await act.mutateAsync({ id: session.id, action });
      toast.success(t(action === "start" ? "live.toast.started" : "live.toast.ended"));
    } catch (caught) {
      setError({ message: errorMessage(caught, t), status: session.status });
    } finally {
      setEndOpen(false);
    }
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <BackLink />
      {canWrite && session.status !== "ENDED" ? (
        <Button variant="outline" className="h-9 rounded-xl" onClick={() => setEditOpen(true)}>
          <Pencil aria-hidden="true" />
          {t("common.edit")}
        </Button>
      ) : null}
      {canWrite && session.status === "DRAFT" ? (
        <Button
          className="h-9 rounded-xl"
          disabled={blocker !== null}
          aria-describedby={blocker ? START_HINT_ID : undefined}
          loading={act.isPending}
          onClick={() => void run("start")}
        >
          <Play aria-hidden="true" />
          {t("live.action.start")}
        </Button>
      ) : null}
      {canWrite && live ? (
        <Button variant="destructive" className="h-9 rounded-xl" onClick={() => setEndOpen(true)}>
          <Square aria-hidden="true" />
          {t("live.action.end")}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("live.title"), session.title]}
        title={session.title}
        badge={t(`live.kind.${session.kind}`)}
        actions={actions}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        {canWrite && blocker ? (
          <p id={START_HINT_ID} className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            {t(blocker === "noPost" ? "live.start.noPost" : "live.start.noItems")}
          </p>
        ) : null}
        {error && error.status === session.status ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error.message}
          </p>
        ) : null}
        {stale ? (
          <p role="status" className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            {t("live.detail.stale")}
          </p>
        ) : null}

        <Card className="rounded-[20px] p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <LiveStatusPill status={session.status} />
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {t("live.detail.polling")}
              </span>
            ) : null}
          </div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label={t("live.detail.postId")}>
              {session.externalPostId ? (
                <span className="break-all font-mono">{session.externalPostId}</span>
              ) : (
                <span className="text-ink-muted">{t("live.detail.noPostId")}</span>
              )}
            </InfoItem>
            <InfoItem label={t("live.detail.publicReply")}>
              {session.publicReplyEnabled ? t("live.detail.on") : t("live.detail.off")}
            </InfoItem>
            <InfoItem label={t("live.detail.createdAt")}>{formatDateTime(session.createdAt)}</InfoItem>
            {session.startedAt ? <InfoItem label={t("live.detail.startedAt")}>{formatDateTime(session.startedAt)}</InfoItem> : null}
            {session.endedAt ? <InfoItem label={t("live.detail.endedAt")}>{formatDateTime(session.endedAt)}</InfoItem> : null}
          </dl>
        </Card>

        <SessionItemsCard session={session} />
        <CommentLedgerCard sessionId={session.id} live={live} />
      </div>

      {canWrite ? (
        <>
          <SessionFormDialog open={editOpen} onOpenChange={setEditOpen} session={session} />
          <ConfirmDialog
            open={endOpen}
            onOpenChange={setEndOpen}
            title={t("live.end.title")}
            description={t("live.end.description")}
            confirmLabel={t("live.end.confirm")}
            cancelLabel={t("common.cancel")}
            closeLabel={t("common.close")}
            busy={act.isPending}
            onConfirm={() => run("end")}
          />
        </>
      ) : null}
    </div>
  );
}
