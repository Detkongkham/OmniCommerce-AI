import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { CrmCustomerListItemDto, CrmSegmentSummaryDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CustomerList } from "./customer-list";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const items: CrmCustomerListItemDto[] = [
  { id: "c1", name: "Mali", phone: "02055550001", email: null, createdAt: "2026-09-01T00:00:00.000Z", orderCount: 12, totalSpent: "1250000.00", lastPaidAt: "2026-10-05T05:30:00.000Z", segment: "CHAMPION" },
  { id: "c2", name: "Kham", phone: null, email: null, createdAt: "2026-10-01T00:00:00.000Z", orderCount: 0, totalSpent: "0.00", lastPaidAt: null, segment: null },
];
const summary: CrmSegmentSummaryDto = { total: 9, noOrders: 2, segments: { CHAMPION: 1, LOYAL: 2, NEW: 1, AT_RISK: 3, LOST: 0, REGULAR: 0 } };

function mockApi(page: Page<CrmCustomerListItemDto> = { items, total: 2, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => (path.startsWith("/crm/customers/segments") ? summary : page)) as typeof apiFetch);
}
const listUrls = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]).filter((url) => !url.includes("/segments"));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("CustomerList", () => {
  it("ຕາຕະລາງ: ຊື່ (ລິ້ງ), ເບີ, ກຸ່ມ, ບິນ, ຍອດຊື້, ຊື້ຫຼ້າສຸດ", async () => {
    renderWithProviders(<CustomerList />);
    const first = await screen.findByTestId("row-customer-c1");
    expect(within(first).getByRole("link", { name: "Mali" })).toHaveAttribute("href", "/customers/c1");
    expect(within(first).getByText("02055550001")).toBeInTheDocument();
    expect(within(first).getByText("Champion")).toBeInTheDocument();
    expect(within(first).getByText("12")).toBeInTheDocument();
    expect(within(first).getByText("1,250,000.00")).toBeInTheDocument();
    expect(within(first).getByText("05/10/2026 12:30")).toBeInTheDocument();
    const second = screen.getByTestId("row-customer-c2");
    expect(within(second).getByText("No phone")).toBeInTheDocument();
    expect(within(second).getAllByText("No purchase yet").length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: "Customers" })).toBeInTheDocument();
    expect(listUrls()[0]).toBe("/crm/customers?sort=lastOrder&page=1&pageSize=10");
  });

  it("ປຸ່ມກຸ່ມສະແດງຈຳນວນ; ກົດເພື່ອກັ່ນຕອງ ແລະ ກົດຊ້ຳເພື່ອຍົກເລີກ", async () => {
    const { user } = renderWithProviders(<CustomerList />);
    const atRisk = await screen.findByRole("button", { name: /^At risk\s*3$/ });
    expect(screen.getByRole("button", { name: /^All\s*9$/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(atRisk);
    await waitFor(() => expect(listUrls().at(-1)).toBe("/crm/customers?segment=AT_RISK&sort=lastOrder&page=1&pageSize=10"));
    expect(atRisk).toHaveAttribute("aria-pressed", "true");
    await user.click(atRisk);
    await waitFor(() => expect(listUrls().at(-1)).toBe("/crm/customers?sort=lastOrder&page=1&pageSize=10"));
  });

  it("ຄົ້ນຫາ (debounce) ແລະ ປ່ຽນການລຽງ ກັບໄປໜ້າ 1", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<CustomerList />);
    await screen.findByTestId("row-customer-c1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(listUrls().at(-1)).toContain("page=2"));
    await user.selectOptions(screen.getByLabelText("Sort by"), "spent");
    await waitFor(() => expect(listUrls().at(-1)).toBe("/crm/customers?sort=spent&page=1&pageSize=10"));
    await user.type(screen.getByLabelText("Search name or phone..."), "mali");
    await waitFor(() => expect(listUrls().at(-1)).toBe("/crm/customers?q=mali&sort=spent&page=1&pageSize=10"));
  });

  it("ວ່າງ: ບໍ່ມີລູກຄ້າ / ບໍ່ພົບຕາມເງື່ອນໄຂ; ໂຫຼດລົ້ມ: ປຸ່ມລອງໃໝ່", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user, unmount } = renderWithProviders(<CustomerList />);
    expect(await screen.findByText("No customers yet")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search name or phone..."), "zzz");
    expect(await screen.findByText("No customers match these filters")).toBeInTheDocument();
    unmount();
    vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
    renderWithProviders(<CustomerList />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
