"use client";

import { cn } from "@oca/ui";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { useT } from "@/lib/i18n/language-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("common.loading")}
        className="flex min-h-screen items-center justify-center bg-app"
      >
        <Loader2 className="size-6 animate-spin text-brand" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-app">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-all duration-300",
          collapsed ? "lg:ml-[72px]" : "lg:ml-[280px]",
        )}
      >
        <Topbar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="min-h-screen flex-1 pt-[64px]">{children}</main>
      </div>
    </div>
  );
}
