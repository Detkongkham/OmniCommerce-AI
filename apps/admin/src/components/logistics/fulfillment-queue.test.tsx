import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { FulfillmentListItemDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { FulfillmentQueue } from "./fulfillment-queue";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => true }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const ROWS: FulfillmentListItemDto[] = [
  { id: "o1", orderNumber: "SO-000001", status: "PAID", customer: { name: "Noy", phone: "020555" }, itemCount: 3, paidAt: "2026-10-08T02:00:00.000Z", hasShippingInfo: false, verified: false },
  { id: "o2", orderNumber: "SO-000002", status: "PACKING", customer: null, itemCount: 1, paidAt: "2026-10-08T03:00:00.000Z", hasShippingInfo: true, verified: true },
];
const page = (items: FulfillmentListItemDto[]): Page<FulfillmentListItemDto> => ({ items, total: items.length, page: 1, pageSize: 30 });

function mockApi(rows = ROWS) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === "/warehouses") return [{ id: "w1", code: "A", name: "Main" }];
    if (path.includes("q=SO-000002")) return page([ROWS[1] as FulfillmentListItemDto]);
    if (path.includes("q=SO-404")) return page([]);
    return page(rows);
  }) as typeof apiFetch);
}

beforeEach(() => {
  router.push.mockReset();
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("FulfillmentQueue", () => {
  it("ຕາຕະລາງ: ລິ້ງໄປໜ້າແພັກ, ລູກຄ້າ, ຊິ້ນ, ສະຖານະ, ປ້າຍບໍ່ມີທີ່ຢູ່/ກວດຄົບ", async () => {
    renderWithProviders(<FulfillmentQueue />);
    const link = await screen.findByRole("link", { name: "SO-000001" });
    expect(link).toHaveAttribute("href", "/fulfillment/o1");
    const first = screen.getByTestId("row-fulfillment-o1");
    expect(within(first).getByText("Noy")).toBeInTheDocument();
    expect(within(first).getByText("No address")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-fulfillment-o2")).getByText("Verified")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/fulfillment?page=1&pageSize=30");
  });

  it("ກອງສະຖານະ ແລະ ສາງ → query", async () => {
    const { user } = renderWithProviders(<FulfillmentQueue />);
    await screen.findByRole("link", { name: "SO-000001" });
    await user.selectOptions(screen.getByLabelText("Filter by status"), "PACKING");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/fulfillment?status=PACKING&page=1&pageSize=30"));
    await user.selectOptions(await screen.findByLabelText("Filter by warehouse"), "w1");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/fulfillment?status=PACKING&warehouseId=w1&page=1&pageSize=30"));
  });

  it("ຍິງເລກບິນແລ້ວ Enter: ພົບ → ໄປໜ້າແພັກ; ບໍ່ພົບ → ແຈ້ງ", async () => {
    const { user } = renderWithProviders(<FulfillmentQueue />);
    await screen.findByRole("link", { name: "SO-000001" });
    const search = screen.getByRole("searchbox", { name: "Search or scan an order number…" });
    await user.type(search, "so-000002{Enter}");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/fulfillment/o2"));
    await user.clear(search);
    await user.type(search, "SO-404{Enter}");
    expect(await screen.findByText("Order SO-404 is not in the packing queue")).toBeInTheDocument();
  });

  it("ເລືອກບິນ → ລິ້ງພິມໃບປະໜ້າ (ແທັບໃໝ່) ພ້ອມ ids", async () => {
    const { user } = renderWithProviders(<FulfillmentQueue />);
    await screen.findByRole("link", { name: "SO-000001" });
    expect(screen.queryByRole("link", { name: /Print labels/ })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Select order SO-000001" }));
    await user.click(screen.getByRole("checkbox", { name: "Select order SO-000002" }));
    const print = screen.getByRole("link", { name: "Print labels (2)" });
    expect(print).toHaveAttribute("href", "/fulfillment/labels?ids=o1,o2");
    expect(print).toHaveAttribute("target", "_blank");
    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.queryByRole("link", { name: /Print labels/ })).toBeNull();
  });

  it("ວ່າງ → empty; error → Retry", async () => {
    mockApi([]);
    const { unmount } = renderWithProviders(<FulfillmentQueue />);
    expect(await screen.findByText("No orders to pack")).toBeInTheDocument();
    unmount();
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "x", [], "INTERNAL_ERROR"));
    renderWithProviders(<FulfillmentQueue />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
