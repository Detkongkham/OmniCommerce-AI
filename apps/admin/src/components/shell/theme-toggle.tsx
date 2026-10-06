"use client";

import { type Theme, cn, useTheme } from "@oca/ui";
import { Monitor, Moon, Sun } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/language-provider";
import { TOPBAR_BUTTON } from "./chrome";

// ລຳດັບວົນ: ຕາມລະບົບ → ສະຫວ່າງ → ມືດ → ຕາມລະບົບ
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, TranslationKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useT();
  const { theme, setTheme } = useTheme();
  const Icon = ICON[theme];
  return (
    <button
      type="button"
      aria-label={`${t("theme.toggle")}: ${t(LABEL[theme])}`}
      title={t(LABEL[theme])}
      onClick={() => setTheme(NEXT[theme])}
      className={cn(TOPBAR_BUTTON, className)}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
