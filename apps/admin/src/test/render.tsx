import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

/** ຕັ້ງຄ່າ DateField ຕາມ label ຜ່ານປະຕິທິນ; value "" = ກົດປຸ່ມລ້າງ. */
export function pickDate(label: string, value: string) {
  if (value === "") {
    fireEvent.click(screen.getByRole("button", { name: `Clear ${label}` }));
    return;
  }
  const [y = "", m = "", d = ""] = value.split("-");
  fireEvent.click(screen.getByRole("button", { name: label }));
  const dialog = screen.getByRole("dialog", { name: label });
  fireEvent.change(within(dialog).getByLabelText("Year"), { target: { value: y } });
  fireEvent.change(within(dialog).getByLabelText("Month"), { target: { value: String(Number(m) - 1) } });
  fireEvent.click(within(dialog).getByRole("button", { name: String(Number(d)) }));
}

/** ປຸ່ມ trigger ຂອງ DateField — ບ່ອນທີ່ aria-invalid/aria-describedby/data-value ຖືກຕັ້ງ. */
export function dateControl(label: string) {
  return screen.getByRole("button", { name: label });
}
