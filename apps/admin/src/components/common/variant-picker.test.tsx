import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
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

  it("ARIA combobox: role, aria-expanded, aria-controls, aria-autocomplete", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Item" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    await user.type(input, "tee");
    const listbox = await screen.findByRole("listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
  });

  it("ບໍ່ມີຜົນ (items ເປົ່າ): ສະແດງ status 'No variants found' ນອກ listbox", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 8 });
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "zzz");
    expect(await screen.findByRole("status")).toHaveTextContent("No variants found");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ລາຍການຖືກເຊື່ອງກ່ອນ debounce ສຳເລັດ", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    expect(screen.queryByRole("option")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(await screen.findByRole("option")).toBeInTheDocument();
  });

  it("disabled: input ປິດ ແລະ ບໍ່ຍິງ API", () => {
    renderWithProviders(<VariantPicker id="vp" label="Item" disabled onSelect={vi.fn()} />);
    expect(screen.getByLabelText("Item")).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("keyboard: ArrowDown ເລືອກ active, Enter ເລືອກ, focus ຄືນ input", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={onSelect} />);
    const input = screen.getByLabelText("Item");
    await user.type(input, "tee");
    const option = await screen.findByRole("option", { name: /TEE-R/ });
    await user.keyboard("{ArrowDown}");
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(found);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("keyboard: ArrowUp ວົນໄປຕົວສຸດທ້າຍ; Escape ປິດລາຍການ ແລະ ເປີດຄືນເມື່ອພິມຕໍ່", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={vi.fn()} />);
    const input = screen.getByLabelText("Item");
    await user.type(input, "tee");
    const option = await screen.findByRole("option");
    await user.keyboard("{ArrowUp}");
    expect(option).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).toBeNull();
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.type(input, "e");
    expect(await screen.findByRole("option")).toBeInTheDocument();
  });

  it("ປິດເມື່ອ blur", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    await screen.findByRole("option");
    fireEvent.blur(screen.getByRole("combobox"));
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("ຄລິກ option ດ້ວຍ mouse ເລືອກໄດ້ (mousedown) ແລະ focus ຄືນ input", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={onSelect} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    await user.click(await screen.findByRole("option"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Item")).toHaveFocus();
  });

  it("excludeIds: pageSize = 8 + ຈຳນວນທີ່ຕັດ", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" excludeIds={["v1"]} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/variants?q=tee&page=1&pageSize=9"));
  });

  it("error: ສະແດງຂໍ້ຄວາມຜິດພາດ (role=alert)", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "boom"));
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not search variants");
  });

  it("Escape ຕອນລາຍການເປີດ ບໍ່ລາມໄປຫາ listener ຂອງ document (capture) ເຊັ່ນ dialog", async () => {
    const onDocKey = vi.fn();
    document.addEventListener("keydown", onDocKey, true);
    try {
      const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={vi.fn()} />);
      await user.type(screen.getByLabelText("Item"), "tee");
      await screen.findByRole("option");
      onDocKey.mockClear();
      await user.keyboard("{Escape}");
      expect(onDocKey).not.toHaveBeenCalled();
      expect(screen.queryByRole("option")).toBeNull();
      onDocKey.mockClear();
      await user.keyboard("{Escape}"); // ລາຍການປິດແລ້ວ: Escape ຜ່ານໄປຕາມປົກກະຕິ
      expect(onDocKey).toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", onDocKey, true);
    }
  });

  it("Enter ໃນຊ່ອງຄົ້ນຫາບໍ່ submit form ທີ່ຫໍ່ຢູ່ (ເຄື່ອງສະແກນບາໂຄດສົ່ງ Enter) ບໍ່ວ່າລາຍການຍັງບໍ່ເປີດ ຫຼື ບໍ່ມີຕົວເລືອກທີ່ເນັ້ນ", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const { user } = renderWithProviders(
      <form onSubmit={onSubmit}>
        <VariantPicker id="vp" label="Item (variant)" onSelect={vi.fn()} />
        <button type="submit">go</button>
      </form>,
    );
    const input = screen.getByLabelText("Item (variant)");
    // ກ່ອນ debounce ຄົບ (ລາຍການຍັງບໍ່ເປີດ)
    await user.type(input, "tee{Enter}");
    // ລາຍການເປີດແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ເນັ້ນຕົວເລືອກ (activeIndex -1)
    await screen.findByRole("option");
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
