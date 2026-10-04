"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { LoginForm } from "@/components/auth/login-form";
import { LoginShell } from "@/components/auth/login-shell";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/staff");
  }, [status, router]);

  return (
    <LoginShell>
      <LoginForm onSubmit={login} />
    </LoginShell>
  );
}
