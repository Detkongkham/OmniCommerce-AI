"use client";

import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCrmCustomers, useMergeCrmCustomer } from "@/lib/queries";
import type { CrmCustomerDetailDto, CrmCustomerListItemDto } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

/** ລວມລູກຄ້າຊ້ຳ (source) ເຂົ້າລູກຄ້າທີ່ກຳລັງເປີດ (target): ຄົ້ນຫາ → ເລືອກ → ຢືນຢັນ */
export function MergeCustomerDialog({ target, open, onOpenChange }: { target: CrmCustomerDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        {open ? <MergeFlow target={target} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MergeFlow({ target, onDone }: { target: CrmCustomerDetailDto; onDone: () => void }) {
  const { t } = useT();
  const merge = useMergeCrmCustomer();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<CrmCustomerListItemDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const trimmed = search.trim();
  const q = useDebounced(trimmed, 300);
  const query = useCrmCustomers({ q, page: 1, pageSize: 8 }, { enabled: q !== "" && source === null });
  const candidates = (query.data?.items ?? []).filter((row) => row.id !== target.id);
  const phoneDropped = source?.phone && target.phone && source.phone !== target.phone ? source.phone : null;

  async function confirm() {
    if (!source || merge.isPending) return;
    setFormError(null);
    try {
      await merge.mutateAsync({ targetId: target.id, sourceId: source.id });
      toast.success(t("customers.merge.done"));
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  }

  return (
    <>
      <DialogHeader title={t("customers.merge.title", { name: target.name })} description={t("customers.merge.description")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        {source ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-ink">{t("customers.merge.summary", { orders: source.orderCount, name: source.name, target: target.name })}</p>
            {phoneDropped ? (
              <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-warning-ink">
                {t("customers.merge.phoneDropped", { phone: phoneDropped, name: source.name })}
              </p>
            ) : null}
            <p className="text-ink-secondary">{t("customers.merge.irreversible")}</p>
            <Button type="button" variant="ghost" className="rounded-lg px-0" onClick={() => setSource(null)}>
              {t("customers.merge.change")}
            </Button>
          </div>
        ) : (
          <>
            <Field label={t("customers.merge.search")} htmlFor="merge-search">
              <Input id="merge-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            </Field>
            {q !== "" && !query.isPending ? (
              candidates.length > 0 ? (
                <ul aria-label={t("customers.merge.results")} className="divide-y divide-line rounded-xl border border-line">
                  {candidates.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        aria-label={t("customers.merge.pick", { name: row.name })}
                        onClick={() => setSource(row)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-ink">{row.name}</span>
                          <span className="block text-xs text-ink-muted">{row.phone ?? t("customers.noPhone")}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-secondary">
                          {t("customers.col.orders")}: {row.orderCount}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p role="status" className="text-sm text-ink-secondary">
                  {t("customers.merge.noResults")}
                </p>
              )
            ) : null}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="button" variant="destructive" className="h-10 rounded-xl px-6 font-bold" disabled={!source} loading={merge.isPending} onClick={() => void confirm()}>
          {t("customers.merge.confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}
