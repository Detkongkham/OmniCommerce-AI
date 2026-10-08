import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { StaffKpiPage } from "./staff-kpi-page";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const figures = {
  ordersCreated: 5, salesClosed: 4, salesAmount: "1250.00", ordersPacked: 7, ordersShipped: 6, ordersCancelled: 1,
  stockAdjustments: 2, messagesSent: 30, responses: 12, avgResponseSeconds: 95,
};
const rows = [
  { user: { id: "u1", name: "Noy", email: "noy@x", isActive: true, roleName: "CHAT_ADMIN" }, ...figures },
  { user: { id: "u2", name: "Old", email: "old@x", isActive: false, roleName: "WAREHOUSE" }, ...figures, salesAmount: "0.00", responses: 0, avgResponseSeconds: null },
];

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.startsWith("/staff-kpi/u1/daily"))
      return {
        user: rows[0]?.user,
        days: [
          { date: "2026-10-07", ...figures, salesAmount: "500.00" },
          { date: "2026-10-08", ...figures, ordersPacked: 0, avgResponseSeconds: null },
        ],
      };
    if (path.startsWith("/staff-kpi")) return { from: "2026-10-02", to: "2026-10-08", rows };
    return undefined;
  }) as typeof apiFetch);
});

describe("StaffKpiPage", () => {
  it("ຕາຕະລາງ KPI: ປິດ/ເປີດບິນ, ຍອດ, ເວລາຕອບ ນ:ວ, ສະຖານະປິດໃຊ້ງານ; ເລີ່ມ 7 ມື້", async () => {
    renderWithProviders(<StaffKpiPage />);
    const row = await screen.findByTestId("row-kpi-u1");
    expect(within(row).getByText("1,250.00")).toBeInTheDocument();
    expect(within(row).getByText("1:35")).toBeInTheDocument();
    expect(within(row).getByText("12 replies")).toBeInTheDocument();
    expect(row).toHaveTextContent("4 / 5");
    const old = screen.getByTestId("row-kpi-u2");
    expect(within(old).getByText("Inactive")).toBeInTheDocument();
    expect(within(old).getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toMatch(/^\/staff-kpi\?from=.+&to=.+$/);
  });

  it("ເປີດລາຍວັນ: ຕາຕະລາງຕໍ່ມື້ ແລະ ສະຫຼັບຕົວເລກກາຟ", async () => {
    const { user } = renderWithProviders(<StaffKpiPage />);
    await screen.findByTestId("row-kpi-u1");
    await user.click(screen.getByRole("button", { name: "View daily KPI for Noy" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Daily KPI: Noy")).toBeInTheDocument();
    expect(within(await within(dialog).findByTestId("row-day-2026-10-07")).getByText("500.00")).toBeInTheDocument();
    expect(within(dialog).getByTestId("row-day-2026-10-08")).toHaveTextContent("—");
    await user.click(within(dialog).getByRole("button", { name: "Packed" }));
    expect(within(dialog).getByRole("button", { name: "Packed" })).toHaveAttribute("aria-pressed", "true");
  });
});
