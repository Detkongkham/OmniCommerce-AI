"use client";

import { Dialog, DialogBody, DialogContent, DialogHeader, EmptyState, PageHeader, StatusPill, cn } from "@oca/ui";
import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";
import type { StreamStatus } from "@/lib/inbox-stream";
import { useConversation } from "@/lib/queries";
import { useInboxRealtime } from "@/lib/use-inbox-realtime";
import { useMediaQuery } from "@/lib/use-media-query";
import { ConversationList } from "./conversation-list";
import { SidePanel } from "./side-panel";
import { ThreadPane } from "./thread-pane";

const STATUS_TONE: Record<StreamStatus, "success" | "neutral" | "warning" | "danger"> = {
  connected: "success",
  connecting: "neutral",
  reconnecting: "warning",
  disconnected: "danger",
};

/**
 * 3 ຖັນ (ລາຍການ | ຂໍ້ຄວາມ | ລາຍລະອຽດ). ຈໍ ≥ xl ເຫັນຄົບ; lg = ລາຍການ + ຂໍ້ຄວາມ (ລາຍລະອຽດເປີດດ້ວຍ dialog);
 * ຕ່ຳກວ່າ lg = ສະແດງທີລະຖັນ (ມີເຄສຖືກເລືອກ = ຂໍ້ຄວາມ, ບໍ່ມີ = ລາຍການ). ການເລືອກເກັບໃນ state (ຄ່າເລີ່ມຕົ້ນຈາກ ?c=).
 */
export function InboxPage({ initialConversationId }: { initialConversationId: string | null }) {
  const { t } = useT();
  const canWrite = useCan("inbox:write");
  const connection = useInboxRealtime(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  // ຜູກ dialog ກັບ id ຂອງເຄສ: ປ່ຽນ/ກັບລາຍການ ແລ້ວ dialog ເກົ່າບໍ່ເດັ້ງກັບມາ
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const isXl = useMediaQuery("(min-width: 1280px)");
  const selected = useConversation(selectedId);

  useEffect(() => {
    if (isXl) setDetailsFor(null);
  }, [isXl]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    // ຮັກສາ ?c= ໃຫ້ກົງກັບການເລືອກ (refresh/ແຊຣ໌ລິ້ງ); replaceState ບໍ່ trigger server render ຈຶ່ງບໍ່ remount
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("inbox.title")]}
        title={t("inbox.title")}
        description={t("inbox.description")}
        actions={
          <span role="status" data-testid="connection-status">
            <StatusPill tone={STATUS_TONE[connection]}>{t(`inbox.realtime.${connection}`)}</StatusPill>
          </span>
        }
      />
      <div className="px-3 pb-6 sm:px-6">
        {connection === "disconnected" ? (
          <p role="alert" className="mb-3 text-sm text-danger-ink" data-testid="reload-hint">
            {t("inbox.realtime.disconnected")}
          </p>
        ) : null}
        <div className="grid h-[calc(100vh-17rem)] min-h-[480px] grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <section aria-label={t("inbox.list.label")} className={cn("min-h-0", selectedId ? "hidden lg:block" : "block")}>
            <ConversationList selectedId={selectedId} onSelect={select} />
          </section>

          <section className={cn("min-h-0", selectedId ? "block" : "hidden lg:block")}>
            {selectedId ? (
              <ThreadPane
                key={selectedId}
                conversationId={selectedId}
                canWrite={canWrite}
                onBack={() => select(null)}
                onShowDetails={() => setDetailsFor(selectedId)}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[20px] border border-line bg-surface">
                <EmptyState icon={MessageSquare} title={t("inbox.thread.select")} />
              </div>
            )}
          </section>

          {isXl ? (
            <aside aria-label={t("inbox.panel.title")} className="min-h-0">
              {selected.data ? <SidePanel conversation={selected.data} canWrite={canWrite} /> : null}
            </aside>
          ) : null}
        </div>
      </div>

      <Dialog open={!isXl && detailsFor === selectedId && !!selected.data} onOpenChange={(open) => !open && setDetailsFor(null)}>
        <DialogContent className="max-w-md" closeLabel={t("common.close")}>
          <DialogHeader title={t("inbox.panel.title")} description={selected.data?.displayName ?? ""} />
          <DialogBody>
            {selected.data ? <SidePanel conversation={selected.data} canWrite={canWrite} showTitle={false} /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}