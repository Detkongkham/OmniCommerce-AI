"use client";

import { CONVERSATION_STATUSES, type ConversationStatus } from "@oca/shared";
import { Avatar, Button, Card, EmptyState, Select, Skeleton, StatusPill, cn } from "@oca/ui";
import { AlertCircle, MessageSquare, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useConversations } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";

const PAGE_SIZE = 30;

export interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const { t } = useT();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ConversationStatus | "">("OPEN");
  const [assignee, setAssignee] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const trimmed = search.trim();
  const debounced = useDebounced(trimmed, 300);
  // ລ້າງຊ່ອງຄົ້ນຫາມີຜົນທັນທີ (ບໍ່ລໍ debounce)
  const q = trimmed === "" ? "" : debounced;

  // ປ່ຽນຄຳຄົ້ນຫາ (ຄ່າທີ່ debounce ແລ້ວ) ກັບໄປໜ້າ 1 ໃນ render ດຽວກັນ ຈຶ່ງບໍ່ມີ request (q ເກົ່າ, page ເກົ່າ)
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setPage(1);
  }

  const query = useConversations({
    status: status || undefined,
    assignee: assignee || undefined,
    unread: unreadOnly,
    q,
    page,
    pageSize: PAGE_SIZE,
  });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const busy = query.isPending || query.isPlaceholderData;
  // ຄ່າເລີ່ມຕົ້ນ status=OPEN ບໍ່ນັບເປັນ "ກອງ" ຈົນກວ່າຜູ້ໃຊ້ປ່ຽນ/ຄົ້ນຫາ ຈຶ່ງບໍ່ບອກວ່າ "ບໍ່ພົບ" ຕອນຍັງບໍ່ມີເຄສເລີຍ
  const filtered = q !== "" || assignee !== "" || unreadOnly || status !== "OPEN";
  const isEmpty = !busy && rows.length === 0;

  // ຂໍ້ມູນຫຼຸດລົງຈົນໜ້າປັດຈຸບັນເກີນໜ້າສຸດທ້າຍ: ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / PAGE_SIZE)));
    }
  }, [query.data, query.isPlaceholderData, page, rows.length, total]);

  const reset = () => setPage(1);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px]">
      <div className="space-y-2 border-b border-line p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("inbox.list.search")}
            aria-label={t("inbox.list.search")}
            className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label={t("inbox.filter.status")}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ConversationStatus | "");
              reset();
            }}
          >
            <option value="">{t("inbox.filter.allStatuses")}</option>
            {CONVERSATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`inbox.status.${value}`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("inbox.filter.assignee")}
            value={assignee}
            onChange={(event) => {
              setAssignee(event.target.value);
              reset();
            }}
          >
            <option value="">{t("inbox.assignee.all")}</option>
            <option value="me">{t("inbox.assignee.me")}</option>
            <option value="unassigned">{t("inbox.assignee.unassigned")}</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
              reset();
            }}
          />
          {t("inbox.filter.unread")}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
        ) : query.isPending ? (
          <div className="space-y-2 p-3" aria-busy="true" aria-label={t("common.loading")}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={MessageSquare}
            title={filtered ? t("inbox.list.noResults") : t("inbox.list.empty")}
          />
        ) : (
          <ul aria-label={t("inbox.list.label")} aria-busy={busy}>
            {rows.map((conversation) => {
              const selected = conversation.id === selectedId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    data-testid={`conversation-${conversation.id}`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-line px-3 py-3 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "bg-brand-soft",
                    )}
                  >
                    <Avatar name={conversation.displayName} className="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm text-ink", conversation.unreadCount > 0 ? "font-bold" : "font-medium")}>
                          {conversation.displayName}
                        </span>
                        <time dateTime={conversation.lastMessageAt} className="shrink-0 text-[11px] text-ink-muted">
                          {formatDateTime(conversation.lastMessageAt)}
                        </time>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-ink-secondary">
                          {conversation.lastMessagePreview ?? t("inbox.item.attachmentOnly")}
                        </span>
                        {conversation.unreadCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                            <span aria-hidden="true">{conversation.unreadCount}</span>
                            <span className="sr-only">{t("inbox.item.unread", { count: conversation.unreadCount })}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
                        <span>{conversation.assignee ? conversation.assignee.name : t("inbox.assignee.unassigned")}</span>
                        {conversation.status === "CLOSED" ? <StatusPill tone="neutral">{t("inbox.status.CLOSED")}</StatusPill> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!query.isError && total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-ink-secondary">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            {t("page.previous")}
          </Button>
          <span>{t("inbox.list.pageInfo", { page, pages })}</span>
          <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>
            {t("page.next")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
