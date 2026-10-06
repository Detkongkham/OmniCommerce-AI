import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { Page, StockLevelDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StockLevels } from "./stock-levels";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const level = (patch: Partial<StockLevelDto> = {}): StockLevelDto => ({
  id: "s1", variantId: "v1", sku: "TEE-R", variantName: "Red", productName: "Tee", warehouseId: "w1", warehouseCode: "MAIN",
  onHand: 10, reserved: 3, available: 7, lowStockThreshold: null, isLow: false, ...patch,
});
const rows = [level(), level({ id: "s2", variantId: "v2", sku: "TEE-B", variantName: "Blue", onHand: 2, reserved: 0, available: 2, lowStockThreshold: 5, isLow: true })];

function mockApi(page: Page<StockLevelDto> = { items: rows, total: 2, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.startsWith("/stock")) return page;
    if (path === "/warehouses") return [{ id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true }];
    return {};
  }) as typeof apiFetch);
}
const stockUrls = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]).filter((path) => path.startsWith("/stock"));
const lastStockUrl = () => stockUrls().at(-1);

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("StockLevels", () => {
  it("ສະແດງ ສິນຄ້າ/SKU, ສາງ, ໃນສາງ, ຈອງ, ຂາຍໄດ້ ແລະ ປ້າຍ 'ໃກ້ໝົດ' ສະເພາະແຖວທີ່ isLow", async () => {
    renderWithProviders(<StockLevels initialQuery="" />);
    const first = await screen.findByTestId("row-stock-s1");
    expect(within(first).getByText("Tee — Red")).toBeInTheDocument();
    expect(within(first).getByText("TEE-R")).toBeInTheDocument();
    expect(within(first).getByText("MAIN")).toBeInTheDocument();
    expect(within(first).getByText("10")).toBeInTheDocument();
    expect(within(first).getByText("7")).toBeInTheDocument();
    expect(within(first).queryByText("Low")).toBeNull();
    expect(within(screen.getByTestId("row-stock-s2")).getByText("Low")).toBeInTheDocument();
  });

  it("initialQuery ຖືກໃຊ້ເປັນຄ່າຄົ້ນຫາເລີ່ມຕົ້ນ ແລະ ສົ່ງ q ໄປ API", async () => {
    renderWithProviders(<StockLevels initialQuery="TEE-R" />);
    await screen.findByTestId("row-stock-s1");
    expect(screen.getByPlaceholderText("Search SKU or product name...")).toHaveValue("TEE-R");
    expect(lastStockUrl()).toContain("q=TEE-R");
  });

  it("filter ສາງ ແລະ 'ສະເພາະໃກ້ໝົດ' ຖືກສົ່ງເປັນ query", async () => {
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByTestId("row-stock-s1");
    await user.selectOptions(await screen.findByLabelText("Warehouse"), "w1");
    await waitFor(() => expect(lastStockUrl()).toContain("warehouseId=w1"));
    await user.click(screen.getByRole("checkbox", { name: "Low stock only" }));
    await waitFor(() => expect(lastStockUrl()).toContain("lowStock=true"));
  });

  it("ປຸ່ມຕໍ່ແຖວ ເປີດ dialog ຕາມປະເພດ (receive/adjust/transfer/return) ແລະ ຕັ້ງເກນ", async () => {
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    const row = await screen.findByTestId("row-stock-s1");
    await user.click(within(row).getByRole("button", { name: "Adjust TEE-R" }));
    expect(await screen.findByText("Adjust stock")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(within(row).getByRole("button", { name: "Set low-stock level TEE-R" }));
    expect(await screen.findByLabelText("Low-stock level")).toBeInTheDocument();
  });

  it("ປຸ່ມ 'ຮັບສະຕ໋ອກ' ດ້ານເທິງ ເປີດ dialog ທີ່ມີ variant picker", async () => {
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByTestId("row-stock-s1");
    await user.click(screen.getByRole("button", { name: "Receive stock" }));
    expect(await screen.findByText("Receive stock into a warehouse")).toBeInTheDocument();
    expect(screen.getByLabelText("Item (variant)")).toBeInTheDocument();
  });

  it("ບໍ່ມີ inventory:write: ບໍ່ມີປຸ່ມຮັບສະຕ໋ອກ/ຕໍ່ແຖວ", async () => {
    auth.canWrite = false;
    renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByTestId("row-stock-s1");
    expect(screen.queryByRole("button", { name: "Receive stock" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Adjust/ })).toBeNull();
  });

  it("ວ່າງ: empty state ພ້ອມຄຳແນະນຳ; ມີ filter: ບໍ່ພົບ", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    expect(await screen.findByText("No stock yet")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search SKU or product name..."), "zzz");
    expect(await screen.findByText("No stock rows match your search")).toBeInTheDocument();
  });

  it("ຄົ້ນຫາ (debounce): ກັບໄປໜ້າ 1, ບໍ່ສົ່ງທຸກ keystroke; filter ກັບໄປໜ້າ 1", async () => {
    mockApi({ items: rows, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByTestId("row-stock-s1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastStockUrl()).toContain("page=2"));
    await user.type(screen.getByPlaceholderText("Search SKU or product name..."), "tee");
    await waitFor(() => expect(lastStockUrl()).toBe("/stock?q=tee&page=1&pageSize=10"));
    expect(stockUrls().some((url) => url.includes("q=t&") || url.includes("q=te&"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastStockUrl()).toContain("page=2"));
    await user.click(screen.getByRole("checkbox", { name: "Low stock only" }));
    await waitFor(() => expect(lastStockUrl()).toBe("/stock?q=tee&lowStock=true&page=1&pageSize=10"));
  });

  it("ກຳລັງໂຫຼດ: skeleton ບໍ່ສະແດງ empty state", () => {
    vi.mocked(apiFetch).mockImplementation((() => new Promise(() => {})) as typeof apiFetch);
    const { container } = renderWithProviders(<StockLevels initialQuery="" />);
    expect(container.querySelector(".oca-skeleton")).not.toBeNull();
    expect(screen.queryByText("No stock yet")).toBeNull();
  });

  it("ໂຫຼດບໍ່ສຳເລັດ: ສະແດງ error ແລະ Retry ດຶງໃໝ່", async () => {
    let fail = true;
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.startsWith("/stock")) {
        if (fail) throw new Error("boom");
        return { items: rows, total: 2, page: 1, pageSize: 10 };
      }
      return [];
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    expect(screen.queryByText("No stock yet")).toBeNull();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("row-stock-s1")).toBeInTheDocument();
  });

  it("ວ່າງ ແລະ ມີສະເພາະ filter ສາງ: 'ບໍ່ພົບ' ແລະ ປຸ່ມລ້າງ filter", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByText("No stock yet");
    await user.selectOptions(await screen.findByLabelText("Warehouse"), "w1");
    expect(await screen.findByText("No stock rows match your search")).toBeInTheDocument();
    expect(screen.queryByText("No stock yet")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByText("No stock yet")).toBeInTheDocument();
    expect(screen.getByLabelText("Warehouse")).toHaveValue("");
  });

  it("ບໍ່ມີ inventory:write ແລະ ວ່າງ: empty state ບໍ່ມີປຸ່ມຮັບສະຕ໋ອກ", async () => {
    auth.canWrite = false;
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    renderWithProviders(<StockLevels initialQuery="" />);
    expect(await screen.findByText("No stock yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Receive stock" })).toBeNull();
  });

  it("ໜ້າເກີນໜ້າສຸດທ້າຍ: ໂດດໄປໜ້າສຸດທ້າຍ ບໍ່ສະແດງ 'ຍັງບໍ່ມີສະຕ໋ອກ'", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path.startsWith("/stock")) {
        return path.includes("page=3")
          ? { items: [], total: 15, page: 3, pageSize: 10 }
          : { items: rows, total: 25, page: 1, pageSize: 10 };
      }
      return [];
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByTestId("row-stock-s1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastStockUrl()).toContain("page=2"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(stockUrls()).toContain("/stock?page=3&pageSize=10"));
    await waitFor(() => expect(lastStockUrl()).toBe("/stock?page=2&pageSize=10"));
    expect(screen.queryByText("No stock yet")).toBeNull();
  });

  it("table semantics: aria-label, scope=col, ສິນຄ້າ/SKU ເປັນ row header, ແລະ status ນັບຜົນ (sr-only)", async () => {
    renderWithProviders(<StockLevels initialQuery="" />);
    const first = await screen.findByTestId("row-stock-s1");
    const table = screen.getByRole("table", { name: "Stock levels" });
    expect(table).toHaveAttribute("aria-busy", "false");
    expect(within(table).getAllByRole("columnheader").every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(within(first).getByRole("rowheader")).toHaveTextContent("Tee — Red");
    expect(within(first).getByRole("rowheader")).toHaveTextContent("TEE-R");
    expect(screen.getByRole("status")).toHaveTextContent("2 stock lines found");
  });

  it("ກຳລັງໂຫຼດ: aria-busy=true ແລະ status ວ່າງ", () => {
    vi.mocked(apiFetch).mockImplementation((() => new Promise(() => {})) as typeof apiFetch);
    renderWithProviders(<StockLevels initialQuery="" />);
    expect(screen.getByRole("table", { name: "Stock levels" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("ວ່າງ: status ນັບຜົນວ່າງ ບໍ່ປະກາດຊ້ຳກັບ empty state", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByText("No stock yet");
    expect(screen.queryByText(/stock lines found/)).toBeNull();
  });
});
