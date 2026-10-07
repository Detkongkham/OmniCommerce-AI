import { PASSWORD_MIN_LENGTH } from "@oca/shared";
import type { Translate } from "@/lib/i18n/dictionary";

export function validationText(field: string, t: Translate): string {
  if (field === "email") return t("validation.email");
  if (field === "password") return t("validation.passwordMin", { min: PASSWORD_MIN_LENGTH });
  return t("validation.required");
}
