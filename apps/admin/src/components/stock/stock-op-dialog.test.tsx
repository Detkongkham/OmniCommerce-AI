import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { StockOpDialog } from "./stock-op-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const warehouses = [
  { id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true },
  { id: "w2", code: "B2", name: "Branch 2", address: null, isDefault: false, isActive: true },
  { id: "w3", code: "OLD", name: "Old", address: null, isDefault: false, isActive: false },
];
const target = { variantId: "v1", label: "Tee — Red (TEE-R)", warehouseId: "w1" };

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === "/warehouses") return warehouses;
    return {};
  }) as typeof apiFetch);
});

const posted = () => vi.mocked(apiFetch).mock.calls.find((call) => call[0].startsWith("/stock/"));

describe("StockOpDialog", () => {
  it("receive: ສາງ (ສະເພາະທີ່ເປີດ) + ຈຳນວນ + ໝາຍເຫດ → POST /stock/receive", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={onOpenChange} mode="receive" target={target} />);
    expect(screen.getByText("Tee — Red (TEE-R)")).toBeInTheDocument();
    const select = await screen.findByLabelText("Warehouse");
    await waitFor(() => expect(screen.getByRole("option", { name: "MAIN — Main" })).toBeInTheDocument());
    expect(screen.queryByRole("option", { name: /OLD/ })).toBeNull();
    expect(select).toHaveValue("w1");
    await user.type(screen.getByLabelText("Quantity"), "12");
    await user.type(screen.getByLabelText("Note"), "PO-1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/receive", { method: "POST", body: { variantId: "v1", warehouseId: "w1", quantity: 12, note: "PO-1" } }]),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("adjust: ຕ້ອງມີເຫດຜົນ ແລະ ຄ່າປ່ຽນແປງ ≠ 0; ລົບໄດ້", async () => {
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={vi.fn()} mode="adjust" target={target} />);
    await screen.findByLabelText("Warehouse");
    await user.type(screen.getByLabelText("Change (+/−)"), "-3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument(); // ຂາດເຫດຜົນ
    expect(posted()).toBeUndefined();

    await user.type(screen.getByLabelText("Reason"), "damaged");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/adjust", { method: "POST", body: { variantId: "v1", warehouseId: "w1", delta: -3, note: "damaged" } }]),
    );
  });

  it("transfer: ຈາກ/ໄປ ຕ້ອງຕ່າງກັນ; ສົ່ງ fromWarehouseId/toWarehouseId", async () => {
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={vi.fn()} mode="transfer" target={target} />);
    await screen.findByLabelText("From warehouse");
    await user.type(screen.getByLabelText("Quantity"), "2");
    await user.selectOptions(screen.getByLabelText("To warehouse"), "w1"); // ຊ້ຳກັບຕົ້ນທາງ
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(posted()).toBeUndefined();

    await user.selectOptions(screen.getByLabelText("To warehouse"), "w2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/transfer", { method: "POST", body: { variantId: "v1", fromWarehouseId: "w1", toWarehouseId: "w2", quantity: 2 } }]),
    );
  });

  it("return: POST /stock/return", async () => {
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={vi.fn()} mode="return" target={target} />);
    await screen.findByLabelText("Warehouse");
    await user.type(screen.getByLabelText("Quantity"), "1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/return", { method: "POST", body: { variantId: "v1", warehouseId: "w1", quantity: 1 } }]),
    );
  });

  it("INSUFFICIENT_STOCK: ສະແດງຂໍ້ຄວາມແປ + ລາຍການ shortages ແລະ dialog ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path === "/warehouses") return warehouses;
      throw new ApiError(409, "x", [], "INSUFFICIENT_STOCK", {
        shortages: [{ variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 9, available: 2 }],
      });
    }) as typeof apiFetch);
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={onOpenChange} mode="adjust" target={target} />);
    await screen.findByLabelText("Warehouse");
    await user.type(screen.getByLabelText("Change (+/−)"), "-9");
    await user.type(screen.getByLabelText("Reason"), "x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not enough stock");
    expect(alert).toHaveTextContent("TEE-R: needs 9 but only 2 available");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("receive ໂດຍບໍ່ມີ target: ມີ VariantPicker (includeInactive) ໃຫ້ເລືອກ variant ກ່ອນ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path === "/warehouses") return warehouses;
      if (path.startsWith("/variants")) {
        return { items: [{ id: "v9", sku: "NEW-1", barcode: null, name: null, productId: "p9", productName: "New", productStatus: "DRAFT", imageUrl: null, price: "1.00", isActive: true, availableTotal: 0, stock: [] }], total: 1, page: 1, pageSize: 8 };
      }
      return {};
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={vi.fn()} mode="receive" target={null} />);
    await user.type(screen.getByLabelText("Item (variant)"), "new");
    await user.click(await screen.findByRole("option", { name: /NEW-1/ }));
    expect(screen.getByText(/NEW-1/)).toBeInTheDocument();
    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some((call) => call[0] === "/variants?q=new&includeInactive=true&page=1&pageSize=8")).toBe(true),
    );
    await user.selectOptions(await screen.findByLabelText("Warehouse"), "w1");
    await user.type(screen.getByLabelText("Quantity"), "5");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/receive", { method: "POST", body: { variantId: "v9", warehouseId: "w1", quantity: 5 } }]),
    );
  });

  it("Escape ໃນ picker ປິດສະເພາະລາຍການ, dialog ຍັງເປີດ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path === "/warehouses") return warehouses;
      if (path.startsWith("/variants")) {
        return { items: [{ id: "v9", sku: "NEW-1", barcode: null, name: null, productId: "p9", productName: "New", productStatus: "DRAFT", imageUrl: null, price: "1.00", isActive: true, availableTotal: 0, stock: [] }], total: 1, page: 1, pageSize: 8 };
      }
      return {};
    }) as typeof apiFetch);
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={onOpenChange} mode="receive" target={null} />);
    await user.type(screen.getByLabelText("Item (variant)"), "new");
    await screen.findByRole("option", { name: /NEW-1/ });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Item (variant)")).toHaveAttribute("aria-expanded", "false");
  });
});
