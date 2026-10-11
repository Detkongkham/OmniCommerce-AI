import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToCart, getCart, resetCartForTests } from "@/lib/cart";
import { ClientApiError, checkCart, createOrder } from "@/lib/client-api";
import type { StoreCart } from "@/lib/types";
import { CheckoutForm } from "./checkout-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/client-api", async (original) => ({
  ...(await original<typeof import("@/lib/client-api")>()),
  checkCart: vi.fn(),
  createOrder: vi.fn(),
}));
const checkCartMock = vi.mocked(checkCart);
const createOrderMock = vi.mocked(createOrder);

const cart = (total = "200.00", orderable = true): StoreCart => ({
  items: [
    {
      variantId: "v1",
      quantity: 2,
      unavailable: false,
      productName: "ເສື້ອ",
      productSlug: "tee",
      variantName: "ດຳ",
      imageUrl: null,
      unitPrice: "100.00",
      lineTotal: "200.00",
      stock: { status: "IN_STOCK", remaining: null },
      insufficient: false,
    },
  ],
  subtotal: total,
  vatAmount: "0.00",
  total,
  orderable,
});

const couriers = [
  { id: "c1", name: "ອານຸສິດ" },
  { id: "c2", name: "HAL" },
];

beforeEach(() => {
  resetCartForTests();
  push.mockReset();
  checkCartMock.mockReset();
  createOrderMock.mockReset();
  addToCart("v1", 2);
  checkCartMock.mockResolvedValue(cart());
});
afterEach(() => resetCartForTests());

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(await screen.findByLabelText(/ຊື່ຜູ້ຮັບ/), "ນາງ ກ");
  await user.type(screen.getByLabelText(/ເບີໂທ/), "020 5555-5555");
  await user.type(screen.getByLabelText(/ທີ່ຢູ່/), "ບ້ານ ກ, ວຽງຈັນ");
  await user.selectOptions(screen.getByLabelText(/ບໍລິສັດຂົນສົ່ງ/), "c2");
  await user.type(screen.getByLabelText(/ສາຂາປາຍທາງ/), "ໂພນທັນ");
};
const submit = () => screen.getByRole("button", { name: "ຢືນຢັນສັ່ງຊື້" });

describe("CheckoutForm", () => {
  it("ສະແດງສະຫຼຸບລາຍການ ແລະ ຍອດລວມຈາກ server", async () => {
    render(<CheckoutForm couriers={couriers} />);
    expect(await screen.findByText("ເສື້ອ")).toBeInTheDocument();
    expect(screen.getByText("ດຳ × 2")).toBeInTheDocument();
    expect(screen.getAllByText("200 ກີບ").length).toBeGreaterThan(0);
  });

  it("ຟອມບໍ່ຄົບ → ຂໍ້ຄວາມຕໍ່ field, focus field ທຳອິດທີ່ຜິດ ແລະ ບໍ່ສົ່ງ", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm couriers={couriers} />);
    await user.type(await screen.findByLabelText(/ເບີໂທ/), "12");
    await user.click(submit());
    expect(screen.getByText("ກະລຸນາໃສ່ຊື່ຜູ້ຮັບ")).toBeInTheDocument();
    expect(screen.getByText("ເບີໂທບໍ່ຖືກຕ້ອງ (ຕົວເລກ 6–15 ຫຼັກ)")).toBeInTheDocument();
    expect(screen.getByText("ກະລຸນາໃສ່ທີ່ຢູ່ຈັດສົ່ງ")).toBeInTheDocument();
    expect(screen.getByText("ກະລຸນາເລືອກບໍລິສັດຂົນສົ່ງ")).toBeInTheDocument();
    expect(screen.getByText("ກະລຸນາໃສ່ສາຂາປາຍທາງ")).toBeInTheDocument();
    expect(screen.getByLabelText(/ຊື່ຜູ້ຮັບ/)).toHaveFocus();
    expect(screen.getByLabelText(/ຊື່ຜູ້ຮັບ/)).toHaveAttribute("aria-invalid", "true");
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("ສົ່ງ body ທີ່ຖືກ (ເບີ normalize, ຍອດຈາກ server), ລ້າງກະຕ່າ ແລະ ໄປໜ້າບິນ", async () => {
    const user = userEvent.setup();
    createOrderMock.mockResolvedValue({ orderNumber: "SO-000001", token: "tok" });
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    await user.type(screen.getByLabelText(/ໝາຍເຫດ/), "ໂທກ່ອນສົ່ງ");
    await user.click(submit());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orders/tok"));
    expect(createOrderMock).toHaveBeenCalledTimes(1);
    const [body, key] = createOrderMock.mock.calls[0] ?? [];
    expect(body).toEqual({
      items: [{ variantId: "v1", quantity: 2 }],
      name: "ນາງ ກ",
      phone: "02055555555",
      address: "ບ້ານ ກ, ວຽງຈັນ",
      courierId: "c2",
      branch: "ໂພນທັນ",
      note: "ໂທກ່ອນສົ່ງ",
      expectedTotal: "200.00",
    });
    expect(key).toMatch(/^[\x21-\x7e]{16,128}$/);
    expect(getCart()).toEqual([]);
    expect(screen.getByText("ສັ່ງຊື້ສຳເລັດ ກຳລັງໄປໜ້າບິນ…")).toBeInTheDocument();
  });

  it("ບໍ່ມີໝາຍເຫດ → ບໍ່ສົ່ງ field note", async () => {
    const user = userEvent.setup();
    createOrderMock.mockResolvedValue({ orderNumber: "SO-1", token: "tok" });
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(createOrderMock).toHaveBeenCalled());
    expect(createOrderMock.mock.calls[0]?.[0]).not.toHaveProperty("note");
  });

  it("ເຄືອຂ່າຍລົ້ມ → ແຈ້ງເຕືອນ, ກະຕ່າຍັງຢູ່; ລອງໃໝ່ດ້ວຍຂໍ້ມູນເດີມໃຊ້ key ເດີມ; ແກ້ຂໍ້ມູນແລ້ວໃຊ້ key ໃໝ່", async () => {
    const user = userEvent.setup();
    createOrderMock.mockRejectedValueOnce(new ClientApiError(0, "NETWORK"));
    createOrderMock.mockRejectedValueOnce(new ClientApiError(0, "NETWORK"));
    createOrderMock.mockResolvedValueOnce({ orderNumber: "SO-1", token: "tok" });
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent("ເຊື່ອມຕໍ່ບໍ່ໄດ້");
    expect(getCart()).toHaveLength(1);
    await user.click(submit());
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));
    expect(createOrderMock.mock.calls[1]?.[1]).toBe(createOrderMock.mock.calls[0]?.[1]);
    await user.type(screen.getByLabelText(/ສາຂາປາຍທາງ/), " 2");
    await user.click(submit());
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(3));
    expect(createOrderMock.mock.calls[2]?.[1]).not.toBe(createOrderMock.mock.calls[0]?.[1]);
  });

  it("PRICE_CHANGED → ບອກຍອດໃໝ່, ໂຫຼດຍອດຈາກ server ໃໝ່ ແລະ ຕ້ອງກົດຢືນຢັນອີກຄັ້ງ", async () => {
    const user = userEvent.setup();
    createOrderMock.mockRejectedValueOnce(new ClientApiError(409, "PRICE_CHANGED", { total: "240.00" }));
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    checkCartMock.mockResolvedValue(cart("240.00"));
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent("ລາຄາມີການປ່ຽນແປງ ຍອດໃໝ່ແມ່ນ 240 ກີບ");
    expect(push).not.toHaveBeenCalled();
    createOrderMock.mockResolvedValueOnce({ orderNumber: "SO-1", token: "tok" });
    expect(await screen.findByText("240 ກີບ")).toBeInTheDocument();
    await waitFor(() => expect(submit()).toBeEnabled());
    await user.click(submit());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orders/tok"));
    expect(createOrderMock.mock.calls[1]?.[0]).toMatchObject({ expectedTotal: "240.00" });
  });

  it("ສະຕ໋ອກບໍ່ພໍ / ສິນຄ້າບໍ່ຂາຍແລ້ວ → ບອກໃຫ້ກັບໄປແກ້ກະຕ່າ", async () => {
    const user = userEvent.setup();
    createOrderMock.mockRejectedValueOnce(new ClientApiError(409, "INSUFFICIENT_STOCK", { shortages: [] }));
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    await user.click(submit());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("ສິນຄ້າບາງລາຍການມີບໍ່ພໍ ຫຼື ບໍ່ມີຂາຍແລ້ວ");
    expect(screen.getByRole("link", { name: "ກັບໄປແກ້ໄຂກະຕ່າ" })).toHaveAttribute("href", "/cart");
    expect(getCart()).toHaveLength(1);
  });

  it("ບິນຄ້າງເກີນ ແລະ 429 ມີຂໍ້ຄວາມສະເພາະ; error ອື່ນມີຂໍ້ຄວາມທົ່ວໄປ", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    createOrderMock.mockRejectedValueOnce(new ClientApiError(409, "TOO_MANY_OPEN_ORDERS"));
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent("ເບີໂທນີ້ມີບິນທີ່ຍັງບໍ່ໄດ້ຊຳລະຢູ່ແລ້ວ 2 ບິນ");
    createOrderMock.mockRejectedValueOnce(new ClientApiError(429, "TOO_MANY_ATTEMPTS"));
    await user.click(submit());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ມີການໃຊ້ງານຫຼາຍເກີນໄປ"));
    createOrderMock.mockRejectedValueOnce(new ClientApiError(500, undefined));
    await user.click(submit());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ສັ່ງຊື້ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"));
  });

  it("ລະຫວ່າງສົ່ງ ປຸ່ມຖືກປິດ (ກັນກົດຊ້ຳ)", async () => {
    const user = userEvent.setup();
    let resolve: (value: { orderNumber: string; token: string }) => void = () => {};
    createOrderMock.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    await user.click(submit());
    expect(submit()).toBeDisabled();
    await user.click(submit());
    expect(createOrderMock).toHaveBeenCalledTimes(1);
    resolve({ orderNumber: "SO-1", token: "tok" });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("ກະຕ່າຫວ່າງ → ບອກໃຫ້ໄປເລືອກສິນຄ້າ; ກະຕ່າມີບັນຫາ → ສົ່ງບໍ່ໄດ້", async () => {
    resetCartForTests();
    window.localStorage.clear();
    const { unmount } = render(<CheckoutForm couriers={couriers} />);
    expect(await screen.findByText("ກະຕ່າຂອງທ່ານຍັງຫວ່າງ")).toBeInTheDocument();
    unmount();
    addToCart("v1", 2);
    checkCartMock.mockResolvedValue(cart("200.00", false));
    render(<CheckoutForm couriers={couriers} />);
    expect(await screen.findByText("ບາງລາຍການໃນກະຕ່າສັ່ງບໍ່ໄດ້")).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it("ຮ້ານຍັງບໍ່ໄດ້ຕັ້ງບໍລິສັດຂົນສົ່ງ → ແຈ້ງ ແລະ ສົ່ງບໍ່ໄດ້", async () => {
    render(<CheckoutForm couriers={[]} />);
    expect(await screen.findByText("ຮ້ານຍັງບໍ່ໄດ້ຕັ້ງບໍລິສັດຂົນສົ່ງ ຈຶ່ງຍັງສັ່ງຊື້ທາງເວັບບໍ່ໄດ້")).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });
});
