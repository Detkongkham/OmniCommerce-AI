"use client";

import { cn } from "@oca/ui";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";
import { isActivePath, visibleNavGroups } from "@/lib/nav";

export interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { user } = useAuth();
  const { t } = useT();
  const pathname = usePathname();
  const groups = visibleNavGroups(user?.permissions ?? []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {mobileOpen ? (
        <div aria-hidden="true" className="fixed inset-0 z-[1020] bg-black/40 lg:hidden" onClick={onCloseMobile} />
      ) : null}
      <aside
        className={cn(
          "fixed left-0 top-0 z-[1030] flex h-screen w-[280px] flex-col border-r border-chrome-line bg-chrome transition-all duration-300",
          collapsed ? "lg:w-[72px]" : "lg:w-[280px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-[124px] shrink-0 items-center justify-center">
          <Image
            src="/oca-mark.png"
            alt="OCA"
            width={92}
            height={92}
            priority
            className={cn("rounded-[22px] object-contain transition-all duration-300", collapsed ? "lg:size-10" : "size-[92px]")}
          />
        </div>

        <nav aria-label={t("nav.menu")} className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 pb-3">
          {groups.map((group) => {
            const groupActive = group.items.some((item) => isActivePath(pathname, item.href));
            return (
              <div key={group.id} className="flex flex-col gap-1">
                <p
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider",
                    groupActive ? "font-semibold text-brand" : "text-brand-ink/60",
                    collapsed && "lg:hidden",
                  )}
                >
                  {groupActive ? <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" /> : null}
                  {t(group.labelKey)}
                </p>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? t(item.labelKey) : undefined}
                      onClick={onCloseMobile}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-xl px-3 text-[14px] transition-colors",
                        collapsed && "lg:mx-auto lg:h-10 lg:w-12 lg:justify-center lg:px-0",
                        active ? "bg-nav-active text-brand-ink" : "text-ink-secondary hover:bg-nav-hover",
                      )}
                    >
                      <Icon
                        className={cn("size-[18px] shrink-0", active ? "text-brand-ink" : "text-ink-muted")}
                        aria-hidden="true"
                      />
                      <span className={cn("truncate", collapsed && "lg:sr-only")}>{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="flex h-7 shrink-0 items-center justify-center border-t border-chrome-line text-[11px] text-brand">
          OCA
        </div>
      </aside>
    </>
  );
}
