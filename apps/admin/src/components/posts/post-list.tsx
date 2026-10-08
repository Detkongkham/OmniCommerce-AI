"use client";

import { SOCIAL_POST_STATUSES, type SocialPostStatus } from "@oca/shared";
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
  buttonVariants,
  cn,
} from "@oca/ui";
import { AlertCircle, ImageIcon, Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { formatDateTime } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { mediaSrc } from "@/lib/posts";
import { usePosts } from "@/lib/queries-posts";
import { PostCalendar } from "./post-calendar";
import { PostStatusPill } from "./post-status";

type View = "list" | "calendar";
const VIEWS: View[] = ["list", "calendar"];
const COLUMNS = 5;
const HEADERS: TranslationKey[] = ["posts.col.post", "posts.col.status", "posts.col.time", "posts.col.session", "posts.col.createdBy"];
const PREVIEW_LENGTH = 120;

export function PostList() {
  const { t } = useT();
  const canWrite = useCan("posting:write");
  const [view, setView] = useState<View>("list");
  const [status, setStatus] = useState<SocialPostStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = usePosts({ status, page, pageSize });
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
    <Link href="/posts/new" className={cn(buttonVariants(), "rounded-xl")}>
      <Plus aria-hidden="true" />
      {t("posts.add")}
    </Link>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("posts.title")]}
        title={t("posts.title")}
        badge={query.data && view === "list" ? t("posts.count", { count: query.data.total }) : undefined}
        description={t("posts.description")}
        actions={addButton}
      />
      <div className="space-y-4 px-3 pb-10 sm:px-6">
        <div role="tablist" aria-label={t("posts.tabs")} className="inline-flex rounded-xl border border-line bg-surface p-1">
          {VIEWS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === value ? "bg-brand text-white" : "text-ink-secondary hover:bg-hover",
              )}
              onClick={() => setView(value)}
            >
              {t(`posts.tab.${value}`)}
            </button>
          ))}
        </div>

        {view === "calendar" ? (
          <PostCalendar />
        ) : (
          <Card className="overflow-hidden rounded-[20px]">
            <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
              <Select
                aria-label={t("posts.filter.status")}
                className="w-48"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as SocialPostStatus | "");
                  setPage(1);
                }}
              >
                <option value="">{t("posts.filter.allStatuses")}</option>
                {SOCIAL_POST_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`posts.status.${value}`)}
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
                  {!busy && rows.length > 0 ? t("posts.found", { count: total }) : ""}
                </p>
                <Table aria-label={t("posts.table")} aria-busy={busy}>
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
                    {rows.map((post) => {
                      const cover = post.media[0];
                      const time = post.publishedAt ?? post.scheduledAt;
                      return (
                        <TableRow key={post.id} data-testid={`row-post-${post.id}`}>
                          <th scope="row" className="px-4 py-3 text-left font-normal">
                            <div className="flex items-start gap-3">
                              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
                                {cover ? (
                                  <img src={mediaSrc(cover.url)} alt="" className="size-full object-cover" />
                                ) : (
                                  <ImageIcon className="size-4 text-ink-muted" aria-hidden="true" />
                                )}
                              </div>
                              <div className="min-w-0 max-w-md">
                                <Link href={`/posts/${post.id}`} className="line-clamp-2 font-semibold text-brand-ink hover:underline">
                                  {post.message ? post.message.slice(0, PREVIEW_LENGTH) : t("posts.noText")}
                                </Link>
                                {post.media.length > 0 ? (
                                  <p className="text-xs text-ink-muted">{t("posts.imageCount", { count: post.media.length })}</p>
                                ) : null}
                              </div>
                            </div>
                          </th>
                          <TableCell>
                            <PostStatusPill status={post.status} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(time)}</TableCell>
                          <TableCell className="text-ink-secondary">
                            {post.liveSession ? (
                              <Link href={`/live/${post.liveSession.id}`} className="hover:underline">
                                {post.liveSession.title}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-ink-secondary">{post.createdBy?.name ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {isEmpty ? (
                  <div role="status">
                    <EmptyState
                      icon={Megaphone}
                      title={status !== "" ? t("posts.empty.noResults") : t("posts.empty.title")}
                      description={status !== "" ? undefined : t("posts.empty.hint")}
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
        )}
      </div>
    </div>
  );
}
