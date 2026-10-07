"use client";

import { Button, Card, PageHeader, buttonVariants, cn, toast } from "@oca/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { sendErrorKey } from "@/lib/inbox";
import { buildOrderSummary } from "@/lib/order-summary";
import { useConversation, useSendMessage } from "@/lib/queries";
import type { OrderDetailDto } from "@/lib/types";
import { OrderForm } from "./order-form";

type SummaryState = { kind: "idle" } | { kind: "sending" } | { kind: "failed"; reason: string; thrown: boolean };

/**
 * ເປີດບິນຈາກແຊັດ (`/orders/new?conversationId=`): ໂຫຼດເຄສ → OrderForm (ໂໝດແຊັດ) → ສົ່ງສະຫຼຸບເຂົ້າແຊັດ.
 * ການສົ່ງສະຫຼຸບຢູ່ຫຼັງບິນຖືກສ້າງແລ້ວ ແລະ ແຍກຈາກການສ້າງບິນຢ່າງສົມບູນ: ລົ້ມ (FAILED ຫຼື throw) = ບິນຍັງຢູ່, ໜ້ານີ້ສະແດງຜົນ
 * ພ້ອມ "ສົ່ງສະຫຼຸບອີກຄັ້ງ" ທີ່ສົ່ງສະເພາະຂໍ້ຄວາມ (ຟອມຖືກຖອດອອກແລ້ວ ຈຶ່ງບໍ່ມີທາງ POST /orders ຊ້ຳ).
 */
export function ChatOrderPage({ conversationId }: { conversationId: string }) {
  const { t } = useT();
  const router = useRouter();
  const conversation = useConversation(conversationId);
  const send = useSendMessage();
  const sending = useRef(false);
  // ຜູ້ໃຊ້ອອກຈາກໜ້າຂະນະສົ່ງສະຫຼຸບ: ບໍ່ຕັ້ງ state / ບໍ່ push ຫຼັງ unmount (toast ຍັງສະແດງ ເພາະບິນ/ຂໍ້ຄວາມຖືກສົ່ງແລ້ວ)
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [created, setCreated] = useState<OrderDetailDto | null>(null);
  const [summary, setSummary] = useState<SummaryState>({ kind: "idle" });
  const chatUrl = `/inbox?c=${encodeURIComponent(conversationId)}`;

  async function sendSummary(order: OrderDetailDto) {
    if (sending.current) return;
    sending.current = true;
    if (mounted.current) setSummary({ kind: "sending" });
    try {
      const message = await send.mutateAsync({ id: conversationId, input: { text: buildOrderSummary(order) } });
      // API ຕອບ 201 ແຕ່ status=FAILED (ເຊັ່ນ OUTSIDE_WINDOW) ກໍ່ຖືວ່າສົ່ງບໍ່ສຳເລັດ
      if (message.status === "FAILED") {
        if (mounted.current) setSummary({ kind: "failed", reason: t(sendErrorKey(message.errorCode)), thrown: false });
        return;
      }
      toast.success(t("orders.chat.sent"));
      if (mounted.current) router.push(chatUrl);
    } catch (error) {
      if (mounted.current) setSummary({ kind: "failed", reason: errorMessage(error, t), thrown: true });
    } finally {
      sending.current = false;
    }
  }

  // ເອີ້ນໄດ້ແມ່ນແຕ່ຫຼັງໜ້າ unmount (ບິນຖືກສ້າງແລ້ວ): ສົ່ງສະຫຼຸບຕໍ່ (sendSummary ປ້ອງກັນຕົນເອງ) ແຕ່ບໍ່ຕັ້ງ state / ບໍ່ push
  function onCreated(order: OrderDetailDto, options: { sendSummary: boolean }) {
    if (mounted.current) setCreated(order);
    if (options.sendSummary) void sendSummary(order);
    else if (mounted.current) router.push(chatUrl);
  }

  // a11y: ບິນຖືກສ້າງ → focus ຫົວຂໍ້; ສົ່ງສະຫຼຸບລົ້ມ → focus alert (ອ່ານອອກສຽງ + ຢູ່ໃກ້ປຸ່ມ Retry)
  const pageRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!created) return;
    const heading = pageRef.current?.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [created]);
  useEffect(() => {
    if (summary.kind === "failed") alertRef.current?.focus();
  }, [summary]);

  const backLink = (
    <Link href={chatUrl} className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}>
      {t("orders.chat.back")}
    </Link>
  );

  if (created) {
    return (
      <div ref={pageRef}>
        <PageHeader
          breadcrumbs={[t("nav.home"), t("inbox.title"), t("orders.chat.title")]}
          title={t("orders.chat.createdTitle", { number: created.orderNumber })}
        />
        <div className="px-3 pb-10 sm:px-6">
          <Card className="max-w-xl space-y-4 rounded-[20px] p-6">
            {summary.kind === "sending" ? (
              <p role="status" className="text-sm text-ink-secondary">
                {t("orders.chat.sending")}
              </p>
            ) : null}
            {summary.kind === "failed" ? (
              <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-ink">
                {t("orders.chat.sendFailed", { number: created.orderNumber, reason: summary.reason })}
                {summary.thrown ? ` ${t("orders.chat.checkChatBeforeResend")}` : ""}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {summary.kind === "failed" ? (
                <Button className="rounded-xl" onClick={() => void sendSummary(created)}>
                  {t("orders.chat.retrySend")}
                </Button>
              ) : null}
              {backLink}
              <Link href={`/orders/${created.id}`} className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}>
                {t("orders.chat.viewOrder")}
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ເຄສຕ້ອງໂຫຼດສຳເລັດຄັ້ງທຳອິດກ່ອນ; refetch ພື້ນຫຼັງລົ້ມ (ມີ data ແລ້ວ) ຕ້ອງບໍ່ຖອດຟອມທີ່ຜູ້ໃຊ້ກຳລັງກອກ
  if (!conversation.data) {
    if (conversation.isPending) return <p role="status" className="p-6 text-sm text-ink-muted">{t("common.loading")}</p>;
    return (
      <div className="space-y-3 p-6">
        <p role="alert" className="text-sm text-danger-ink">
          {errorMessage(conversation.error, t)}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void conversation.refetch()}>
            {t("common.retry")}
          </Button>
          {backLink}
        </div>
      </div>
    );
  }

  return <OrderForm chat={{ conversation: conversation.data, onCreated }} />;
}
