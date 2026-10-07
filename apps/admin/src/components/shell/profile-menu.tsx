"use client";

import { Avatar } from "@oca/ui";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("user.menu")}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl p-1 hover:bg-nav-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar name={user.name} className="size-8 border border-chrome-line" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="mt-0.5 inline-flex h-4 items-center rounded bg-nav-active px-1.5 text-[10px] text-brand-ink">
            {user.roleName}
          </span>
        </span>
      </button>

      {open ? (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[290px] max-w-[92vw] overflow-hidden rounded-2xl border border-chrome-line bg-surface shadow-xl animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center gap-3 bg-linear-to-br from-brand to-brand-bright p-4 text-white">
              <Avatar name={user.name} className="size-14 border-[3px] border-white/40 text-lg" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{user.name}</p>
                <p className="truncate text-xs text-white/80">{user.email}</p>
                <span className="mt-1 inline-flex rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[11px]">
                  {user.roleName}
                </span>
              </div>
            </div>
            <div className="border-t border-line p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-danger hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {t("user.logout")}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
