"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateStaffInput, createStaffSchema, passwordSchema } from "@oca/shared";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  Select,
  toast,
} from "@oca/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCreateStaff, useUpdateStaff } from "@/lib/queries";
import type { RoleDto, StaffDto } from "@/lib/types";
import { validationText } from "@/lib/validation-text";

/** ແກ້ໄຂ: email ບໍ່ປ່ຽນ; ລະຫັດຜ່ານຫວ່າງ = ຄົງເດີມ. ໃຊ້ field ຈາກ schema ຂອງ @oca/shared. */
const editStaffSchema = createStaffSchema
  .pick({ name: true, roleId: true })
  .extend({ email: z.string(), password: z.union([z.literal(""), passwordSchema]) });

export interface StaffFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ສ້າງໃໝ່; ມີຄ່າ = ແກ້ໄຂ. */
  staff: StaffDto | null;
  roles: RoleDto[];
}

export function StaffFormDialog({ open, onOpenChange, staff, roles }: StaffFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <StaffForm
          key={staff?.id ?? "new"}
          staff={staff}
          roles={roles}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function StaffForm({ staff, roles, onDone }: { staff: StaffDto | null; roles: RoleDto[]; onDone: () => void }) {
  const { t } = useT();
  const isEdit = staff !== null;
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const [formError, setFormError] = useState<string | null>(null);

  const schema: z.ZodType<CreateStaffInput, CreateStaffInput> = isEdit ? editStaffSchema : createStaffSchema;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateStaffInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: staff?.email ?? "",
      name: staff?.name ?? "",
      password: "",
      roleId: staff?.roleId ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (staff) {
        await updateStaff.mutateAsync({
          id: staff.id,
          input: { name: values.name, roleId: values.roleId, ...(values.password ? { password: values.password } : {}) },
        });
        toast.success(t("staff.toast.updated"));
      } else {
        await createStaff.mutateAsync(values);
        toast.success(t("staff.toast.created"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={isEdit ? t("staff.edit") : t("staff.form.createTitle")}
        description={isEdit ? t("staff.form.editDescription") : t("staff.form.createDescription")}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("staff.col.name")}
            htmlFor="staff-name"
            required
            error={errors.name ? validationText("name", t) : undefined}
          >
            <Input id="staff-name" invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field
            label={t("staff.col.email")}
            htmlFor="staff-email"
            required={!isEdit}
            error={errors.email ? validationText("email", t) : undefined}
          >
            <Input
              id="staff-email"
              type="email"
              autoComplete="off"
              readOnly={isEdit}
              invalid={!!errors.email}
              {...register("email")}
            />
          </Field>
          <Field
            label={t("staff.form.password")}
            htmlFor="staff-password"
            required={!isEdit}
            error={errors.password ? validationText("password", t) : undefined}
          >
            <Input
              id="staff-password"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? t("staff.form.passwordKeep") : undefined}
              invalid={!!errors.password}
              {...register("password")}
            />
          </Field>
          <Field
            label={t("staff.col.role")}
            htmlFor="staff-role"
            required
            error={errors.roleId ? validationText("roleId", t) : undefined}
          >
            <Select id="staff-role" invalid={!!errors.roleId} {...register("roleId")}>
              <option value="">{t("staff.form.rolePlaceholder")}</option>
              {staff && !roles.some((role) => role.id === staff.roleId) ? (
                <option value={staff.roleId}>{staff.roleName}</option>
              ) : null}
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
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
