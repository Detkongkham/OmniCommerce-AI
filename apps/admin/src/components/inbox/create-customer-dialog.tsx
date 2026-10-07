"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createCustomerFromChatSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCreateCustomerFromChat } from "@/lib/queries";
import type { ConversationDto } from "@/lib/types";

const PHONE_PATTERN = /^\+?[0-9]{6,15}$/;

/** ຟອມໃຊ້ສະຕຣິງລ້ວນ (phone ເປົ່າໄດ້); ແປງເປັນ payload ຂອງ API ຕອນ submit */
const formSchema = z.object({
  name: createCustomerFromChatSchema.shape.name,
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || PHONE_PATTERN.test(value)),
});
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: ConversationDto;
}

export function CreateCustomerDialog({ open, onOpenChange, conversation }: CreateCustomerDialogProps) {
  const { t } = useT();
  const [submitting, setSubmitting] = useState(false);
  // ຂະນະສົ່ງ ຫ້າມປິດ (Escape/overlay/Cancel) ເພື່ອບໍ່ໃຫ້ເສຍຜົນລັບ
  const guarded = (next: boolean) => {
    if (!next && submitting) return;
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={guarded}>
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        <CustomerForm
          key={conversation.id}
          conversation={conversation}
          onDone={() => onOpenChange(false)}
          onCancel={() => guarded(false)}
          onSubmittingChange={setSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({
  conversation,
  onDone,
  onCancel,
  onSubmittingChange,
}: {
  conversation: ConversationDto;
  onDone: () => void;
  onCancel: () => void;
  onSubmittingChange: (submitting: boolean) => void;
}) {
  const { t } = useT();
  const uid = useId();
  const nameId = `${uid}-name`;
  const phoneId = `${uid}-phone`;
  const phoneHintId = `${uid}-phone-hint`;
  const create = useCreateCustomerFromChat();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: conversation.displayName, phone: "" },
  });

  useEffect(() => {
    onSubmittingChange(isSubmitting);
    return () => onSubmittingChange(false);
  }, [isSubmitting, onSubmittingChange]);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync({
        id: conversation.id,
        input: { name: values.name, ...(values.phone ? { phone: values.phone } : {}) },
      });
      toast.success(t("inbox.customerDialog.created"));
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  const nameError = errors.name ? (errors.name.type === "too_big" ? t("validation.tooLong", { max: 100 }) : t("validation.required")) : undefined;
  const phoneError = errors.phone ? t("inbox.customerDialog.phoneInvalid") : undefined;

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("inbox.customerDialog.title")} description={t("inbox.customerDialog.description")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <Field label={t("orders.customer.name")} htmlFor={nameId} required error={nameError}>
          <Input id={nameId} invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field label={t("orders.customer.phone")} htmlFor={phoneId} error={phoneError}>
          <Input id={phoneId} inputMode="tel" invalid={!!errors.phone} aria-describedby={phoneHintId} {...register("phone")} />
          <p id={phoneHintId} className="mt-1 text-xs text-ink-muted">
            {t("inbox.customerDialog.phoneHint")}
          </p>
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" disabled={isSubmitting} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
