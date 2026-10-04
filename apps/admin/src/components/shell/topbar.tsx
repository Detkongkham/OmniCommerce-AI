"use client";

import { cn } from "@oca/ui";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useT } from "@/lib/i18n/language-provider";
import { TOPBAR_BUTTON } from "./chrome";
import { LanguageToggle } from "./language-toggle";
import { ProfileMenu } from "./profile-menu";

export interface TopbarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenMobile: () => void;
}

export function Topbar({ collapsed, onToggleCollapsed, onOpenMobile }: TopbarProps) {
  const { t } = useT();
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-[1010] flex h-[64px] items-center justify-between gap-2 border-b border-chrome-line bg-chrome px-2 transition-all duration-300 sm:gap-3 sm:px-3",
        collapsed ? "lg:left-[72px]" : "lg:left-[280px]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button type="button" aria-label={t("nav.menu")} onClick={onOpenMobile} className={cn(TOPBAR_BUTTON, "lg:hidden")}>
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          onClick={onToggleCollapsed}
          className={cn(TOPBAR_BUTTON, "hidden lg:inline-flex")}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-5" aria-hidden="true" />
          )}
        </button>
        <span className="truncate text-base font-semibold text-ink">{t("app.name")}</span>
      </div>
      <div className="flex items-center gap-2">
        <LanguageToggle className="hidden sm:inline-flex" />
        <span aria-hidden="true" className="hidden h-10 w-px bg-line sm:block" />
        <ProfileMenu />
      </div>
    </header>
  );
}
