"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { LoginForm } from "@/components/auth/login-form";
import { LoginShell } from "@/components/auth/login-shell";
import { firstAllowedHref } from "@/lib/nav";

export default function LoginPage() {
  const { status, user, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // ໄປໜ້າທຳອິດທີ່ role ເປີດໄດ້; ບໍ່ມີເມນູເລີຍ -> "/" ສະແດງໜ້າບໍ່ມີສິດ
    if (status === "authenticated") router.replace(firstAllowedHref(user?.permissions ?? []) ?? "/");
  }, [status, user, router]);

  return (
    <LoginShell>
      <LoginForm onSubmit={login} />
    </LoginShell>
  );
}
