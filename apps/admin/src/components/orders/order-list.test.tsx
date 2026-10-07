import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { OrderListItemDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderList } from "./order-list";

const auth = vi.hoisted(() => ({ canWrite: true, canInventory: true }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "inventory:read" ? auth.canInventory : auth.canWrite),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const items: OrderListItemDto[] = [
  { id: "o1", orderNumber: "SO-000001", status: "PENDING_PAYMENT", channel: "OFFLINE", source: "MANUAL", customer: { id: "c1", name: "Mali", phone: "02055550001" }, total: "195.00", itemCount: 2, reservedUntil: null, createdAt: "2026-10-05T05:30:00.000Z" },
  { id: "o2", orderNumber: "SO-000002", status: "PAID", channel: "FACEBOOK", source: "MANUAL", customer: null, total: "1250000.50", itemCount: 1, reservedUntil: null, createdAt: "2026-10-04T18:00:00.000Z" },
];

function mockApi(page: Page<OrderListItemDto> = { items, total: 2, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async () => page) as typeof apiFetch);
}
const urls = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]);
const lastUrl = () => urls().at(-1);
const SEARCH = "Search order no., name or phone...";

beforeEach(() => {
  auth.canWrite = true;
  auth.canInventory = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("OrderList", () => {
  it("ສະແດງເລກບິນ (ລິ້ງ ໃນ row header), ລູກຄ້າ/ລູກຄ້າໜ້າຮ້ານ, ຊ່ອງທາງ, ສະຖານະ, ຍອດ (comma) ແລະ ເວລາລາວ", async () => {
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    const first = await screen.findByTestId("row-order-o1");
    expect(within(first).getByRole("rowheader", { name: /SO-000001/ })).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "SO-000001" })).toHaveAttribute("href", "/orders/o1");
    expect(within(first).getByText("Mali")).toBeInTheDocument();
    expect(within(first).getByText("In store")).toBeInTheDocument();
    expect(within(first).getByText("Awaiting payment")).toBeInTheDocument();
    expect(within(first).getByText("195.00")).toBeInTheDocument();
    expect(within(first).getByText("05/10/2026 12:30")).toBeInTheDocument();
    const second = screen.getByTestId("row-order-o2");
    expect(within(second).getByText("Walk-in customer")).toBeInTheDocument();
    expect(within(second).getByText("1,250,000.50")).toBeInTheDocument();
    expect(within(second).getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("2 orders")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Orders" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("2 orders found");
  });

  it("ຄ່າເລີ່ມຕົ້ນຈາກ URL (q, status) ຖືກສົ່ງໃນ request ທຳອິດ", async () => {
    renderWithProviders(<OrderList initialQuery="mali" initialStatus="PAID" />);
    await screen.findByTestId("row-order-o1");
    expect(urls()[0]).toBe("/orders?q=mali&status=PAID&page=1&pageSize=10");
    expect(screen.getByLabelText("Status")).toHaveValue("PAID");
  });

  it("filter ສະຖານະ/ຄົ້ນຫາ/ວັນທີ ຖືກສົ່ງ (ວັນທີ date-only ດິບ) ແລະ ປ່ຽນ filter ກັບໄປໜ້າ 1", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toContain("page=2"));
    await user.selectOptions(screen.getByLabelText("Status"), "PAID");
    await waitFor(() => expect(lastUrl()).toBe("/orders?status=PAID&page=1&pageSize=10"));
    await user.type(screen.getByPlaceholderText(SEARCH), "mali");
    await waitFor(() => expect(lastUrl()).toBe("/orders?q=mali&status=PAID&page=1&pageSize=10"));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-05" } });
    await waitFor(() => expect(lastUrl()).toBe("/orders?q=mali&status=PAID&from=2026-10-01&to=2026-10-05&page=1&pageSize=10"));
  });

  it("ຄົ້ນຫາ debounce: ເປັນໜ້າ 2 ແລ້ວພິມ q ບໍ່ມີ request (q ເກົ່າ, page 1) ແລະ ໄປໜ້າ 1 ພ້ອມ q ໃໝ່", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toContain("page=2"));
    await user.type(screen.getByPlaceholderText(SEARCH), "mali");
    await waitFor(() => expect(lastUrl()).toBe("/orders?q=mali&page=1&pageSize=10"));
    // ບໍ່ເຄີຍຍິງ (q ໃໝ່, ໜ້າ 2) ຫຼື (q ເກົ່າ, ໜ້າ 1 ຫຼັງຈາກໜ້າ 2): ມີ page=1 ພຽງຄັ້ງທຳອິດ + ຄັ້ງ q ໃໝ່
    expect(urls().filter((url) => url.includes("q=mali") && url.includes("page=2"))).toHaveLength(0);
    expect(urls().filter((url) => url === "/orders?page=1&pageSize=10")).toHaveLength(1);
  });

  it("ວັນທີເລີ່ມຫຼັງວັນທີສິ້ນສຸດ: ສະແດງ alert, ບໍ່ສົ່ງ request ໃໝ່, aria-invalid ຊີ້ໄປ alert", async () => {
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-09" } });
    await waitFor(() => expect(lastUrl()).toBe("/orders?from=2026-10-09&page=1&pageSize=10"));
    const validUrls = [...urls()];
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-01" } });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The start date must not be after the end date");
    expect(urls()).toEqual(validUrls);
    const from = screen.getByLabelText("From date");
    expect(from).toHaveAttribute("aria-invalid", "true");
    expect(from.getAttribute("aria-describedby")).toBe(alert.id);
    expect(screen.getByLabelText("To date").getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("ວັນທີດ້ານດຽວ (ສະເພາະ from): ຖືກຕ້ອງ ສົ່ງ from ຢ່າງດຽວ ບໍ່ມີ alert", async () => {
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(lastUrl()).toBe("/orders?from=2026-10-01&page=1&pageSize=10"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("from ເທົ່າ to ຖືກຕ້ອງ: ບໍ່ມີ alert ແລະ ສົ່ງທັງສອງວັນທີ", async () => {
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-05" } });
    await waitFor(() => expect(lastUrl()).toBe("/orders?from=2026-10-05&to=2026-10-05&page=1&pageSize=10"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ປີ 5 ຫຼັກ ຖືວ່າຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ ແລະ ບໍ່ສົ່ງ request", async () => {
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    const before = urls().length;
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "12026-10-01" } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(urls()).toHaveLength(before);
  });

  it("ປຸ່ມ 'ສ້າງບິນ' ເປັນລິ້ງໄປ /orders/new ສະເພາະຜູ້ທີ່ມີ orders:write", async () => {
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    expect(screen.getByRole("link", { name: "Create order" })).toHaveAttribute("href", "/orders/new");
  });

  it("ບໍ່ມີ orders:write: ບໍ່ມີປຸ່ມສ້າງບິນ", async () => {
    auth.canWrite = false;
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    expect(screen.queryByRole("link", { name: "Create order" })).toBeNull();
  });

  it("ມີ orders:write ແຕ່ບໍ່ມີ inventory:read: ບໍ່ມີປຸ່ມສ້າງບິນ (ຟອມຈະ 403 ຕອນໂຫຼດ)", async () => {
    auth.canInventory = false;
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    expect(screen.queryByRole("link", { name: "Create order" })).toBeNull();
  });

  it("ວ່າງ ບໍ່ມີ filter: empty state ພ້ອມປຸ່ມສ້າງບິນ", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Create order" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Create order" })).toHaveAttribute("href", "/orders/new");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("ວ່າງ ມີ filter: 'ບໍ່ພົບ' ແລະ ລ້າງ filter ມີຜົນທັນທີ (ບໍ່ລໍ debounce)", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<OrderList initialQuery="" initialStatus="PAID" />);
    expect(await screen.findByText("No orders match your search")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(SEARCH), "zzz");
    await waitFor(() => expect(lastUrl()).toContain("q=zzz"));
    vi.mocked(apiFetch).mockClear();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByPlaceholderText(SEARCH)).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("");
    await waitFor(() => expect(lastUrl()).toBe("/orders?page=1&pageSize=10"));
    expect(urls().every((url) => !url.includes("q=") && !url.includes("status="))).toBe(true);
  });

  it("ປ່ຽນໜ້າ: ສົ່ງ page=2", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toContain("page=2"));
  });

  it("ໜ້າເກີນຂອບເຂດ (ຂໍ້ມູນຫຼຸດລົງ): ກັບໄປໜ້າສຸດທ້າຍທີ່ມີ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.includes("page=3")) return { items: [], total: 15, page: 3, pageSize: 10 };
      return { items, total: 25, page: 1, pageSize: 10 };
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    await screen.findByTestId("row-order-o1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastUrl()).toContain("page=2"));
    expect(urls().some((url) => url.includes("page=3"))).toBe(true);
  });

  it("ຂໍ້ຜິດພາດ: ສະແດງ error ແລະ ປຸ່ມ Retry ຍິງໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    const { user } = renderWithProviders(<OrderList initialQuery="" initialStatus="" />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    vi.mocked(apiFetch).mockClear();
    mockApi();
    await user.click(retry);
    expect(await screen.findByTestId("row-order-o1")).toBeInTheDocument();
    expect(urls().length).toBeGreaterThan(0);
  });
});
