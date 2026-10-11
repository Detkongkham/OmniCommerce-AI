"use client";

import { EDITABLE_POST_STATUSES, POST_MEDIA_MAX, POST_MESSAGE_MAX } from "@oca/shared";
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, PageHeader, Select, Skeleton, buttonVariants, cn, toast } from "@oca/ui";
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, Loader2, RotateCcw, Send, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { type PostFormState, emptyPostForm, postFormFromDto, validatePostForm } from "@/lib/post-form";
import type { SocialPostDto } from "@/lib/posts";
import { useLiveSessions } from "@/lib/queries";
import { useDeletePost, usePost, usePostAction, useSavePost } from "@/lib/queries-posts";
import { PostMediaEditor } from "./post-media-editor";
import { PostPreview } from "./post-preview";
import { publishErrorText } from "./post-status";

const EDITABLE: readonly string[] = EDITABLE_POST_STATUSES;

/** `/posts/new` (id = null) ແລະ `/posts/:id` */
export function PostForm({ id }: { id: string | null }) {
  const { t } = useT();
  const query = usePost(id);
  if (id === null) return <PostEditor post={null} />;
  if (query.isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t("common.error.load")}
        action={
          <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!query.data) {
    return (
      <div className="space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-[20px]" />
      </div>
    );
  }
  return <PostEditor post={query.data} />;
}

type Busy = "draft" | "publish" | "cancel" | "retry" | "delete" | null;

function PostEditor({ post }: { post: SocialPostDto | null }) {
  const { t } = useT();
  const router = useRouter();
  const canWrite = useCan("posting:write");
  const save = useSavePost();
  const action = usePostAction();
  const remove = useDeletePost();
  // ຕັ້ງຈາກ post ຄັ້ງທຳອິດເທົ່ານັ້ນ: ການ poll ສະຖານະບໍ່ລ້າງສິ່ງທີ່ກຳລັງແກ້
  const [form, setForm] = useState<PostFormState>(() => (post ? postFormFromDto(post) : emptyPostForm()));
  const [uploading, setUploading] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  const status = post?.status ?? "DRAFT";
  const editable = canWrite && EDITABLE.includes(status);
  const patch = (change: Partial<PostFormState>) => setForm((current) => ({ ...current, ...change }));

  useEffect(() => {
    if (problems.length > 0) alertRef.current?.focus();
  }, [problems]);

  /** ບັນທຶກເນື້ອຫາ (ສ້າງ ຫຼື ແກ້); ຄືນ id ຂອງໂພສ ຫຼື null ຖ້າຟອມບໍ່ຜ່ານ */
  async function persist(publish: boolean): Promise<{ id: string; scheduledAt: string | undefined } | null> {
    if (uploading > 0) {
      setProblems([t("posts.validation.uploading")]);
      return null;
    }
    const result = validatePostForm(form, publish, t);
    if (!result.ok) {
      setProblems(result.messages);
      return null;
    }
    setProblems([]);
    const { liveSessionId, ...rest } = result.content;
    const saved = post
      ? await save.mutateAsync({ id: post.id, input: { ...rest, liveSessionId } })
      : await save.mutateAsync({ id: null, input: liveSessionId ? { ...rest, liveSessionId } : rest });
    return { id: saved.id, scheduledAt: result.scheduledAt };
  }

  async function run(kind: Exclude<Busy, null>, work: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    try {
      await work();
    } catch (error) {
      setProblems([errorMessage(error, t)]);
    } finally {
      setBusy(null);
    }
  }

  const saveDraft = () =>
    run("draft", async () => {
      const saved = await persist(false);
      if (!saved) return;
      toast.success(t("posts.toast.saved"));
      if (!post) router.replace(`/posts/${saved.id}`);
    });

  const publish = () =>
    run("publish", async () => {
      const saved = await persist(true);
      if (!saved) return;
      await action.mutateAsync({ id: saved.id, action: { kind: "schedule", scheduledAt: saved.scheduledAt } });
      toast.success(saved.scheduledAt ? t("posts.toast.scheduled") : t("posts.toast.publishing"));
      if (!post) router.replace(`/posts/${saved.id}`);
    });

  const cancelSchedule = () =>
    run("cancel", async () => {
      if (!post) return;
      await action.mutateAsync({ id: post.id, action: { kind: "cancel" } });
      patch({ when: "now" });
      toast.success(t("posts.toast.cancelled"));
    });

  const retry = () =>
    run("retry", async () => {
      if (!post) return;
      await action.mutateAsync({ id: post.id, action: { kind: "retry" } });
      toast.success(t("posts.toast.publishing"));
    });

  const confirmRemove = () =>
    run("delete", async () => {
      if (!post) return;
      await remove.mutateAsync(post.id);
      setConfirmDelete(false);
      toast.success(t("posts.toast.deleted"));
      router.replace("/posts");
    });

  const title = !post ? t("posts.form.createTitle") : editable ? t("posts.form.editTitle") : t("posts.form.viewTitle");
  const publishLabel = form.when === "later" ? t("posts.action.schedule") : t("posts.action.publishNow");

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("posts.title"), title]}
        title={title}
        badge={post ? t(`posts.status.${post.status}`) : undefined}
        description={t("posts.form.description", { max: POST_MEDIA_MAX })}
        actions={
          <>
            <Link href="/posts" className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}>
              {editable ? t("common.cancel") : t("posts.action.back")}
            </Link>
            {editable && post ? (
              <Button variant="outline" className="rounded-xl text-danger" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden="true" />
                {t("posts.action.delete")}
              </Button>
            ) : null}
            {editable ? (
              <>
                <Button variant="outline" className="rounded-xl" loading={busy === "draft"} disabled={busy !== null && busy !== "draft"} onClick={() => void saveDraft()}>
                  {t("posts.action.saveDraft")}
                </Button>
                <Button className="rounded-xl font-bold" loading={busy === "publish"} disabled={busy !== null && busy !== "publish"} onClick={() => void publish()}>
                  {form.when === "later" ? <CalendarClock aria-hidden="true" /> : <Send aria-hidden="true" />}
                  {publishLabel}
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        {post ? <StatusBanner post={post} canWrite={canWrite} busy={busy} onCancel={() => void cancelSchedule()} onRetry={() => void retry()} /> : null}

        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className={cn(
            "rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40",
            problems.length === 0 && "hidden",
          )}
        >
          <ul className="list-inside list-disc">
            {problems.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Card className="rounded-[20px] p-6">
              <h2 className="mb-4 text-base font-bold text-ink">{t("posts.section.content")}</h2>
              <Field label={t("posts.field.message")} htmlFor="post-message">
                <textarea
                  id="post-message"
                  rows={8}
                  value={form.message}
                  readOnly={!editable}
                  aria-describedby="post-message-count"
                  onChange={(event) => patch({ message: event.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 read-only:bg-subtle"
                />
              </Field>
              <p
                id="post-message-count"
                className={cn("mt-1 text-right text-xs tabular-nums", form.message.trim().length > POST_MESSAGE_MAX ? "text-danger" : "text-ink-muted")}
              >
                {t("posts.field.messageCount", { count: form.message.trim().length, max: POST_MESSAGE_MAX })}
              </p>
            </Card>

            <Card className="rounded-[20px] p-6">
              <h2 className="mb-4 text-base font-bold text-ink">{t("posts.section.images", { count: form.media.length, max: POST_MEDIA_MAX })}</h2>
              <PostMediaEditor
                media={form.media}
                onChange={(update) => setForm((current) => ({ ...current, media: update(current.media) }))}
                onUploadingChange={setUploading}
                disabled={!editable}
              />
            </Card>

            <Card className="rounded-[20px] p-6">
              <h2 className="mb-4 text-base font-bold text-ink">{t("posts.section.cf")}</h2>
              <SessionSelect value={form.liveSessionId} linked={post?.liveSession ?? null} disabled={!editable} onChange={(liveSessionId) => patch({ liveSessionId })} />
            </Card>

            {editable ? (
              <Card className="rounded-[20px] p-6">
                <h2 className="mb-4 text-base font-bold text-ink">{t("posts.section.publish")}</h2>
                <fieldset>
                  <legend className="sr-only">{t("posts.when.label")}</legend>
                  <div className="flex flex-wrap gap-4">
                    {(["now", "later"] as const).map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm text-ink">
                        <input type="radio" name="post-when" value={value} checked={form.when === value} onChange={() => patch({ when: value })} className="accent-brand" />
                        {t(`posts.when.${value}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {form.when === "later" ? (
                  <Field label={t("posts.field.scheduledAt")} htmlFor="post-scheduled-at" className="mt-4 max-w-xs">
                    <Input id="post-scheduled-at" type="datetime-local" value={form.scheduledAt} onChange={(event) => patch({ scheduledAt: event.target.value })} />
                  </Field>
                ) : null}
              </Card>
            ) : null}
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            <h2 className="mb-2 text-sm font-semibold text-ink-secondary">{t("posts.preview.title")}</h2>
            <PostPreview message={form.message} media={form.media} />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("posts.delete.title")}
        description={t("posts.delete.description")}
        confirmLabel={t("posts.action.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={busy === "delete"}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function SessionSelect(props: {
  value: string;
  linked: SocialPostDto["liveSession"];
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const { t } = useT();
  const canReadLive = useCan("live-cf:read");
  if (props.disabled) {
    return (
      <p className="text-sm text-ink">
        {props.linked ? (
          <Link href={`/live/${props.linked.id}`} className="font-semibold text-brand-ink hover:underline">
            {props.linked.title}
          </Link>
        ) : (
          t("posts.field.noSession")
        )}
      </p>
    );
  }
  return (
    <>
      <Field label={t("posts.field.session")} htmlFor="post-session" className="max-w-md">
        <Select id="post-session" aria-describedby="post-session-hint" value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          <option value="">{t("posts.field.noSession")}</option>
          {canReadLive ? <SessionOptions linked={props.linked} /> : props.linked ? <option value={props.linked.id}>{props.linked.title}</option> : null}
        </Select>
      </Field>
      <p id="post-session-hint" className="mt-2 text-xs text-ink-muted">
        {t("posts.field.sessionHint")}
      </p>
    </>
  );
}

/** session ທີ່ເລືອກໄດ້: ແບບໂພສ, ຮ່າງ, ຍັງບໍ່ມີ post id (API ກວດຊ້ຳ) + ອັນທີ່ຜູກຢູ່ແລ້ວ */
function SessionOptions({ linked }: { linked: SocialPostDto["liveSession"] }) {
  const sessions = useLiveSessions({ status: "DRAFT", page: 1, pageSize: 100 });
  const options = (sessions.data?.items ?? []).filter((session) => session.kind === "POST" && !session.externalPostId);
  const current = linked && !options.some((session) => session.id === linked.id) ? [linked] : [];
  return (
    <>
      {[...current, ...options].map((session) => (
        <option key={session.id} value={session.id}>
          {session.title}
        </option>
      ))}
    </>
  );
}

function StatusBanner(props: { post: SocialPostDto; canWrite: boolean; busy: Busy; onCancel: () => void; onRetry: () => void }) {
  const { t } = useT();
  const { post } = props;
  const box = "flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 text-sm";

  if (post.status === "SCHEDULED" && post.scheduledAt) {
    return (
      <div role="status" className={cn(box, "border-info-line bg-info-soft text-info-ink")}>
        <p className="flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          {t("posts.banner.scheduled", { time: formatDateTime(post.scheduledAt) })}
        </p>
        {props.canWrite ? (
          <Button variant="outline" className="h-8 rounded-lg bg-surface" loading={props.busy === "cancel"} disabled={props.busy !== null && props.busy !== "cancel"} onClick={props.onCancel}>
            {t("posts.action.cancelSchedule")}
          </Button>
        ) : null}
      </div>
    );
  }
  if (post.status === "PUBLISHING") {
    return (
      <div role="status" className={cn(box, "border-warning-line bg-warning-soft text-warning-ink")}>
        <p className="flex items-center gap-2">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {t("posts.banner.publishing")}
        </p>
      </div>
    );
  }
  if (post.status === "FAILED") {
    const uncertain = post.errorCode === "PUBLISH_UNCERTAIN" || post.errorCode === "CHANNEL_UNAVAILABLE";
    return (
      <div role="alert" className={cn(box, "border-danger-line bg-danger-soft text-danger-ink")}>
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-semibold">
            <XCircle className="size-4 shrink-0" aria-hidden="true" />
            {t("posts.banner.failed")}: {publishErrorText(post.errorCode, t)}
          </p>
          {post.errorMessage ? <p className="break-words text-xs opacity-80">{post.errorMessage}</p> : null}
          {uncertain ? <p className="text-xs font-semibold">{t("posts.banner.checkPage")}</p> : null}
        </div>
        {props.canWrite ? (
          <Button variant="outline" className="h-8 rounded-lg bg-surface" loading={props.busy === "retry"} disabled={props.busy !== null && props.busy !== "retry"} onClick={props.onRetry}>
            <RotateCcw aria-hidden="true" />
            {t("posts.action.retry")}
          </Button>
        ) : null}
      </div>
    );
  }
  if (post.status === "PUBLISHED") {
    return (
      <div className="space-y-3">
        <div role="status" className={cn(box, "border-success-line bg-success-soft text-success-ink")}>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {t("posts.banner.published", { time: formatDateTime(post.publishedAt) })}
          </p>
          {post.permalinkUrl ? (
            <a href={post.permalinkUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "h-8 rounded-lg bg-surface")}>
              <ExternalLink aria-hidden="true" />
              {t("posts.action.openPost")}
            </a>
          ) : null}
        </div>
        {post.liveSession ? (
          <div
            role={post.cfLinkError ? "alert" : "status"}
            className={cn(box, post.cfLinkError ? "border-warning-line bg-warning-soft text-warning-ink" : "border-line bg-subtle text-ink-secondary")}
          >
            <p>
              {post.cfLinkError
                ? t("posts.banner.cfLinkError", { code: post.cfLinkError })
                : t("posts.banner.cfStarted", { title: post.liveSession.title })}
            </p>
            <Link href={`/live/${post.liveSession.id}`} className={cn(buttonVariants({ variant: "outline" }), "h-8 rounded-lg bg-surface")}>
              {t("posts.action.openSession")}
            </Link>
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}
