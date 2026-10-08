"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";

/** ໜ້າເຕັມຈໍ (Host screen, ໃບປະໜ້າ): ຕ້ອງ login ຄື (app) ແຕ່ບໍ່ມີ sidebar/topbar */
export default function HostLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { t } = useT();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div role="status" aria-busy="true" aria-label={t("common.loading")} className="flex min-h-screen items-center justify-center bg-app">
        <Loader2 className="size-6 animate-spin text-brand" aria-hidden="true" />
      </div>
    );
  }
  return <main>{children}</main>;
}
