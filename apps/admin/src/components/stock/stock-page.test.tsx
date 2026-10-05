import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { StockPage } from "./stock-page";

vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => true }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string) =>
    path.startsWith("/warehouses") ? [] : { items: [], total: 0, page: 1, pageSize: 10 },
  );
  window.history.replaceState(null, "", "/stock");
});

describe("StockPage", () => {
  it("ເລີ່ມທີ່ແຖບຍອດ ແລະ ສະຫຼັບໄປແຖບປະຫວັດໄດ້", async () => {
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

  it("initialTab=movements ເປີດແຖບປະຫວັດ; initialQuery ສົ່ງໃຫ້ແຖບຍອດ", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="TEE" initialTab="movements" />);
    expect(screen.getByRole("tab", { name: "History", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "History" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Levels" }));
    expect(screen.getByRole("tabpanel", { name: "Levels" })).toBeVisible();
    expect(screen.getByDisplayValue("TEE")).toBeInTheDocument();
  });

  it("ປຸ່ມລູກສອນ/Home/End ເລື່ອນລະຫວ່າງແຖບ ແລະ ຮັກສາ state ຂອງແຖບທີ່ເຄີຍເປີດ", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="TEE" initialTab="levels" />);
    const levels = screen.getByRole("tab", { name: "Levels" });
    levels.focus();
    await user.keyboard("{ArrowRight}");
    const history = screen.getByRole("tab", { name: "History" });
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(history).toHaveFocus();
    expect(levels).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Levels" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    // panel ຂອງແຖບຍອດຍັງ mount ຢູ່ (ບໍ່ເສຍ filter)
    expect(screen.getByDisplayValue("TEE")).toBeInTheDocument();
  });
});
