"use client";

import { Dialog, DialogBody, DialogContent, DialogHeader, EmptyState, PageHeader, StatusPill, cn } from "@oca/ui";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";
import type { StreamStatus } from "@/lib/inbox-stream";
import { useConversation } from "@/lib/queries";
import { useInboxRealtime } from "@/lib/use-inbox-realtime";
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selected = useConversation(selectedId);

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
          <p className="mb-3 text-sm text-danger-ink" data-testid="reload-hint">
            {t("inbox.realtime.disconnected")}
          </p>
        ) : null}
        <div className="grid h-[calc(100vh-17rem)] min-h-[480px] grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <section aria-label={t("inbox.list.label")} className={cn("min-h-0", selectedId ? "hidden lg:block" : "block")}>
            <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
          </section>

          <section className={cn("min-h-0", selectedId ? "block" : "hidden lg:block")}>
            {selectedId ? (
              <ThreadPane
                key={selectedId}
                conversationId={selectedId}
                canWrite={canWrite}
                onBack={() => setSelectedId(null)}
                onShowDetails={() => setDetailsOpen(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[20px] border border-line bg-surface">
                <EmptyState icon={MessageSquare} title={t("inbox.thread.select")} />
              </div>
            )}
          </section>

          <aside className="hidden min-h-0 xl:block">
            {selected.data ? <SidePanel key={selected.data.id} conversation={selected.data} canWrite={canWrite} /> : null}
          </aside>
        </div>
      </div>

      <Dialog open={detailsOpen && !!selected.data} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md" closeLabel={t("common.close")}>
          <DialogHeader title={t("inbox.panel.title")} description={selected.data?.displayName ?? ""} />
          <DialogBody>
            {selected.data ? <SidePanel conversation={selected.data} canWrite={canWrite} /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}