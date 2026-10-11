import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { addToCart, getCart, resetCartForTests } from "@/lib/cart";
import type { StoreVariant } from "@/lib/types";
import { AddToCart } from "./add-to-cart";

const variant = (patch: Partial<StoreVariant> = {}): StoreVariant => ({
  id: "v1",
  name: null,
  price: "100.00",
  compareAtPrice: null,
  optionValues: {},
  stock: { status: "IN_STOCK", remaining: null },
  ...patch,
});

afterEach(() => resetCartForTests());

const addButton = () => screen.getByRole("button", { name: "ໃສ່ກະຕ່າ" });

describe("AddToCart", () => {
  it("ເພີ່ມຕາມຈຳນວນທີ່ເລືອກ ແລະ ຢືນຢັນພ້ອມລິ້ງໄປກະຕ່າ", async () => {
    const user = userEvent.setup();
    render(<AddToCart variant={variant()} productName="ເສື້ອ" />);
    await user.click(screen.getByRole("button", { name: "ເພີ່ມຈຳນວນ ເສື້ອ" }));
    await user.click(screen.getByRole("button", { name: "ເພີ່ມຈຳນວນ ເສື້ອ" }));
    await user.click(addButton());
    expect(getCart()).toEqual([{ variantId: "v1", quantity: 3 }]);
    expect(screen.getByText("ເພີ່ມ 3 ອັນ ລົງກະຕ່າແລ້ວ").closest("[role=status]")).not.toBeNull();
    expect(screen.getByRole("link", { name: "ເບິ່ງກະຕ່າ" })).toHaveAttribute("href", "/cart");
  });

  it("ສິນຄ້າໝົດ ຫຼື ຍັງບໍ່ໄດ້ເລືອກ variant → ປຸ່ມປິດ", () => {
    const { rerender } = render(<AddToCart variant={variant({ stock: { status: "OUT", remaining: null } })} productName="ເສື້ອ" />);
    expect(screen.getByRole("button", { name: "ສິນຄ້າໝົດ" })).toBeDisabled();
    rerender(<AddToCart variant={undefined} productName="ເສື້ອ" />);
    expect(addButton()).toBeDisabled();
  });

  it("ໃກ້ໝົດ: ເພີ່ມຈຳນວນໄດ້ບໍ່ເກີນທີ່ເຫຼືອ", async () => {
    const user = userEvent.setup();
    render(<AddToCart variant={variant({ stock: { status: "LOW", remaining: 2 } })} productName="ເສື້ອ" />);
    const plus = screen.getByRole("button", { name: "ເພີ່ມຈຳນວນ ເສື້ອ" });
    await user.click(plus);
    expect(plus).toBeDisabled();
    expect(screen.getByRole("status", { name: "ຈຳນວນ ເສື້ອ" })).toHaveTextContent("2");
  });

  it("ປ່ຽນ variant → ຈຳນວນກັບເປັນ 1 ແລະ ຂໍ້ຄວາມຢືນຢັນຫາຍ", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AddToCart variant={variant()} productName="ເສື້ອ" />);
    await user.click(screen.getByRole("button", { name: "ເພີ່ມຈຳນວນ ເສື້ອ" }));
    await user.click(addButton());
    rerender(<AddToCart variant={variant({ id: "v2" })} productName="ເສື້ອ" />);
    expect(screen.getByRole("status", { name: "ຈຳນວນ ເສື້ອ" })).toHaveTextContent("1");
    expect(screen.queryByText(/ລົງກະຕ່າແລ້ວ/)).not.toBeInTheDocument();
  });

  it("ກະຕ່າເຕັມ (ເກີນ 20 ອັນຂອງສິນຄ້ານີ້) → ແຈ້ງເຕືອນ ແລະ ບໍ່ເພີ່ມ", async () => {
    const user = userEvent.setup();
    addToCart("v1", 20);
    render(<AddToCart variant={variant()} productName="ເສື້ອ" />);
    await user.click(addButton());
    expect(getCart()).toEqual([{ variantId: "v1", quantity: 20 }]);
    expect(screen.getByRole("alert")).toHaveTextContent("ສັ່ງໄດ້ສູງສຸດ 20 ອັນຕໍ່ສິນຄ້າ ແລະ 20 ລາຍການຕໍ່ບິນ");
  });
});
