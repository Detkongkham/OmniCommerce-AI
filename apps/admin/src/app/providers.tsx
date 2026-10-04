"use client";

import { Toaster } from "@oca/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api";
import { LanguageProvider, useT } from "@/lib/i18n/language-provider";

function AppToaster() {
  const { t } = useT();
  return <Toaster dismissLabel={t("common.close")} />;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // ບໍ່ retry error 4xx (ສິດ/ຂໍ້ມູນຜິດ); retry ສູງສຸດ 2 ຄັ້ງກັບ network/5xx
        retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {children}
          <AppToaster />
        </AuthProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}
