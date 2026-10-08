"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LIVE_SESSION_KINDS, createLiveSessionSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Select, toast } from "@oca/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import type { Translate } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { useCreateLiveSession, useUpdateLiveSession } from "@/lib/queries";
import type { LiveSessionDetailDto, LiveSessionDto } from "@/lib/types";

/** id ໂພສເປັນສະຕຣິງລ້ວນໃນຟອມ (ວ່າງ = ຍັງບໍ່ໃສ່); ກວດຮູບແບບດ້ວຍ schema ຂອງ API */
const formSchema = z.object({
  title: createLiveSessionSchema.shape.title,
  kind: z.enum(LIVE_SESSION_KINDS),
  externalPostId: z.union([z.literal(""), createLiveSessionSchema.shape.externalPostId.unwrap().unwrap()]),
  publicReplyEnabled: z.boolean(),
});
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

function titleError(error: { type?: string | undefined } | undefined, t: Translate): string | undefined {
  if (!error) return undefined;
  return error.type === "too_big" ? t("validation.tooLong", { max: 100 }) : t("validation.required");
}

export interface SessionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ສ້າງໃໝ່ */
  session: LiveSessionDto | null;
  onSaved?: (session: LiveSessionDetailDto) => void;
}

export function SessionFormDialog({ open, onOpenChange, session, onSaved }: SessionFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <SessionForm
          key={session?.id ?? "new"}
          session={session}
          onDone={(saved) => {
            onSaved?.(saved);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SessionForm({
  session,
  onDone,
  onCancel,
}: {
  session: LiveSessionDto | null;
  onDone: (session: LiveSessionDetailDto) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const create = useCreateLiveSession();
  const update = useUpdateLiveSession();
  const [formError, setFormError] = useState<string | null>(null);
  // ຕອນ LIVE API ບໍ່ໃຫ້ປ່ຽນ id ໂພສ: ອ່ານຢ່າງດຽວ ແລະ ບໍ່ສົ່ງ
  const postLocked = session?.status === "LIVE";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: session?.title ?? "",
      kind: session?.kind ?? "LIVE",
      externalPostId: session?.externalPostId ?? "",
      publicReplyEnabled: session?.publicReplyEnabled ?? true,
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const externalPostId = values.externalPostId === "" ? null : values.externalPostId;
    try {
      if (session) {
        const saved = await update.mutateAsync({
          id: session.id,
          input: {
            title: values.title,
            ...(postLocked ? {} : { externalPostId }),
            publicReplyEnabled: values.publicReplyEnabled,
          },
        });
        toast.success(t("live.toast.updated"));
        onDone(saved);
      } else {
        const saved = await create.mutateAsync({
          title: values.title,
          kind: values.kind,
          externalPostId,
          publicReplyEnabled: values.publicReplyEnabled,
        });
        toast.success(t("live.toast.created"));
        onDone(saved);
      }
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={session ? t("live.form.editTitle") : t("live.form.createTitle")}
        description={session ? t("live.form.editDescription") : t("live.form.createDescription")}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("live.form.title")} htmlFor="live-title" required className="sm:col-span-2" error={titleError(errors.title, t)}>
            <Input id="live-title" invalid={!!errors.title} {...register("title")} />
          </Field>
          <Field label={t("live.form.kind")} htmlFor="live-kind" required>
            <Select id="live-kind" disabled={!!session} {...register("kind")}>
              {LIVE_SESSION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`live.kind.${kind}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("live.form.postId")}
            htmlFor="live-post-id"
            className="sm:col-span-3"
            error={errors.externalPostId ? t("live.form.postIdInvalid") : undefined}
          >
            <Input
              id="live-post-id"
              className="font-mono"
              autoComplete="off"
              disabled={postLocked}
              invalid={!!errors.externalPostId}
              aria-describedby="live-post-id-hint"
              {...register("externalPostId")}
            />
            <p id="live-post-id-hint" className="mt-1 text-xs text-ink-muted">
              {postLocked ? t("live.form.postIdLocked") : t("live.form.postIdHint")}
            </p>
          </Field>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 rounded border-line accent-[var(--color-brand)]"
              aria-describedby="live-public-reply-hint"
              {...register("publicReplyEnabled")}
            />
            {t("live.form.publicReply")}
          </label>
          <p id="live-public-reply-hint" className="mt-1 pl-6 text-xs text-ink-muted">
            {t("live.form.publicReplyHint")}
          </p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
