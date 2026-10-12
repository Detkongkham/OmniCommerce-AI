"use client";

import { updateCustomerSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useUpdateCrmCustomer } from "@/lib/queries";
import type { CrmCustomerDetailDto } from "@/lib/types";

type FieldName = "name" | "phone" | "email";

export function CustomerEditDialog({ customer, open, onOpenChange }: { customer: CrmCustomerDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        {/* key: ເປີດໃໝ່ທຸກຄັ້ງເລີ່ມຈາກຄ່າຫຼ້າສຸດຂອງລູກຄ້າ */}
        {open ? <EditForm key={customer.id} customer={customer} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ customer, onDone }: { customer: CrmCustomerDetailDto; onDone: () => void }) {
  const { t } = useT();
  const save = useUpdateCrmCustomer();
  const [state, setState] = useState({ name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", note: customer.note ?? "" });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneOwnerId, setPhoneOwnerId] = useState<string | null>(null);

  const set = (name: keyof typeof state, value: string) => {
    setState((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setFormError(null);
    setPhoneOwnerId(null);
    const parsed = updateCustomerSchema.safeParse(state);
    if (!parsed.success) {
      const found: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "name") found.name = t("customers.edit.nameRequired");
        else if (field === "phone") found.phone = t("customers.edit.phoneInvalid");
        else if (field === "email") found.email = t("customers.edit.emailInvalid");
      }
      setErrors(found);
      return;
    }
    try {
      // ສົ່ງຄ່າດິບ (trim ແລ້ວ): API ແປງຄ່າເປົ່າເປັນ null ເອງ
      await save.mutateAsync({
        id: customer.id,
        input: { name: state.name.trim(), phone: state.phone.trim(), email: state.email.trim(), note: state.note.trim() },
      });
      toast.success(t("customers.edit.saved"));
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.code === "CUSTOMER_PHONE_TAKEN") {
        setErrors({ phone: t("customers.edit.phoneTaken") });
        const ownerId = error.body?.customerId;
        setPhoneOwnerId(typeof ownerId === "string" ? ownerId : null);
      } else {
        setFormError(errorMessage(error, t));
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("customers.edit.title")} description={t("customers.edit.description")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4">
          <Field label={t("customers.edit.name")} htmlFor="customer-name" required error={errors.name}>
            <Input id="customer-name" maxLength={120} value={state.name} invalid={!!errors.name} onChange={(event) => set("name", event.target.value)} />
          </Field>
          <Field label={t("customers.detail.phone")} htmlFor="customer-phone" error={errors.phone}>
            <Input id="customer-phone" inputMode="tel" maxLength={16} value={state.phone} invalid={!!errors.phone} onChange={(event) => set("phone", event.target.value)} />
          </Field>
          {phoneOwnerId ? (
            <Link href={`/customers/${phoneOwnerId}`} className="-mt-2 text-sm font-medium text-brand-ink hover:underline">
              {t("customers.edit.openOwner")}
            </Link>
          ) : null}
          <Field label={t("customers.detail.email")} htmlFor="customer-email" error={errors.email}>
            <Input id="customer-email" type="email" maxLength={200} value={state.email} invalid={!!errors.email} onChange={(event) => set("email", event.target.value)} />
          </Field>
          <Field label={t("customers.detail.note")} htmlFor="customer-note">
            <textarea
              id="customer-note"
              rows={3}
              maxLength={500}
              value={state.note}
              onChange={(event) => set("note", event.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={save.isPending}>
          {save.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
