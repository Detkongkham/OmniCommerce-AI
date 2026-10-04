"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginInput, loginSchema } from "@oca/shared";
import { Button, Field, Input } from "@oca/ui";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { Translate } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { validationText } from "@/lib/validation-text";

function loginErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.status === 401) return t("login.invalid");
  if (error instanceof ApiError && error.status === 429) return t("login.tooMany");
  return errorMessage(error, t);
}

export function LoginForm({ onSubmit }: { onSubmit: (values: LoginInput) => Promise<void> }) {
  const { t } = useT();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(loginErrorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-ink-secondary">{t("login.subtitle")}</p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}

      <Field
        label={t("login.email")}
        htmlFor="login-email"
        required
        error={errors.email ? validationText("email", t) : undefined}
      >
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          className="h-11 rounded-lg px-4"
          invalid={!!errors.email}
          {...register("email")}
        />
      </Field>

      <Field
        label={t("login.password")}
        htmlFor="login-password"
        required
        error={errors.password ? validationText("password", t) : undefined}
      >
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="h-11 rounded-lg px-4 pr-11"
            invalid={!!errors.password}
            {...register("password")}
          />
          <button
            type="button"
            aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </Field>

      <Button type="submit" className="h-11 w-full rounded-lg text-base font-bold" loading={isSubmitting}>
        {isSubmitting ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
}
