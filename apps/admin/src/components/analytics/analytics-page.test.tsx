import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiDownload, apiFetch, saveBlob } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { AnalyticsPage } from "./analytics-page";

const auth = vi.hoisted(() => ({ costs: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: (permission: string) => (permission === "costs:read" ? auth.costs : true) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
  saveBlob: vi.fn(),
}));

const summary = {
  from: "2026-09-09", to: "2026-10-08", orders: 3, units: 4, customers: 2,
  grossSales: "400.00", discounts: "10.00", shippingIncome: "20.00", vat: "10.00", revenue: "400.00",
  avgOrderValue: "133.33", cogs: "240.00", grossProfit: "160.00", grossMargin: "40.0", cancelled: 1, pendingAmount: "500.00",
};
const channel = (key: string, orders: number, revenue: string, share: string) => ({ key, orders, revenue, share, cogs: "0.00", grossProfit: revenue });

function mockApi(overrides: Record<string, unknown> = {}) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    const route = path.split("?")[0] ?? "";
    if (route in overrides) {
      const value = overrides[route];
      if (value instanceof Error) throw value;
      return value;
    }
    if (route === "/analytics/summary") return summary;
    if (route === "/analytics/daily") return { days: [{ date: "2026-10-01", orders: 2, revenue: "300.00", cogs: "180.00", grossProfit: "120.00" }] };
    if (route === "/analytics/channels")
      return {
        channels: [channel("FACEBOOK", 2, "310.00", "77.5"), channel("STOREFRONT", 1, "90.00", "22.5"), channel("LINE", 0, "0.00", "0.0")],
        sources: [channel("LIVE_CF", 1, "210.00", "52.5"), channel("MANUAL", 0, "0.00", "0.0")],
      };
    if (route === "/analytics/top-products")
      return [{ variantId: "v1", sku: "SKU-1", productName: "Shirt", variantName: "Red / M", units: 3, revenue: "300.00", cogs: "180.00", grossProfit: "120.00" }];
    if (route === "/analytics/deadstock")
      return { days: 60, total: 1, page: 1, pageSize: 10, items: [{ variantId: "v2", sku: "SKU-2", productName: "Hat", variantName: null, onHand: 7, stockValue: "420.00", lastSoldAt: null }] };
    return undefined;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.costs = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiDownload).mockReset();
  vi.mocked(saveBlob).mockReset();
  mockApi();
});
afterEach(() => vi.useRealTimers());

const calledPaths = () => vi.mocked(apiFetch).mock.calls.map(([path]) => path);

describe("AnalyticsPage", () => {
  it("ສະແດງ stat, P&L, ຊ່ອງທາງ, ສິນຄ້າຂາຍດີ ແລະ ຄ້າງສະຕ໋ອກ; ເລີ່ມ 30 ມື້", async () => {
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByText("133.33")).toBeInTheDocument();
    expect(screen.getByText("40.0% margin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(calledPaths().some((path) => /^\/analytics\/summary\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/.test(path))).toBe(true);

    expect(screen.getByText("Cost of goods (COGS)")).toBeInTheDocument();
    expect(screen.getByText("−240.00")).toBeInTheDocument();
    expect(within(await screen.findByTestId("row-channel-FACEBOOK")).getByText("77.5%")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-top-SKU-1")).getByText("Shirt")).toBeInTheDocument();
    expect(within(await screen.findByTestId("row-dead-SKU-2")).getByText("Never sold")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-dead-SKU-2")).getByText("420.00")).toBeInTheDocument();
  });

  it("ສະຫຼັບເປັນແຫຼ່ງບິນ", async () => {
    const { user } = renderWithProviders(<AnalyticsPage />);
    await screen.findByTestId("row-channel-FACEBOOK");
    await user.click(screen.getByRole("button", { name: "Order source" }));
    expect(within(screen.getByTestId("row-source-LIVE_CF")).getByText("Live CF")).toBeInTheDocument();
  });

  it("ບໍ່ມີ costs:read: ບໍ່ສະແດງກຳໄລ/ຕົ້ນທຶນ", async () => {
    auth.costs = false;
    renderWithProviders(<AnalyticsPage />);
    await screen.findByText("133.33");
    expect(screen.queryByText("Gross profit")).not.toBeInTheDocument();
    expect(screen.queryByText("Cost of goods (COGS)")).not.toBeInTheDocument();
    expect(screen.queryByText("Value (cost)")).not.toBeInTheDocument();
  });

  it("ປ່ຽນ preset → query ຊ່ວງໃໝ່; ຊ່ວງຜິດ → ແຈ້ງ ແລະ ບໍ່ສົ່ງ", async () => {
    const { user } = renderWithProviders(<AnalyticsPage />);
    await screen.findByText("133.33");
    await user.click(screen.getByRole("button", { name: "Last month" }));
    expect(screen.getByRole("button", { name: "Last month" })).toHaveAttribute("aria-pressed", "true");
    const from = screen.getByLabelText("From") as HTMLInputElement;
    const to = screen.getByLabelText("To") as HTMLInputElement;
    await waitFor(() => expect(calledPaths()).toContain(`/analytics/summary?from=${from.value}&to=${to.value}`));

    const before = calledPaths().length;
    await user.clear(to);
    await user.type(to, "2000-01-01");
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid date range");
    expect(calledPaths().slice(before).some((path) => path.includes("to=2000-01-01"))).toBe(false);
  });

  it("ສົ່ງອອກ CSV ດ້ວຍຊ່ວງປັດຈຸບັນ", async () => {
    vi.mocked(apiDownload).mockResolvedValue({ blob: new Blob(["x"]), filename: "sales.csv" });
    const { user } = renderWithProviders(<AnalyticsPage />);
    await screen.findByText("133.33");
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "sales.csv"));
    expect(vi.mocked(apiDownload).mock.calls[0]?.[0]).toMatch(/^\/analytics\/export\.csv\?from=.+&to=.+$/);
  });

  it("summary ລົ້ມ → ຂໍ້ຄວາມ + ລອງໃໝ່", async () => {
    mockApi({ "/analytics/summary": new Error("boom") });
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
