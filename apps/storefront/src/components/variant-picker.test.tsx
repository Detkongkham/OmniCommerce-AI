import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StoreProductDetail, StoreVariant } from "@/lib/types";
import { VariantPicker } from "./variant-picker";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const variant = (id: string, optionValues: Record<string, string>, patch: Partial<StoreVariant> = {}): StoreVariant => ({
  id,
  name: Object.values(optionValues).join(" / ") || null,
  price: "100000.00",
  compareAtPrice: null,
  optionValues,
  saleEndsAt: null,
  stock: { status: "IN_STOCK", remaining: null },
  ...patch,
});

const tee: Pick<StoreProductDetail, "name" | "options" | "variants"> = {
  name: "ເສື້ອ",
  options: [
    { name: "ສີ", values: ["ດຳ", "ຂາວ"] },
    { name: "ໄຊສ໌", values: ["M", "L"] },
  ],
  variants: [
    variant("bm", { ສີ: "ດຳ", ໄຊສ໌: "M" }, { stock: { status: "OUT", remaining: null } }),
    variant("bl", { ສີ: "ດຳ", ໄຊສ໌: "L" }, { price: "120000.00", compareAtPrice: "150000.00" }),
    variant("wm", { ສີ: "ຂາວ", ໄຊສ໌: "M" }, { stock: { status: "LOW", remaining: 3 } }),
  ],
};

const group = (name: string) => screen.getByRole("group", { name });
const option = (groupName: string, value: string) => within(group(groupName)).getByRole("button", { name: value });

describe("VariantPicker", () => {
  it("ເລີ່ມດ້ວຍ variant ທຳອິດທີ່ມີຂອງ: ລາຄາ, ລາຄາເດີມ, ສະຖານະ ແລະ ປຸ່ມທີ່ຖືກເລືອກ", () => {
    render(<VariantPicker product={tee} />);
    expect(screen.getByText("120,000 ກີບ")).toBeInTheDocument();
    expect(screen.getByText("150,000 ກີບ").tagName).toBe("S");
    expect(screen.getByText("ມີສິນຄ້າ")).toBeInTheDocument();
    expect(option("ສີ", "ດຳ")).toHaveAttribute("aria-pressed", "true");
    expect(option("ໄຊສ໌", "L")).toHaveAttribute("aria-pressed", "true");
    expect(option("ໄຊສ໌", "M")).toHaveAttribute("aria-pressed", "false");
  });

  it("ກົດຕົວເລືອກ → ລາຄາ ແລະ ສະຖານະສະຕ໋ອກປ່ຽນຕາມ variant", async () => {
    const user = userEvent.setup();
    render(<VariantPicker product={tee} />);
    await user.click(option("ໄຊສ໌", "M"));
    expect(screen.getByText("100,000 ກີບ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ສິນຄ້າໝົດ" })).toBeDisabled();
    await user.click(option("ສີ", "ຂາວ"));
    expect(screen.getByText("ເຫຼືອ 3 ອັນ")).toBeInTheDocument();
  });

  it("ກົດຄ່າທີ່ບໍ່ມີຄູ່ກັບຕົວເລືອກທີ່ເລືອກຢູ່ → ຍ້າຍໄປຄູ່ທີ່ມີຂາຍ (ບໍ່ຄ້າງຢູ່ຄູ່ທີ່ບໍ່ມີ)", async () => {
    const user = userEvent.setup();
    render(<VariantPicker product={tee} />);
    // ດຳ + L ຖືກເລືອກ: ຂາວ ບໍ່ມີ L → ໄດ້ ຂາວ + M
    await user.click(option("ສີ", "ຂາວ"));
    expect(option("ສີ", "ຂາວ")).toHaveAttribute("aria-pressed", "true");
    expect(option("ໄຊສ໌", "M")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("ເຫຼືອ 3 ອັນ")).toBeInTheDocument();
    expect(screen.queryByText("ກະລຸນາເລືອກຕົວເລືອກ")).not.toBeInTheDocument();
  });

  it("ສະຖານະສະຕ໋ອກຖືກປະກາດໃຫ້ screen reader ເມື່ອປ່ຽນ", () => {
    render(<VariantPicker product={tee} />);
    expect(screen.getByText("ມີສິນຄ້າ").closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });

  it("ສິນຄ້າບໍ່ມີຕົວເລືອກ: ສະແດງລາຄາ ແລະ ສະຖານະເລີຍ ບໍ່ມີກຸ່ມປຸ່ມ", () => {
    render(<VariantPicker product={{ name: "ຈອກ", options: [], variants: [variant("only", {})] }} />);
    expect(screen.getByText("100,000 ກີບ")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("ບໍ່ມີ option ແຕ່ຫຼາຍ variant: ເລືອກຕາມຊື່ variant", async () => {
    const user = userEvent.setup();
    render(
      <VariantPicker
        product={{
          name: "ກ່ອງ",
          options: [],
          variants: [
            { ...variant("a", {}), name: "ກ່ອງນ້ອຍ" },
            { ...variant("b", {}, { price: "200000.00" }), name: "ກ່ອງໃຫຍ່" },
          ],
        }}
      />,
    );
    await user.click(option("ແບບ", "ກ່ອງໃຫຍ່"));
    expect(screen.getByText("200,000 ກີບ")).toBeInTheDocument();
  });
});

describe("VariantPicker + ກະຕ່າ", () => {
  it("ໃສ່ກະຕ່າ variant ທີ່ເລືອກຢູ່", async () => {
    const { getCart, resetCartForTests } = await import("@/lib/cart");
    resetCartForTests();
    const user = userEvent.setup();
    render(<VariantPicker product={tee} />);
    await user.click(option("ສີ", "ຂາວ"));
    await user.click(screen.getByRole("button", { name: "ໃສ່ກະຕ່າ" }));
    expect(getCart()).toEqual([{ variantId: "wm", quantity: 1 }]);
    resetCartForTests();
  });
});

describe("VariantPicker + Flash Sale", () => {
  it("shows the badge and a countdown for a variant on sale; refreshes the page when it ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    refresh.mockReset();
    render(
      <VariantPicker
        product={{
          name: "Cup",
          options: [],
          variants: [variant("only", {}, { price: "80000.00", compareAtPrice: "100000.00", saleEndsAt: "2026-10-11T10:00:02Z" })],
        }}
      />,
    );
    expect(screen.getByText("Flash Sale")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("00:02");
    expect(screen.getByText("100,000 ກີບ").tagName).toBe("S");
    act(() => vi.advanceTimersByTime(2000));
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("no badge or timer for a regular-price variant", () => {
    render(<VariantPicker product={{ name: "Cup", options: [], variants: [variant("only", {})] }} />);
    expect(screen.queryByText("Flash Sale")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
