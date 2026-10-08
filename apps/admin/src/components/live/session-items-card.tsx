"use client";

import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@oca/ui";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useDeleteLiveItem } from "@/lib/queries";
import type { LiveItemDto, LiveSessionDetailDto } from "@/lib/types";
import { ItemFormDialog } from "./item-form-dialog";

export function SessionItemsCard({ session }: { session: LiveSessionDetailDto }) {
  const { t } = useT();
  const canWrite = useCan("live-cf:write");
  // API ບໍ່ໃຫ້ແກ້ລະຫັດຂອງ session ທີ່ຈົບແລ້ວ
  const editable = canWrite && session.status !== "ENDED";
  const remove = useDeleteLiveItem();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LiveItemDto | null>(null);
  const [deleting, setDeleting] = useState<LiveItemDto | null>(null);

  function openForm(item: LiveItemDto | null) {
    setEditing(item);
    setFormOpen(true);
  }

  async function confirmDelete(item: LiveItemDto) {
    try {
      await remove.mutateAsync({ sessionId: session.id, itemId: item.id });
      toast.success(t("live.items.toast.deleted"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-bold text-ink">{t("live.items.title")}</h2>
          <p className="text-xs text-ink-muted">
            {session.status === "ENDED" ? t("live.items.readOnlyEnded") : t("live.items.description")}
          </p>
        </div>
        {editable ? (
          <Button variant="outlinePrimary" className="rounded-xl" onClick={() => openForm(null)}>
            <Plus aria-hidden="true" />
            {t("live.items.add")}
          </Button>
        ) : null}
      </div>
      {session.items.length === 0 ? (
        <div role="status">
          <EmptyState icon={Tags} title={t("live.items.empty")} />
        </div>
      ) : (
        <Table aria-label={t("live.items.table")}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">{t("live.items.col.code")}</TableHead>
              <TableHead scope="col">{t("live.items.col.product")}</TableHead>
              <TableHead scope="col" className="text-right">
                {t("live.items.col.claimed")}
              </TableHead>
              {editable ? (
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {session.items.map((item) => {
              const inUseId = `live-item-in-use-${item.id}`;
              return (
                <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                  <th scope="row" className="px-4 py-3 text-left font-mono font-semibold text-ink">
                    {item.code}
                  </th>
                  <TableCell>
                    <p className="text-ink">
                      {item.productName}
                      {item.variantName ? ` — ${item.variantName}` : ""}
                    </p>
                    <p className="font-mono text-xs text-ink-muted">{item.sku}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {item.claimed} / {item.limit ?? t("live.items.unlimited")}
                  </TableCell>
                  {editable ? (
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("live.items.edit", { code: item.code })}
                          onClick={() => openForm(item)}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("live.items.delete", { code: item.code })}
                          disabled={item.claimed > 0}
                          aria-describedby={item.claimed > 0 ? inUseId : undefined}
                          onClick={() => setDeleting(item)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                        {item.claimed > 0 ? (
                          <span id={inUseId} className="sr-only">
                            {t("live.items.inUse")}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {editable ? (
        <>
          <ItemFormDialog open={formOpen} onOpenChange={setFormOpen} sessionId={session.id} item={editing} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
              if (!open) setDeleting(null);
            }}
            title={deleting ? t("live.items.deleteTitle", { code: deleting.code }) : ""}
            description={t("live.items.deleteDescription")}
            confirmLabel={t("common.delete")}
            cancelLabel={t("common.cancel")}
            closeLabel={t("common.close")}
            busy={remove.isPending}
            onConfirm={() => (deleting ? confirmDelete(deleting) : undefined)}
          />
        </>
      ) : null}
    </Card>
  );
}
