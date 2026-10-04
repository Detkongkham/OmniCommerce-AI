"use client";

import { cn } from "@oca/ui";
import { Languages } from "lucide-react";
import { useT } from "@/lib/i18n/language-provider";
import { TOPBAR_BUTTON } from "./chrome";

export function LanguageToggle({ className }: { className?: string }) {
  const { t, language, setLanguage } = useT();
  return (
    <button
      type="button"
      aria-label={t("common.language")}
      onClick={() => setLanguage(language === "lo" ? "en" : "lo")}
      className={cn(TOPBAR_BUTTON, "w-auto gap-1.5 px-3 text-sm font-medium", className)}
    >
      <Languages className="size-5" aria-hidden="true" />
      {language === "lo" ? "EN" : "ລາວ"}
    </button>
  );
}
