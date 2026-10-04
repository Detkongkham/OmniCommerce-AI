import Image from "next/image";
import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/shell/language-toggle";

export function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-[#0c0030] via-[#1c0a47] to-brand-deep p-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-purple-600/30 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 size-[380px] rounded-full bg-violet-600/25 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 size-[300px] -translate-x-1/2 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>
      <div className="absolute right-4 top-4 z-10">
        <LanguageToggle className="border-white/20 bg-white/10 text-white hover:bg-white/20" />
      </div>
      <div className="relative w-full max-w-[480px] rounded-2xl bg-surface p-8 shadow-2xl sm:p-10">
        <div className="mb-6 flex justify-center">
          <Image src="/oca-logo.png" alt="OmniCommerce AI" width={112} height={98} priority />
        </div>
        {children}
      </div>
    </main>
  );
}
