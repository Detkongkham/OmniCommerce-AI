"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type RoleInput, roleSchema } from "@oca/shared";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  toast,
} from "@oca/ui";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useSaveRole } from "@/lib/queries";
import type { RoleDto } from "@/lib/types";
import { PermissionMatrix } from "./permission-matrix";

export interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ສ້າງໃໝ່. */
  role: RoleDto | null;
  /** true = ເບິ່ງຢ່າງດຽວ (role ລະບົບ ຫຼື ບໍ່ມີສິດ staff:write). */
  readOnly: boolean;
}

export function RoleFormDialog({ open, onOpenChange, role, readOnly }: RoleFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t("common.close")}>
        <RoleForm key={role?.id ?? "new"} role={role} readOnly={readOnly} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RoleForm({ role, readOnly, onDone }: { role: RoleDto | null; readOnly: boolean; onDone: () => void }) {
  const { t } = useT();
  const saveRole = useSaveRole();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: role?.name ?? "",
      description: role?.description ?? "",
      permissions: role?.permissions ?? [],
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await saveRole.mutateAsync({
        id: role?.id,
        input: { ...values, description: values.description || undefined },
      });
      toast.success(t(role ? "roles.toast.updated" : "roles.toast.created"));
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  const title = readOnly ? t("roles.form.viewTitle") : role ? t("roles.form.editTitle") : t("roles.form.createTitle");
  const description = readOnly
    ? t("roles.form.systemDescription")
    : role
      ? t("roles.form.editDescription")
      : t("roles.form.createDescription");

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={title} description={description} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("roles.col.name")}
            htmlFor="role-name"
            required={!readOnly}
            error={errors.name ? t("validation.required") : undefined}
          >
            <Input id="role-name" readOnly={readOnly} invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field label={t("roles.col.description")} htmlFor="role-description">
            <Input id="role-description" readOnly={readOnly} {...register("description")} />
          </Field>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-secondary">{t("roles.form.permissions")}</p>
          <Controller
            control={control}
            name="permissions"
            render={({ field }) => (
              <PermissionMatrix value={field.value} onChange={field.onChange} disabled={readOnly} />
            )}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {readOnly ? t("common.close") : t("common.cancel")}
        </Button>
        {readOnly ? null : (
          <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
            {isSubmitting ? t("common.saving") : t("common.save")}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
