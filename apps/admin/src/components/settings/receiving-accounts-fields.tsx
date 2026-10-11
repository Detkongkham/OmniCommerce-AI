"use client";

import { RECEIVING_ACCOUNT_LIMITS } from "@oca/shared";
import { Button, Field, Input } from "@oca/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import {
  type Control,
  type UseFormRegister,
  useFieldArray,
} from "react-hook-form";
import { useT } from "@/lib/i18n/language-provider";

export const MAX_RECEIVING_ACCOUNTS = 20;

/** ຄ່າຂອງຟອມຍ່ອຍ (ຮູບຮ່າງຕ້ອງຕົງກັບ FormValues ຂອງ store-settings-form) */
export interface ReceivingAccountsValues {
  receivingAccounts: {
    bank: string;
    accountNo: string;
    accountName?: string | undefined;
  }[];
}

/** ຕຳແໜ່ງທີ່ຜິດ: row (0-based, null = ບໍ່ຮູ້ແຖວ) ແລະ field ທີ່ຜິດ */
export interface ReceivingAccountsError {
  row: number | null;
  field: "bank" | "accountNo" | "accountName" | null;
}

interface Props {
  control: Control<ReceivingAccountsValues, unknown, ReceivingAccountsValues>;
  register: UseFormRegister<ReceivingAccountsValues>;
  canWrite: boolean;
  error: ReceivingAccountsError | null;
}

/** fieldset ແກ້ບັນຊີຮັບເງິນຂອງຮ້ານ (ເພີ່ມ/ລຶບແຖວ, ອ່ານຢ່າງດຽວເມື່ອບໍ່ມີສິດ) */
export function ReceivingAccountsFields({
  control,
  register,
  canWrite,
  error,
}: Props) {
  const { t } = useT();
  const baseId = useId();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "receivingAccounts",
  });
  const addRef = useRef<HTMLButtonElement>(null);
  const focusAddRef = useRef(false);

  // ຫຼັງລຶບແຖວ ຍ້າຍ focus ມາປຸ່ມ "ເພີ່ມ" (ລໍ render ກ່ອນ ເພາະປຸ່ມອາດຖືກປິດຕອນຄົບ 20)
  useEffect(() => {
    if (focusAddRef.current) {
      focusAddRef.current = false;
      addRef.current?.focus();
    }
  }, [fields.length]);

  const errorId = `${baseId}-accounts-error`;
  const message = error
    ? error.row === null
      ? t("settings.receiving.invalid")
      : t("settings.receiving.invalidRow", { n: error.row + 1 })
    : null;
  const invalidAt = (
    row: number,
    field: NonNullable<ReceivingAccountsError["field"]>,
  ) => error?.row === row && error.field === field;

  return (
    <fieldset
      className="space-y-3 rounded-xl border border-line p-4"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="px-1 text-sm font-semibold text-ink">
        {t("settings.receiving.title")}
      </legend>
      <p className="text-xs text-ink-muted">
        {t("settings.receiving.description")}
      </p>
      {fields.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {t("settings.receiving.empty")}
        </p>
      ) : null}
      {fields.map((field, index) => {
        const rowId = `${baseId}-acc-${index}`;
        return (
          <div
            key={field.id}
            role="group"
            aria-label={t("settings.receiving.row", { n: index + 1 })}
            className="grid grid-cols-1 items-end gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_1fr_1fr_auto] sm:border-t-0 sm:pt-0"
          >
            <Field
              label={t("settings.receiving.bank")}
              htmlFor={`${rowId}-bank`}
            >
              <Input
                id={`${rowId}-bank`}
                maxLength={RECEIVING_ACCOUNT_LIMITS.bank}
                disabled={!canWrite}
                invalid={invalidAt(index, "bank")}
                {...register(`receivingAccounts.${index}.bank`)}
              />
            </Field>
            <Field
              label={t("settings.receiving.accountNo")}
              htmlFor={`${rowId}-no`}
            >
              <Input
                id={`${rowId}-no`}
                maxLength={RECEIVING_ACCOUNT_LIMITS.accountNo}
                disabled={!canWrite}
                invalid={invalidAt(index, "accountNo")}
                {...register(`receivingAccounts.${index}.accountNo`)}
              />
            </Field>
            <Field
              label={t("settings.receiving.accountName")}
              htmlFor={`${rowId}-name`}
            >
              <Input
                id={`${rowId}-name`}
                maxLength={RECEIVING_ACCOUNT_LIMITS.accountName}
                disabled={!canWrite}
                invalid={invalidAt(index, "accountName")}
                {...register(`receivingAccounts.${index}.accountName`)}
              />
            </Field>
            {canWrite ? (
              <Button
                type="button"
                variant="outlinePrimary"
                className="h-10 rounded-lg"
                aria-label={t("settings.receiving.remove", { n: index + 1 })}
                onClick={() => {
                  focusAddRef.current = true;
                  remove(index);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        );
      })}
      {message ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {message}
        </p>
      ) : null}
      {canWrite ? (
        <Button
          ref={addRef}
          type="button"
          variant="outlinePrimary"
          className="rounded-lg"
          disabled={fields.length >= MAX_RECEIVING_ACCOUNTS}
          onClick={() =>
            // focus ຊ່ອງ Bank ຂອງແຖວໃໝ່
            append(
              { bank: "", accountNo: "", accountName: "" },
              { focusName: `receivingAccounts.${fields.length}.bank` },
            )
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("settings.receiving.add")}
        </Button>
      ) : null}
    </fieldset>
  );
}
