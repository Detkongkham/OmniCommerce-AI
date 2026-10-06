"use client";

import { Avatar, Button, Card, EmptyState, Skeleton, StatusPill } from "@oca/ui";
import { AlertCircle, ArrowLeft, MessageSquare, PanelRight } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useConversation, useMarkConversationRead, useMessages } from "@/lib/queries";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";

export interface ThreadPaneProps {
  conversationId: string;
  canWrite: boolean;
  /** ມີເມື່ອຈໍແຄບ (ກັບໄປລາຍການ) */
  onBack?: () => void;
  /** ມີເມື່ອບໍ່ມີຖັນລາຍລະອຽດ (ຈໍແຄບ) */
  onShowDetails?: () => void;
}

/** ໃກ້ທ້າຍພຽງໃດຖືວ່າ "ຢູ່ລຸ່ມສຸດ" (px) ເພື່ອເລື່ອນຕາມຂໍ້ຄວາມໃໝ່ */
const STICK_THRESHOLD = 80;

export function ThreadPane({ conversationId, canWrite, onBack, onShowDetails }: ThreadPaneProps) {
  const { t } = useT();
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const { mutate: markRead } = useMarkConversationRead();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // API ສົ່ງໃໝ່ສຸດກ່ອນ (ໜ້າທຳອິດ = ໃໝ່ສຸດ, ໜ້າຕໍ່ໄປ = ເກົ່າກວ່າ) → ກັບດ້ານເພື່ອສະແດງເກົ່າ→ໃໝ່
  const items = useMemo(() => [...(messages.data?.pages.flatMap((page) => page.items) ?? [])].reverse(), [messages.data]);

  // ເປີດເຄສທີ່ມີ unread (ແລະ ມີຂໍ້ຄວາມໃໝ່ເຂົ້າຕອນເປີດຢູ່) → ໝາຍອ່ານ. deps ມີ unread ເພື່ອບໍ່ວົນເມື່ອ request ລົ້ມ
  const unread = conversation.data?.unreadCount ?? 0;
  useEffect(() => {
    if (canWrite && unread > 0 && document.visibilityState === "visible") markRead(conversationId);
  }, [canWrite, unread, conversationId, markRead]);

  // ເລື່ອນລົງລຸ່ມສຸດເມື່ອມີຂໍ້ຄວາມເພີ່ມ ຖ້າຜູ້ໃຊ້ຢູ່ໃກ້ລຸ່ມສຸດ (ຫຼື ເປີດໃໝ່)
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [items.length]);

  function onScroll() {
    const element = scrollRef.current;
    if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD;
  }

  if (conversation.isError && !conversation.data) {
    return (
      <Card className="flex h-full items-center justify-center rounded-[20px]">
        <EmptyState
          icon={AlertCircle}
          title={errorMessage(conversation.error, t)}
          action={
            <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void conversation.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </Card>
    );
  }

  const data = conversation.data;
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px]">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
        {onBack ? (
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("inbox.thread.back")} onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
          </Button>
        ) : null}
        {data ? (
          <>
            <Avatar name={data.displayName} className="size-9" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold text-ink">{data.displayName}</h2>
              <p className="text-xs text-ink-secondary">{t(`orders.channel.${data.channel}`)}</p>
            </div>
            {data.status === "CLOSED" ? <StatusPill tone="neutral">{t("inbox.status.CLOSED")}</StatusPill> : null}
          </>
        ) : (
          <div role="status" aria-label={t("common.loading")}>
            <Skeleton className="h-9 w-48" />
          </div>
        )}
        {onShowDetails ? (
          <Button variant="outline" size="sm" className="ml-auto xl:hidden" onClick={onShowDetails}>
            <PanelRight aria-hidden="true" />
            {t("inbox.thread.details")}
          </Button>
        ) : null}
      </header>

      {conversation.isError || (messages.isError && messages.data) ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-b border-danger-line bg-danger-soft px-4 py-2 text-xs text-danger-ink"
        >
          <span>{t("common.error.load")}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (conversation.isError) void conversation.refetch();
              if (messages.isError) void messages.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="region"
        aria-label={t("inbox.thread.label")}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto bg-app px-3 py-4 sm:px-4"
      >
        {messages.isError && !messages.data ? (
          <EmptyState
            icon={AlertCircle}
            title={t("common.error.load")}
            action={
              <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void messages.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : messages.isPending ? (
          <div className="space-y-3" role="status" aria-busy="true" aria-label={t("common.loading")}>
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={MessageSquare} title={t("inbox.thread.empty")} />
        ) : (
          <>
            {messages.hasNextPage ? (
              <div className="mb-3 flex justify-center">
                <Button variant="outline" size="sm" loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
                  {messages.isFetchingNextPage ? t("inbox.thread.loadingOlder") : t("inbox.thread.loadOlder")}
                </Button>
              </div>
            ) : null}
            <ul className="space-y-2">
              {items.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ul>
          </>
        )}
      </div>

      <Composer conversationId={conversationId} canWrite={canWrite} />
    </Card>
  );
}
