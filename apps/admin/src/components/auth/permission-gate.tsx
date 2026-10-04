"use client";

import type { Permission } from "@oca/shared";
import { Card } from "@oca/ui";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { useT } from "@/lib/i18n/language-provider";

/** ໜ້າ "ບໍ່ມີສິດ" ຕາມ DESIGN.md §11.8. API ຍັງບັງຄັບສິດຈິງ; ນີ້ເປັນພຽງ UX. */
export function PermissionGate({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = useCan(permission);
  const { t } = useT();
  if (allowed) return children;
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 text-center">
        <AlertCircle className="mx-auto size-8 text-danger" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold text-ink">{t("forbidden.title")}</h1>
        <p className="mt-2 text-sm text-ink-secondary">{t("forbidden.description")}</p>
      </Card>
    </div>
  );
}
