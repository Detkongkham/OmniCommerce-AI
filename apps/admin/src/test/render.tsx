import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/lib/i18n/language-provider";

/** render ພ້ອມ QueryClient (ບໍ່ retry) ແລະ ພາສາອັງກິດ ເພື່ອໃຫ້ assert ຂໍ້ຄວາມໄດ້ຊັດເຈນ. */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLanguage="en">{ui}</LanguageProvider>
    </QueryClientProvider>,
  );
  return { user, queryClient, ...result };
}
