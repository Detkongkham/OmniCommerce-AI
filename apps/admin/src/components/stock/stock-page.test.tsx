import { QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import { renderWithProviders } from "@/test/render";
import { StockPage } from "./stock-page";

let urlSearch = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(urlSearch) }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => true }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  urlSearch = "";
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string) =>
    path.startsWith("/warehouses") ? [] : { items: [], total: 0, page: 1, pageSize: 10 },
  );
  window.history.replaceState(null, "", "/stock");
});

/** render ໃໝ່ພາຍໃຕ້ provider ເດີມ ເພື່ອຈຳລອງ navigation ທີ່ປ່ຽນ URL ໂດຍບໍ່ unmount. */
function renderPage(props: { initialQuery: string; initialTab: "levels" | "movements" }) {
  const view = renderWithProviders(<StockPage {...props} />);
  const rerenderPage = () =>
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <LanguageProvider initialLanguage="en">
          <StockPage {...props} />
        </LanguageProvider>
      </QueryClientProvider>,
    );
  return { ...view, rerenderPage };
}

const movementsCalls = () => vi.mocked(apiFetch).mock.calls.filter(([path]) => String(path).startsWith("/stock/movements"));

describe("StockPage", () => {
  it("ເລີ່ມທີ່ແຖບຍອດ ແລະ ສະຫຼັບໄປແຖບປະຫວັດໄດ້ (URL ຖືກອັບເດດ)", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="" initialTab="levels" />);
    expect(screen.getByRole("tab", { name: "Levels", selected: true })).toBeInTheDocument();
    expect(await screen.findByText("No stock yet")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("tab", { name: "History", selected: true })).toBeInTheDocument();
    expect(await screen.findByText("No movements found")).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=movements");
    await user.click(screen.getByRole("tab", { name: "Levels" }));
    expect(window.location.search).toBe("");
  });

  it("syncTabToUrl ຮັກສາ ?q=", async () => {
    window.history.replaceState(null, "", "/stock?q=TEE");
    urlSearch = "q=TEE";
    const { user } = renderWithProviders(<StockPage initialQuery="TEE" initialTab="levels" />);
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(new URLSearchParams(window.location.search).get("q")).toBe("TEE");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("movements");
    await user.click(screen.getByRole("tab", { name: "Levels" }));
    expect(window.location.search).toBe("?q=TEE");
  });

  it("initialTab=movements ເປີດແຖບປະຫວັດ; initialQuery ສົ່ງໃຫ້ແຖບຍອດ", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="TEE" initialTab="movements" />);
    expect(screen.getByRole("tab", { name: "History", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "History" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Levels" }));
    expect(screen.getByRole("tabpanel", { name: "Levels" })).toBeVisible();
    expect(screen.getByDisplayValue("TEE")).toBeInTheDocument();
  });

  it("filter ຂອງແຖບຍອດຍັງຢູ່ຫຼັງສະຫຼັບໄປ-ມາ", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="" initialTab="levels" />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "XYZ");
    await user.click(screen.getByRole("tab", { name: "History" }));
    await user.click(screen.getByRole("tab", { name: "Levels" }));
    expect(screen.getByRole("searchbox")).toHaveValue("XYZ");
  });

  it("lazy mount: ບໍ່ຍິງ /stock/movements ກ່ອນເປີດແຖບປະຫວັດ", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="" initialTab="levels" />);
    await screen.findByText("No stock yet");
    expect(movementsCalls()).toHaveLength(0);
    await user.click(screen.getByRole("tab", { name: "History" }));
    await waitFor(() => expect(movementsCalls().length).toBeGreaterThan(0));
  });

  it("panel ທີ່ບໍ່ active ຖືກຊ່ອນຈິງ ແລະ aria-controls ຊີ້ຖືກ panel", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="" initialTab="levels" />);
    await user.click(screen.getByRole("tab", { name: "History" }));
    // ຊື່ຂອງ element ທີ່ຖືກ hidden ຄຳນວນບໍ່ໄດ້ (a11y spec) ຈຶ່ງຫາຜ່ານ aria-controls ແທນ name
    const levelsPanel = document.getElementById(screen.getByRole("tab", { name: "Levels" }).getAttribute("aria-controls") ?? "");
    expect(levelsPanel).toHaveAttribute("role", "tabpanel");
    expect(levelsPanel).not.toBeVisible();
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(2);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    const tab = screen.getByRole("tab", { name: "History" });
    const panel = screen.getByRole("tabpanel", { name: "History" });
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    expect(screen.getByRole("tablist")).toHaveAccessibleName("Stock sections");
  });

  it("ປຸ່ມລູກສອນ/Home/End ເລື່ອນລະຫວ່າງແຖບ", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="" initialTab="levels" />);
    const selected = (name: string) => expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    screen.getByRole("tab", { name: "Levels" }).focus();
    await user.keyboard("{ArrowRight}");
    selected("History");
    expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Levels" })).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{ArrowRight}");
    selected("Levels");
    await user.keyboard("{ArrowLeft}");
    selected("History");
    await user.keyboard("{Home}");
    selected("Levels");
    expect(screen.getByRole("tab", { name: "Levels" })).toHaveFocus();
    await user.keyboard("{End}");
    selected("History");
    expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
  });

  it("ສະຖານະ A: ໄປ /stock (ບໍ່ມີ tab) ຫຼັງຢູ່ແຖບປະຫວັດ -> ກັບແຖບຍອດ", async () => {
    const { user, rerenderPage } = renderPage({ initialQuery: "", initialTab: "levels" });
    await user.click(screen.getByRole("tab", { name: "History" }));
    urlSearch = "tab=movements"; // Next sync ຫຼັງ replaceState
    rerenderPage();
    expect(screen.getByRole("tab", { name: "History", selected: true })).toBeInTheDocument();
    urlSearch = ""; // ກົດ link "Stock" ໃນ sidebar
    rerenderPage();
    expect(screen.getByRole("tab", { name: "Levels", selected: true })).toBeInTheDocument();
  });

  it("ສະຖານະ B: ໄປ ?tab=movements ຫຼັງສະຫຼັບມາແຖບຍອດ -> ເປີດແຖບປະຫວັດ", async () => {
    urlSearch = "tab=movements";
    const { user, rerenderPage } = renderPage({ initialQuery: "", initialTab: "movements" });
    await user.click(screen.getByRole("tab", { name: "Levels" }));
    urlSearch = "";
    rerenderPage();
    expect(screen.getByRole("tab", { name: "Levels", selected: true })).toBeInTheDocument();
    urlSearch = "tab=movements";
    rerenderPage();
    expect(screen.getByRole("tab", { name: "History", selected: true })).toBeInTheDocument();
  });

  it("q ໃນ URL ປ່ຽນ -> ຊ່ອງຄົ້ນຫາຕາມ; tab ປ່ຽນ -> ບໍ່ remount (ຄ່າທີ່ພິມຍັງຢູ່)", async () => {
    const { user, rerenderPage } = renderPage({ initialQuery: "", initialTab: "levels" });
    await user.type(screen.getByRole("searchbox"), "XYZ");
    urlSearch = "tab=movements";
    rerenderPage();
    urlSearch = "";
    rerenderPage();
    expect(screen.getByRole("searchbox")).toHaveValue("XYZ");
    urlSearch = "q=SKU-9";
    rerenderPage();
    expect(screen.getByRole("searchbox")).toHaveValue("SKU-9");
  });
});
