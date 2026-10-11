"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  toast,
} from "@oca/ui";
import { AlertCircle, Pencil, Plus, Truck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCouriers, useSaveCourier } from "@/lib/queries";
import type { CourierDto } from "@/lib/types";

const formSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,20}$/),
  name: z.string().trim().min(1).max(100),
  trackingUrlTemplate: z
    .string()
    .trim()
    .max(300)
    .refine((value) => value === "" || (/^https:\/\/\S+$/.test(value) && value.includes("{tracking}"))),
  isActive: z.boolean(),
});
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export function CourierList() {
  const { t } = useT();
  const canWrite = useCan("logistics:write");
  const query = useCouriers();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CourierDto | null>(null);
  const rows = query.data ?? [];

  function open(courier: CourierDto | null) {
    setEditing(courier);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("couriers.title")]}
        title={t("couriers.title")}
        description={t("couriers.description")}
        actions={
          canWrite ? (
            <Button className="rounded-xl" onClick={() => open(null)}>
              <Plus aria-hidden="true" />
              {t("couriers.add")}
            </Button>
          ) : null
        }
      />
      <div className="px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table aria-label={t("couriers.table")} aria-busy={query.isPending}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">{t("couriers.col.code")}</TableHead>
                    <TableHead scope="col">{t("couriers.col.name")}</TableHead>
                    <TableHead scope="col">{t("couriers.col.tracking")}</TableHead>
                    <TableHead scope="col">{t("couriers.col.status")}</TableHead>
                    {canWrite ? (
                      <TableHead scope="col" className="text-right">
                        <span className="sr-only">{t("common.actions")}</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={canWrite ? 5 : 4} /> : null}
                  {rows.map((courier) => (
                    <TableRow key={courier.id} data-testid={`row-courier-${courier.id}`}>
                      <th scope="row" className="px-4 py-3 text-left font-mono font-semibold text-ink">
                        {courier.code}
                      </th>
                      <TableCell className="text-ink">{courier.name}</TableCell>
                      <TableCell className="max-w-[320px] truncate font-mono text-xs text-ink-secondary">
                        {courier.trackingUrlTemplate ?? <span className="font-sans text-ink-muted">{t("couriers.noTracking")}</span>}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={courier.isActive ? "success" : "neutral"}>
                          {courier.isActive ? t("couriers.active") : t("couriers.inactive")}
                        </StatusPill>
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" aria-label={t("couriers.edit", { name: courier.name })} onClick={() => open(courier)}>
                            <Pencil aria-hidden="true" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? (
                <div role="status">
                  <EmptyState icon={Truck} title={t("couriers.empty")} />
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
      {canWrite ? (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
            <CourierForm key={editing?.id ?? "new"} courier={editing} onDone={() => setFormOpen(false)} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function CourierForm({ courier, onDone }: { courier: CourierDto | null; onDone: () => void }) {
  const { t } = useT();
  const save = useSaveCourier();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: courier?.code ?? "",
      name: courier?.name ?? "",
      trackingUrlTemplate: courier?.trackingUrlTemplate ?? "",
      isActive: courier?.isActive ?? true,
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const input = { ...values, trackingUrlTemplate: values.trackingUrlTemplate === "" ? null : values.trackingUrlTemplate };
    try {
      if (courier) {
        await save.mutateAsync({ id: courier.id, input });
        toast.success(t("couriers.toast.updated"));
      } else {
        await save.mutateAsync({ input });
        toast.success(t("couriers.toast.created"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={courier ? t("couriers.form.editTitle") : t("couriers.form.createTitle")} description={t("couriers.form.description")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("couriers.col.code")} htmlFor="courier-code" required error={errors.code ? t("couriers.form.codeInvalid") : undefined}>
            <Input id="courier-code" className="font-mono uppercase" invalid={!!errors.code} {...register("code")} />
          </Field>
          <Field
            label={t("couriers.col.name")}
            htmlFor="courier-name"
            required
            className="sm:col-span-2"
            error={errors.name ? t("validation.required") : undefined}
          >
            <Input id="courier-name" invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field
            label={t("couriers.form.urlTemplate")}
            htmlFor="courier-url"
            className="sm:col-span-3"
            error={errors.trackingUrlTemplate ? t("couriers.form.urlInvalid") : undefined}
          >
            <Input
              id="courier-url"
              className="font-mono"
              placeholder="https://example.la/track/{tracking}"
              invalid={!!errors.trackingUrlTemplate}
              aria-describedby="courier-url-hint"
              {...register("trackingUrlTemplate")}
            />
            <p id="courier-url-hint" className="mt-1 text-xs text-ink-muted">
              {t("couriers.form.urlHint")}
            </p>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="size-4 rounded border-line accent-[var(--color-brand)]" {...register("isActive")} />
          {t("couriers.form.active")}
        </label>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
