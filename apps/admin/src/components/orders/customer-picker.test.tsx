import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CustomerDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CustomerPicker } from "./customer-picker";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const mali: CustomerDto = { id: "c1", name: "Mali", phone: "02055550001", email: null };
const somchai: CustomerDto = { id: "c2", name: "Somchai", phone: null, email: "s@example.com" };

/** wrapper ທີ່ຖື value ຈິງ ເຫມືອນຟອມບິນ (onSelect ປ່ຽນ value ແລ້ວ input/card ສະຫຼັບກັນ) */
function Stateful() {
  const [value, setValue] = useState<CustomerDto | null>(null);
  return <CustomerPicker value={value} onSelect={setValue} />;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ items: [mali], total: 1, page: 1, pageSize: 8 });
});

describe("CustomerPicker", () => {
  it("ຄົ້ນຫາ (debounce) → ສະແດງຊື່ + ໂທ → ເລືອກແລ້ວ onSelect + ລ້າງ input", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={onSelect} />);
    const input = screen.getByLabelText("Search name or phone");
    await user.type(input, "020");
    const option = await screen.findByRole("option", { name: /Mali/ });
    expect(option).toHaveTextContent("02055550001");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/customers?q=020&page=1&pageSize=8"));
    await user.click(option);
    expect(onSelect).toHaveBeenCalledWith(mali);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("ບໍ່ມີເບີໂທ: ສະແດງອີເມວແທນ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [somchai], total: 1, page: 1, pageSize: 8 });
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Search name or phone"), "som");
    expect(await screen.findByRole("option", { name: /Somchai/ })).toHaveTextContent("s@example.com");
  });

  it("ບໍ່ມີຜົນ: ສະແດງ status 'No customers found' ນອກ listbox", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 8 });
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Search name or phone"), "zzz");
    expect(await screen.findByRole("status")).toHaveTextContent("No customers found");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ARIA combobox: role, aria-expanded, aria-controls, aria-autocomplete", async () => {
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Search name or phone" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    await user.type(input, "020");
    const listbox = await screen.findByRole("listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
  });

  it("ລາຍການຖືກເຊື່ອງກ່ອນ debounce ສຳເລັດ", async () => {
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Search name or phone"), "020");
    expect(screen.queryByRole("option")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(await screen.findByRole("option")).toBeInTheDocument();
  });

  it("disabled: input ປິດ ແລະ ບໍ່ຍິງ API", () => {
    renderWithProviders(<CustomerPicker value={null} disabled onSelect={vi.fn()} />);
    expect(screen.getByLabelText("Search name or phone")).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("keyboard: ArrowDown ເລືອກ active, Enter ເລືອກ, focus ຄືນ input", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={onSelect} />);
    const input = screen.getByLabelText("Search name or phone");
    await user.type(input, "020");
    const option = await screen.findByRole("option", { name: /Mali/ });
    await user.keyboard("{ArrowDown}");
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(mali);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("keyboard: ArrowUp ວົນໄປຕົວສຸດທ້າຍ; Escape ປິດລາຍການ ແລະ ເປີດຄືນເມື່ອພິມຕໍ່", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [mali, somchai], total: 2, page: 1, pageSize: 8 });
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    const input = screen.getByLabelText("Search name or phone");
    await user.type(input, "0");
    const options = await screen.findAllByRole("option");
    await user.keyboard("{ArrowUp}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).toBeNull();
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.type(input, "2");
    expect((await screen.findAllByRole("option")).length).toBe(2);
  });

  it("ປິດເມື່ອ blur", async () => {
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Search name or phone"), "020");
    await screen.findByRole("option");
    fireEvent.blur(screen.getByRole("combobox"));
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("error: ສະແດງຂໍ້ຄວາມຜິດພາດ (role=alert)", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "boom"));
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Search name or phone"), "020");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not search customers");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape ຕອນລາຍການເປີດ ບໍ່ລາມໄປຫາ listener ຂອງ document (capture) ເຊັ່ນ dialog", async () => {
    const onDocKey = vi.fn();
    document.addEventListener("keydown", onDocKey, true);
    try {
      const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
      await user.type(screen.getByLabelText("Search name or phone"), "020");
      await screen.findByRole("option");
      onDocKey.mockClear();
      await user.keyboard("{Escape}");
      expect(onDocKey).not.toHaveBeenCalled();
      expect(screen.queryByRole("option")).toBeNull();
      onDocKey.mockClear();
      await user.keyboard("{Escape}");
      expect(onDocKey).toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", onDocKey, true);
    }
  });

  it("ເລືອກແລ້ວ (value): ສະແດງລູກຄ້າ ແລະ ປຸ່ມປ່ຽນ → onSelect(null)", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<CustomerPicker value={mali} onSelect={onSelect} />);
    expect(screen.getByText("Mali")).toBeInTheDocument();
    expect(screen.getByText("02055550001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Change/ }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("ເລືອກແລ້ວ (value) ບໍ່ມີເບີໂທ: ສະແດງອີເມວ; disabled ປິດປຸ່ມປ່ຽນ", () => {
    renderWithProviders(<CustomerPicker value={somchai} disabled onSelect={vi.fn()} />);
    expect(screen.getByText("s@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change/ })).toBeDisabled();
  });

  it("focus: ກົດປ່ຽນ → focus ໄປ input; ເລືອກລູກຄ້າ → focus ໄປປຸ່ມປ່ຽນ; ຂໍ້ຄວາມເກົ່າຖືກລ້າງ", async () => {
    const { user } = renderWithProviders(<Stateful />);
    await user.type(screen.getByLabelText("Search name or phone"), "020");
    await user.click(await screen.findByRole("option", { name: /Mali/ }));
    const change = screen.getByRole("button", { name: /Change/ });
    expect(change).toHaveFocus();
    await user.click(change);
    const input = screen.getByLabelText("Search name or phone");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("ບັດທີ່ເລືອກແລ້ວ: group ມີຊື່, ປຸ່ມປ່ຽນມີຊື່ລູກຄ້າ", () => {
    renderWithProviders(<CustomerPicker value={mali} onSelect={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Mali" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change customer: Mali" })).toHaveTextContent("Change");
  });

  it("phone ເປັນສະຕຣິງວ່າງ: ໃຊ້ອີເມວແທນ (ທັງບັດ ແລະ ລາຍການ)", async () => {
    const blank: CustomerDto = { id: "c3", name: "Noi", phone: "", email: "noi@example.com" };
    vi.mocked(apiFetch).mockResolvedValue({ items: [blank], total: 1, page: 1, pageSize: 8 });
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Search name or phone"), "noi");
    expect(await screen.findByRole("option", { name: /Noi/ })).toHaveTextContent("noi@example.com");
    renderWithProviders(<CustomerPicker value={blank} onSelect={vi.fn()} />);
    expect(screen.getAllByText("noi@example.com").length).toBeGreaterThan(1);
  });

  it("ຕອນສະແດງບັດ: Escape ບໍ່ຖືກດັກ (ບໍ່ມີ listener capture)", async () => {
    const onDocKey = vi.fn();
    document.addEventListener("keydown", onDocKey, true);
    try {
      const { user } = renderWithProviders(<CustomerPicker value={mali} onSelect={vi.fn()} />);
      await user.keyboard("{Escape}");
      expect(onDocKey).toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", onDocKey, true);
    }
  });

  it("Enter ໃນຊ່ອງຄົ້ນຫາບໍ່ submit form ທີ່ຫໍ່ຢູ່ (ເຄື່ອງສະແກນບາໂຄດສົ່ງ Enter) ບໍ່ວ່າລາຍການຍັງບໍ່ເປີດ ຫຼື ບໍ່ມີຕົວເລືອກທີ່ເນັ້ນ", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const { user } = renderWithProviders(
      <form onSubmit={onSubmit}>
        <CustomerPicker value={null} onSelect={vi.fn()} />
        <button type="submit">go</button>
      </form>,
    );
    const input = screen.getByLabelText("Search name or phone");
    // ກ່ອນ debounce ຄົບ (ລາຍການຍັງບໍ່ເປີດ)
    await user.type(input, "tee{Enter}");
    // ລາຍການເປີດແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ເນັ້ນຕົວເລືອກ (activeIndex -1)
    await screen.findByRole("option");
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("IME: Enter/ArrowDown ຕອນກຳລັງພິມດ້ວຍ IME (isComposing ຫຼື keyCode 229) ບໍ່ເລືອກຕົວເລືອກ ແລະ ບໍ່ preventDefault; ຈົບ composition ແລ້ວ Enter ເລືອກຕາມປົກກະຕິ", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<CustomerPicker value={null} onSelect={onSelect} />);
    const input = screen.getByLabelText("Search name or phone");
    await user.type(input, "020");
    const option = await screen.findByRole("option", { name: /Mali/ });
    await user.keyboard("{ArrowDown}");
    expect(option).toHaveAttribute("aria-selected", "true");
    // Enter ທີ່ຢືນຢັນ composition: ປ່ອຍໃຫ້ IME ຈັດການ
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    // ລູກສອນຕອນ composing ຕ້ອງບໍ່ຍ້າຍ active
    expect(fireEvent.keyDown(input, { key: "ArrowDown", isComposing: true })).toBe(true);
    expect(option).toHaveAttribute("aria-selected", "true");
    // ຈົບ composition ແລ້ວ Enter ເລືອກປົກກະຕິ
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(mali);
  });
});
