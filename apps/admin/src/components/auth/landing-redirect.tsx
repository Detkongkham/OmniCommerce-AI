"use client";

import { Button, Card } from "@oca/ui";
import { AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";
import { firstAllowedHref } from "@/lib/nav";

/** ໜ້າ "/": ສິດຢູ່ຝັ່ງ client ຈຶ່ງລໍ auth ກ່ອນ ແລ້ວຄ່ອຍໄປໜ້າທຳອິດທີ່ຜູ້ໃຊ້ເປີດໄດ້ (ບໍ່ກະພິບ /staff). */
export function LandingRedirect() {
  const { status, user, logout } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const target = status === "authenticated" ? firstAllowedHref(user?.permissions ?? []) : null;

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    else if (target) router.replace(target);
  }, [status, target, router]);

  if (status === "authenticated" && !target) {
    // ບໍ່ມີສິດໃນເມນູເລີຍ: ສະແດງສະຖານະ ບໍ່ redirect ເພື່ອບໍ່ວົນ loop
    return (
      <div className="flex min-h-screen items-center justify-center bg-app p-6">
        <Card className="w-full max-w-md p-8 text-center">
          <AlertCircle className="mx-auto size-8 text-danger" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-bold text-ink">{t("forbidden.title")}</h1>
          <p className="mt-2 text-sm text-ink-secondary">{t("forbidden.description")}</p>
          <Button variant="outlinePrimary" className="mt-6 rounded-lg" onClick={() => void logout()}>
            {t("user.logout")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div role="status" aria-busy="true" aria-label={t("common.loading")} className="flex min-h-screen items-center justify-center bg-app">
      <Loader2 className="size-6 animate-spin text-brand" aria-hidden="true" />
    </div>
  );
}
