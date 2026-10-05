import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { VariantPicker } from "./variant-picker";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const found: VariantSearchItemDto = {
  id: "v1",
  sku: "TEE-R",
  barcode: null,
  name: "Red",
  productId: "p1",
  productName: "Tee",
  productStatus: "ACTIVE",
  imageUrl: null,
  price: "100.00",
  isActive: true,
  availableTotal: 7,
  stock: [],
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ items: [found], total: 1, page: 1, pageSize: 8 });
});

describe("VariantPicker", () => {
  it("ພິມຄົ້ນຫາ (debounce) ແລ້ວສະແດງຜົນ: ຊື່ສິນຄ້າ, variant, SKU, ລາຄາ, ຂາຍໄດ້", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item (variant)" onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item (variant)"), "tee");
    expect(await screen.findByRole("option", { name: /Tee/ })).toBeInTheDocument();
    const option = screen.getByRole("option", { name: /TEE-R/ });
    expect(option).toHaveTextContent("Red");
    expect(option).toHaveTextContent("100.00");
    expect(option).toHaveTextContent("Available 7");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/variants?q=tee&page=1&pageSize=8"));
  });

  it("includeInactive ຖືກສົ່ງຕໍ່ໃຫ້ API", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" includeInactive onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "t");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/variants?q=t&includeInactive=true&page=1&pageSize=8"));
  });

  it("ເລືອກຜົນ: ເອີ້ນ onSelect ແລະ ລ້າງຜົນ", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={onSelect} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
    expect(onSelect).toHaveBeenCalledWith(found);
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByLabelText("Item")).toHaveValue("");
  });

  it("ບໍ່ພົບ: ສະແດງ 'ບໍ່ພົບ variant'; excludeIds ຕັດຜົນທີ່ເລືອກແລ້ວ", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" excludeIds={["v1"]} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    expect(await screen.findByText("No variants found")).toBeInTheDocument();
  });
});
