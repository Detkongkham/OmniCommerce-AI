"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createWarehouseSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCreateWarehouse, useUpdateWarehouse } from "@/lib/queries";
import type { WarehouseDto } from "@/lib/types";
import { validationText } from "@/lib/validation-text";

/** ຟອມໃຊ້ສະຕຣິງລ້ວນ (address ເປົ່າໄດ້); ແປງເປັນ payload ຂອງ API ຕອນ submit */
const formSchema = z.object({
  code: z.string().trim().toUpperCase().pipe(createWarehouseSchema.shape.code),
  name: createWarehouseSchema.shape.name,
  address: z.string().trim().max(300),
});
type FormValues = z.input<typeof formSchema>;

export interface WarehouseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ສ້າງໃໝ່ */
  warehouse: WarehouseDto | null;
}

export function WarehouseFormDialog({ open, onOpenChange, warehouse }: WarehouseFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <WarehouseForm key={warehouse?.id ?? "new"} warehouse={warehouse} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function WarehouseForm({ warehouse, onDone }: { warehouse: WarehouseDto | null; onDone: () => void }) {
  const { t } = useT();
  const create = useCreateWarehouse();
  const update = useUpdateWarehouse();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: warehouse?.code ?? "", name: warehouse?.name ?? "", address: warehouse?.address ?? "" },
  });

  const submit = handleSubmit(async (raw) => {
    setFormError(null);
    const values = formSchema.parse(raw);
    try {
      if (warehouse) {
        await update.mutateAsync({
          id: warehouse.id,
          input: { code: values.code, name: values.name, address: values.address === "" ? null : values.address },
        });
        toast.success(t("warehouses.toast.updated"));
      } else {
        await create.mutateAsync({
          code: values.code,
          name: values.name,
          ...(values.address ? { address: values.address } : {}),
          isActive: true,
        });
        toast.success(t("warehouses.toast.created"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={warehouse ? t("warehouses.edit") : t("warehouses.form.createTitle")}
        description={warehouse ? t("warehouses.form.editDescription") : t("warehouses.form.createDescription")}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("warehouses.col.code")}
            htmlFor="warehouse-code"
            required
            error={errors.code ? validationText("code", t) : undefined}
          >
            <Input id="warehouse-code" invalid={!!errors.code} placeholder="MAIN" {...register("code")} />
            <p className="mt-1 text-xs text-ink-muted">{t("warehouses.form.codeHint")}</p>
          </Field>
          <Field
            label={t("warehouses.col.name")}
            htmlFor="warehouse-name"
            required
            error={errors.name ? validationText("name", t) : undefined}
          >
            <Input id="warehouse-name" invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field label={t("warehouses.col.address")} htmlFor="warehouse-address" className="sm:col-span-2">
            <Input id="warehouse-address" {...register("address")} />
          </Field>
        </div>
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
