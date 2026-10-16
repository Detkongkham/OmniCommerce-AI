import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToCart, getCart, resetCartForTests } from "@/lib/cart";
import { ClientApiError, checkCart } from "@/lib/client-api";
import type { StoreCart, StoreCartLine } from "@/lib/types";
import { CartView } from "./cart-view";

vi.mock("@/lib/client-api", async (original) => ({
  ...(await original<typeof import("@/lib/client-api")>()),
  checkCart: vi.fn(),
}));
const checkCartMock = vi.mocked(checkCart);

const line = (variantId: string, quantity: number, patch: object = {}): StoreCartLine => ({
  variantId,
  quantity,
  unavailable: false,
  productName: `ສິນຄ້າ ${variantId}`,
  productSlug: `p-${variantId}`,
  variantName: null,
  imageUrl: null,
  unitPrice: "100.00",
  lineTotal: `${100 * quantity}.00`,
  stock: { status: "IN_STOCK", remaining: null },
  insufficient: false,
  ...patch,
});
const cartOf = (items: StoreCartLine[], patch: Partial<StoreCart> = {}): StoreCart => ({
  items,
  coupon: null,
  couponError: null,
  points: null,
  pointsError: null,
  subtotal: "0.00",
  vatAmount: "0.00",
  total: "300.00",
  orderable: true,
  ...patch,
});

beforeEach(() => {
  resetCartForTests();
  checkCartMock.mockReset();
});
afterEach(() => resetCartForTests());

const row = (name: string) => screen.getByRole("listitem", { name });

describe("CartView", () => {
  it("ກະຕ່າຫວ່າງ → ຂໍ້ຄວາມ + ລິ້ງໄປເບິ່ງສິນຄ້າ; ບໍ່ຖາມ server", async () => {
    render(<CartView />);
    expect(await screen.findByText("ກະຕ່າຂອງທ່ານຍັງຫວ່າງ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ເລືອກຊື້ສິນຄ້າ" })).toHaveAttribute("href", "/products");
    expect(checkCartMock).not.toHaveBeenCalled();
  });

  it("ສະແດງລາຍການ, ລາຄາ ແລະ ຍອດລວມຈາກ server; ປຸ່ມສັ່ງຊື້ໄປ /checkout", async () => {
    addToCart("a", 2);
    addToCart("b", 1);
    checkCartMock.mockResolvedValue(cartOf([line("a", 2, { variantName: "ດຳ / M" }), line("b", 1)]));
    render(<CartView />);
    const first = await screen.findByRole("listitem", { name: "ສິນຄ້າ a" });
    expect(within(first).getByRole("link", { name: "ສິນຄ້າ a" })).toHaveAttribute("href", "/products/p-a");
    expect(within(first).getByText("ດຳ / M")).toBeInTheDocument();
    expect(within(first).getByText("200 ກີບ")).toBeInTheDocument();
    expect(screen.getByText("300 ກີບ")).toBeInTheDocument();
    expect(screen.getByText("ຄ່າຂົນສົ່ງຊຳລະຕອນຮັບສິນຄ້າ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ດຳເນີນການສັ່ງຊື້" })).toHaveAttribute("href", "/checkout");
    expect(checkCartMock).toHaveBeenCalledWith(
      [
        { variantId: "a", quantity: 2 },
        { variantId: "b", quantity: 1 },
      ],
      undefined,
      undefined,
    );
  });

  it("ປ່ຽນຈຳນວນ → ອັບເດດກະຕ່າ ແລະ ຖາມ server ໃໝ່; ລຶບ → ລາຍການຫາຍ", async () => {
    const user = userEvent.setup();
    addToCart("a", 2);
    addToCart("b", 1);
    checkCartMock.mockImplementation(async (items) => cartOf(items.map((item) => line(item.variantId, item.quantity))));
    render(<CartView />);
    await user.click(within(await screen.findByRole("listitem", { name: "ສິນຄ້າ a" })).getByRole("button", { name: "ເພີ່ມຈຳນວນ ສິນຄ້າ a" }));
    expect(getCart()[0]).toEqual({ variantId: "a", quantity: 3 });
    await waitFor(() => expect(checkCartMock).toHaveBeenLastCalledWith([{ variantId: "a", quantity: 3 }, { variantId: "b", quantity: 1 }], undefined, undefined));
    await user.click(within(row("ສິນຄ້າ b")).getByRole("button", { name: "ລຶບ ສິນຄ້າ b ອອກຈາກກະຕ່າ" }));
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "ສິນຄ້າ b" })).not.toBeInTheDocument());
    expect(getCart()).toEqual([{ variantId: "a", quantity: 3 }]);
  });

  it("ສິນຄ້າທີ່ບໍ່ຂາຍແລ້ວ ຫຼື ສະຕ໋ອກບໍ່ພໍ → ບອກເຫດຜົນ ແລະ ປິດການສັ່ງຊື້", async () => {
    addToCart("gone", 1);
    addToCart("short", 5);
    checkCartMock.mockResolvedValue(
      cartOf(
        [
          { variantId: "gone", quantity: 1, unavailable: true },
          line("short", 5, { insufficient: true, stock: { status: "LOW", remaining: 2 } }),
        ],
        { orderable: false },
      ),
    );
    render(<CartView />);
    expect(await screen.findByText("ສິນຄ້ານີ້ບໍ່ມີຂາຍແລ້ວ")).toBeInTheDocument();
    expect(within(row("ສິນຄ້າ short")).getByText("ສະຕ໋ອກບໍ່ພໍ: ເຫຼືອ 2 ອັນ")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ດຳເນີນການສັ່ງຊື້" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ດຳເນີນການສັ່ງຊື້" })).toBeDisabled();
    expect(screen.getByText("ກະລຸນາແກ້ໄຂລາຍການທີ່ມີບັນຫາກ່ອນສັ່ງຊື້")).toBeInTheDocument();
  });

  it("ສິນຄ້າໝົດ (insufficient + OUT) → 'ສິນຄ້າໝົດ'", async () => {
    addToCart("out", 1);
    checkCartMock.mockResolvedValue(cartOf([line("out", 1, { insufficient: true, stock: { status: "OUT", remaining: null } })], { orderable: false }));
    render(<CartView />);
    expect(await screen.findByText("ສິນຄ້າໝົດ")).toBeInTheDocument();
  });

  it("ໂຫຼດລົ້ມ → ແຈ້ງເຕືອນ + ລອງໃໝ່; 429 ມີຂໍ້ຄວາມສະເພາະ", async () => {
    const user = userEvent.setup();
    addToCart("a", 1);
    checkCartMock.mockRejectedValueOnce(new ClientApiError(0, "NETWORK"));
    render(<CartView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("ໂຫຼດກະຕ່າບໍ່ສຳເລັດ");
    checkCartMock.mockRejectedValueOnce(new ClientApiError(429, "TOO_MANY_ATTEMPTS"));
    await user.click(screen.getByRole("button", { name: "ລອງໃໝ່" }));
    expect(await screen.findByText("ມີການໃຊ້ງານຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າຈັກໜ້ອຍແລ້ວລອງໃໝ່")).toBeInTheDocument();
    checkCartMock.mockResolvedValueOnce(cartOf([line("a", 1)]));
    await user.click(screen.getByRole("button", { name: "ລອງໃໝ່" }));
    expect(await screen.findByRole("listitem", { name: "ສິນຄ້າ a" })).toBeInTheDocument();
  });
});
