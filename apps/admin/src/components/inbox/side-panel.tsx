"use client";

import type { UpdateConversationInput } from "@oca/shared";
import { Button, Card, Select, toast } from "@oca/ui";
import { Lock, LockOpen, Unlink, UserPlus } from "lucide-react";
import { useId, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { CustomerPicker } from "@/components/orders/customer-picker";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useAssignees, useUpdateConversation } from "@/lib/queries";
import type { ConversationDto } from "@/lib/types";
import { CreateCustomerDialog } from "./create-customer-dialog";

export interface SidePanelProps {
  conversation: ConversationDto;
  canWrite: boolean;
  /** false = ເຊື່ອງຫົວຂໍ້ h2 ຂອງຕົວເອງ (ເມື່ອຢູ່ໃນ dialog ທີ່ມີຫົວຂໍ້ຢູ່ແລ້ວ) */
  showTitle?: boolean;
}

/** key ຕາມ conversation.id: ປ່ຽນເຄສ = remount ທັງໝົດ (dialog, mutation pending ບໍ່ຮົ່ວຂ້າມເຄສ) */
export function SidePanel(props: SidePanelProps) {
  return <SidePanelInner key={props.conversation.id} {...props} />;
}

function SidePanelInner({ conversation, canWrite, showTitle = true }: SidePanelProps) {
  const { t } = useT();
  const uid = useId();
  const channelId = `${uid}-channel`;
  const customerId = `${uid}-customer`;
  const assigneeId = `${uid}-assignee`;
  const statusId = `${uid}-status`;
  // CustomerPicker ຄົ້ນລູກຄ້າຜ່ານ GET /customers ທີ່ຕ້ອງ orders:read
  const canLinkExisting = useCan("orders:read");
  const update = useUpdateConversation();
  const assignees = useAssignees();
  const [createOpen, setCreateOpen] = useState(false);
  const busy = update.isPending;
  const current = conversation.assignee;
  const options = assignees.data ?? [];

  async function apply(input: UpdateConversationInput) {
    try {
      await update.mutateAsync({ id: conversation.id, input });
      toast.success(t("inbox.toast.updated"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  return (
    <Card className="h-full space-y-5 overflow-y-auto rounded-[20px] p-4">
      {showTitle ? <h2 className="text-sm font-bold text-ink">{t("inbox.panel.title")}</h2> : null}

      <section aria-labelledby={channelId}>
        <h3 id={channelId} className="text-xs font-semibold text-ink-secondary">{t("inbox.panel.channel")}</h3>
        <p className="mt-1 text-sm text-ink">{t(`orders.channel.${conversation.channel}`)}</p>
      </section>

      <section aria-labelledby={customerId} className="space-y-2">
        <h3 id={customerId} className="text-xs font-semibold text-ink-secondary">{t("inbox.panel.customer")}</h3>
        {conversation.customer ? (
          <div className="flex items-start justify-between gap-2 rounded-xl border border-line bg-subtle px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{conversation.customer.name}</p>
              {conversation.customer.phone ? <p className="text-xs text-ink-secondary">{conversation.customer.phone}</p> : null}
            </div>
            {canWrite ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void apply({ customerId: null })}>
                <Unlink aria-hidden="true" />
                {t("inbox.panel.unlink")}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-muted">{t("inbox.panel.noCustomer")}</p>
            {canWrite && canLinkExisting ? (
              <CustomerPicker
                value={null}
                disabled={busy}
                onSelect={(customer) => {
                  if (customer) void apply({ customerId: customer.id });
                }}
              />
            ) : null}
            {canWrite ? (
              <Button variant="outlinePrimary" className="w-full rounded-lg" disabled={busy} onClick={() => setCreateOpen(true)}>
                <UserPlus aria-hidden="true" />
                {t("inbox.panel.createCustomer")}
              </Button>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby={`${assigneeId}-label`} className="space-y-2">
        <label id={`${assigneeId}-label`} htmlFor={assigneeId} className="text-xs font-semibold text-ink-secondary">
          {t("inbox.panel.assignee")}
        </label>
        <Select
          id={assigneeId}
          value={current?.id ?? ""}
          disabled={!canWrite || busy || assignees.isPending}
          onChange={(event) => void apply({ assigneeId: event.target.value || null })}
        >
          <option value="">{t("inbox.assignee.unassigned")}</option>
          {/* ຜູ້ຮັບປັດຈຸບັນທີ່ບໍ່ຢູ່ໃນລາຍຊື່ (ເຊັ່ນ ຖືກປິດໃຊ້ງານ) ຍັງຕ້ອງສະແດງ ບໍ່ຢ່າງນັ້ນ select ຈະເບິ່ງຄືບໍ່ມີຄົນຮັບ */}
          {current && !options.some((option) => option.id === current.id) ? <option value={current.id}>{current.name}</option> : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
        {assignees.isError ? (
          <p className="flex items-center gap-2 text-xs text-danger">
            {t("common.error.load")}
            <Button variant="ghost" size="sm" onClick={() => void assignees.refetch()}>
              {t("common.retry")}
            </Button>
          </p>
        ) : null}
      </section>

      <section aria-labelledby={statusId} className="space-y-2">
        <h3 id={statusId} className="text-xs font-semibold text-ink-secondary">{t("inbox.panel.status")}</h3>
        <p className="text-sm text-ink">{t(`inbox.status.${conversation.status}`)}</p>
        {canWrite ? (
          conversation.status === "OPEN" ? (
            <Button variant="outline" className="w-full rounded-lg" disabled={busy} onClick={() => void apply({ status: "CLOSED" })}>
              <Lock aria-hidden="true" />
              {t("inbox.panel.close")}
            </Button>
          ) : (
            <Button variant="outline" className="w-full rounded-lg" disabled={busy} onClick={() => void apply({ status: "OPEN" })}>
              <LockOpen aria-hidden="true" />
              {t("inbox.panel.reopen")}
            </Button>
          )
        ) : null}
      </section>

      <CreateCustomerDialog open={createOpen} onOpenChange={setCreateOpen} conversation={conversation} />
    </Card>
  );
}
