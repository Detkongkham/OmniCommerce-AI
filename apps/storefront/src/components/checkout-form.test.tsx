import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToCart, getCart, resetCartForTests } from "@/lib/cart";
import { ClientApiError, checkCart, createOrder, fetchMember } from "@/lib/client-api";
import type { StoreCart, StoreLoyalty, StoreMember } from "@/lib/types";
import { CheckoutForm } from "./checkout-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/client-api", async (original) => ({
  ...(await original<typeof import("@/lib/client-api")>()),
  checkCart: vi.fn(),
  createOrder: vi.fn(),
  fetchMember: vi.fn(),
}));
const fetchMemberMock = vi.mocked(fetchMember);
const checkCartMock = vi.mocked(checkCart);
const createOrderMock = vi.mocked(createOrder);

const cart = (total = "200.00", orderable = true, patch: Partial<StoreCart> = {}): StoreCart => ({
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
  coupon: null,
  couponError: null,
  points: null,
  pointsError: null,
  subtotal: total,
  vatAmount: "0.00",
  total,
  orderable,
  ...patch,
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
  fetchMemberMock.mockReset();
  fetchMemberMock.mockRejectedValue(new ClientApiError(401, "MEMBER_REQUIRED"));
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

describe("CheckoutForm: ໂຄດສ່ວນຫຼຸດ", () => {
  const apply = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
    await user.type(await screen.findByLabelText("ໂຄດສ່ວນຫຼຸດ"), code);
    await user.click(screen.getByRole("button", { name: "ໃຊ້ໂຄດ" }));
  };

  it("ໃສ່ໂຄດ → ຖາມ server ພ້ອມໂຄດ (ຕົວພິມໃຫຍ່), ສະແດງສ່ວນຫຼຸດ ແລະ ຍອດໃໝ່", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm couriers={couriers} />);
    await screen.findByLabelText("ໂຄດສ່ວນຫຼຸດ");
    checkCartMock.mockResolvedValue(cart("180.00", true, { coupon: { code: "NEW10", discount: "20.00" } }));
    await apply(user, " new10 ");
    expect(await screen.findByText("ສ່ວນຫຼຸດ (NEW10)")).toBeInTheDocument();
    expect(screen.getByText("−20 ກີບ")).toBeInTheDocument();
    expect(screen.getByText("180 ກີບ")).toBeInTheDocument();
    expect(checkCartMock).toHaveBeenLastCalledWith([{ variantId: "v1", quantity: 2 }], "NEW10", undefined);
  });

  it("ສັ່ງຊື້ສົ່ງໂຄດທີ່ server ຢືນຢັນ ແລະ ຍອດຫຼັງຫຼຸດ", async () => {
    const user = userEvent.setup();
    createOrderMock.mockResolvedValue({ orderNumber: "SO-1", token: "tok" });
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    checkCartMock.mockResolvedValue(cart("180.00", true, { coupon: { code: "NEW10", discount: "20.00" } }));
    await apply(user, "new10");
    await screen.findByText("ສ່ວນຫຼຸດ (NEW10)");
    await waitFor(() => expect(submit()).toBeEnabled());
    await user.click(submit());
    await waitFor(() => expect(createOrderMock).toHaveBeenCalled());
    expect(createOrderMock.mock.calls[0]?.[0]).toMatchObject({ couponCode: "NEW10", expectedTotal: "180.00" });
  });

  it("ໂຄດໃຊ້ບໍ່ໄດ້ → ບອກເຫດຜົນ, ຍອດບໍ່ຫຼຸດ ແລະ ການສັ່ງຊື້ບໍ່ສົ່ງໂຄດ", async () => {
    const user = userEvent.setup();
    createOrderMock.mockResolvedValue({ orderNumber: "SO-1", token: "tok" });
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    checkCartMock.mockResolvedValue(cart("200.00", true, { couponError: { reason: "MIN_SUBTOTAL", minSubtotal: "500.00" } }));
    await apply(user, "BIG");
    expect(await screen.findByText("ໂຄດນີ້ໃຊ້ໄດ້ເມື່ອຊື້ຄົບ 500 ກີບ")).toBeInTheDocument();
    expect(screen.queryByText(/ສ່ວນຫຼຸດ \(/)).not.toBeInTheDocument();
    await waitFor(() => expect(submit()).toBeEnabled());
    await user.click(submit());
    await waitFor(() => expect(createOrderMock).toHaveBeenCalled());
    expect(createOrderMock.mock.calls[0]?.[0]).not.toHaveProperty("couponCode");
  });

  it("ລຶບໂຄດ → ຖາມ server ໃໝ່ໂດຍບໍ່ມີໂຄດ", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm couriers={couriers} />);
    await screen.findByLabelText("ໂຄດສ່ວນຫຼຸດ");
    checkCartMock.mockResolvedValue(cart("180.00", true, { coupon: { code: "NEW10", discount: "20.00" } }));
    await apply(user, "NEW10");
    await screen.findByText("ສ່ວນຫຼຸດ (NEW10)");
    checkCartMock.mockResolvedValue(cart());
    await user.click(screen.getByRole("button", { name: "ລຶບໂຄດ NEW10" }));
    await waitFor(() => expect(screen.queryByText("ສ່ວນຫຼຸດ (NEW10)")).not.toBeInTheDocument());
    expect(checkCartMock).toHaveBeenLastCalledWith([{ variantId: "v1", quantity: 2 }], undefined, undefined);
  });

  it("server ປະຕິເສດໂຄດຕອນສັ່ງ (ເຊັ່ນ ເບີນີ້ໃຊ້ຄົບແລ້ວ) → ບອກເຫດຜົນ ແລະ ຖອດໂຄດອອກ", async () => {
    const user = userEvent.setup();
    createOrderMock.mockRejectedValueOnce(new ClientApiError(409, "COUPON_INVALID", { reason: "PHONE_LIMIT" }));
    render(<CheckoutForm couriers={couriers} />);
    await fill(user);
    checkCartMock.mockResolvedValue(cart("180.00", true, { coupon: { code: "NEW10", discount: "20.00" } }));
    await apply(user, "NEW10");
    await screen.findByText("ສ່ວນຫຼຸດ (NEW10)");
    await waitFor(() => expect(submit()).toBeEnabled());
    checkCartMock.mockResolvedValue(cart());
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent("ເບີໂທນີ້ໃຊ້ໂຄດນີ້ຄົບຈຳນວນແລ້ວ");
    await waitFor(() => expect(checkCartMock).toHaveBeenLastCalledWith([{ variantId: "v1", quantity: 2 }], undefined, undefined));
    expect(push).not.toHaveBeenCalled();
  });

  describe("ສະມາຊິກ ແລະ ແຕ້ມ", () => {
    const loyalty: StoreLoyalty = {
      enabled: true,
      earnPer: "10000.00",
      pointValue: "1.00",
      maxRedeemPercent: 50,
      tiers: [],
    };
    const member: StoreMember = {
      name: "ນາງ ສະມາຊິກ",
      phone: "02055555555",
      pointsBalance: 300,
      tier: "BRONZE",
      spend12m: "0.00",
      nextTier: null,
      pointsMultiplier: "1",
    };
    /** ກະຕ່າ 200 ກີບ, ມີ 300 ແຕ້ມ, ໃຊ້ໄດ້ສູງສຸດ 100 (1 ແຕ້ມ = 1 ກີບ) */
    const memberCart = (points: number | undefined): StoreCart => {
      if (points === undefined) return cart("200.00", true, { points: { balance: 300, maxPoints: 100, redeemed: 0, discount: "0.00" } });
      if (points > 100) {
        return cart("200.00", true, {
          points: { balance: 300, maxPoints: 100, redeemed: 0, discount: "0.00" },
          pointsError: { reason: "OVER_CAP", maxPoints: 100 },
        });
      }
      return cart(`${200 - points}.00`, true, { points: { balance: 300, maxPoints: 100, redeemed: points, discount: `${points}.00` } });
    };
    const fillRest = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByLabelText(/ທີ່ຢູ່/), "ບ້ານ ກ");
      await user.selectOptions(screen.getByLabelText(/ບໍລິສັດຂົນສົ່ງ/), "c1");
      await user.type(screen.getByLabelText(/ສາຂາປາຍທາງ/), "ໂພນທັນ");
    };

    beforeEach(() => {
      fetchMemberMock.mockReset();
      fetchMemberMock.mockResolvedValue(member);
      checkCartMock.mockImplementation(async (_items, _code, points) => memberCart(points));
    });

    it("guest + ລະບົບແຕ້ມເປີດ → ຄຳແນະນຳໃຫ້ເຂົ້າສູ່ລະບົບ", async () => {
      fetchMemberMock.mockReset();
      fetchMemberMock.mockRejectedValue(new ClientApiError(401, "MEMBER_REQUIRED"));
      checkCartMock.mockResolvedValue(cart());
      render(<CheckoutForm couriers={couriers} loyalty={loyalty} />);
      expect(await screen.findByRole("link", { name: "ເຂົ້າສູ່ລະບົບເພື່ອໃຊ້ແຕ້ມ" })).toHaveAttribute("href", "/account");
      expect(screen.getByText(/ມີບັນຊີ\?/)).toBeInTheDocument();
      expect(screen.queryByLabelText("ໃຊ້ແຕ້ມ", { selector: "input" })).not.toBeInTheDocument();
    });

    it("ເຂົ້າລະບົບແລ້ວ: ຕື່ມຊື່/ເບີ, ໃຊ້ສູງສຸດ → ກວດກະຕ່າພ້ອມແຕ້ມ, ແຖວສ່ວນຫຼຸດ, ແລະ ສົ່ງ pointsToRedeem", async () => {
      const user = userEvent.setup();
      createOrderMock.mockResolvedValue({ orderNumber: "SO-1", token: "tok" });
      render(<CheckoutForm couriers={couriers} loyalty={loyalty} />);
      await waitFor(() => expect(screen.getByLabelText(/ຊື່ຜູ້ຮັບ/)).toHaveValue("ນາງ ສະມາຊິກ"));
      expect(screen.getByLabelText(/ເບີໂທ/)).toHaveValue("02055555555");
      const input = await screen.findByLabelText("ໃຊ້ແຕ້ມ", { selector: "input" });
      expect(input).toHaveAttribute("max", "100");
      expect(screen.getByText(/ມີ 300 ແຕ້ມ · ບິນນີ້ໃຊ້ໄດ້ສູງສຸດ 100 ແຕ້ມ/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "ໃຊ້ສູງສຸດ" }));
      await waitFor(() => expect(checkCartMock).toHaveBeenLastCalledWith([{ variantId: "v1", quantity: 2 }], undefined, 100));
      expect(await screen.findByText("ໃຊ້ແຕ້ມ (100 ແຕ້ມ)")).toBeInTheDocument();
      expect(screen.getByText("−100 ກີບ")).toBeInTheDocument();
      expect(input).toHaveValue(100);

      await fillRest(user);
      await user.click(submit());
      await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
      expect(createOrderMock.mock.calls[0]?.[0]).toMatchObject({ name: "ນາງ ສະມາຊິກ", phone: "02055555555", pointsToRedeem: 100, expectedTotal: "100.00" });
    });

    it("ໃສ່ແຕ້ມເກີນ → ສະແດງ pointsError ແລະ ບໍ່ສົ່ງ pointsToRedeem", async () => {
      const user = userEvent.setup();
      createOrderMock.mockResolvedValue({ orderNumber: "SO-1", token: "tok" });
      render(<CheckoutForm couriers={couriers} loyalty={loyalty} />);
      const input = await screen.findByLabelText("ໃຊ້ແຕ້ມ", { selector: "input" });
      await user.type(input, "150");
      await user.click(screen.getByRole("button", { name: "ໃຊ້ແຕ້ມ" }));
      expect(await screen.findByText("ບິນນີ້ໃຊ້ໄດ້ສູງສຸດ 100 ແຕ້ມ")).toBeInTheDocument();
      await fillRest(user);
      await user.click(submit());
      await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
      expect(createOrderMock.mock.calls[0]?.[0]).not.toHaveProperty("pointsToRedeem");
    });

    it("ປ່ຽນເບີອອກຈາກເບີຂອງບັນຊີ → ປິດການໃຊ້ແຕ້ມພ້ອມໝາຍເຫດ ແລະ ກວດກະຕ່າໂດຍບໍ່ມີແຕ້ມ", async () => {
      const user = userEvent.setup();
      render(<CheckoutForm couriers={couriers} loyalty={loyalty} />);
      await user.click(await screen.findByRole("button", { name: "ໃຊ້ສູງສຸດ" }));
      expect(await screen.findByText("ໃຊ້ແຕ້ມ (100 ແຕ້ມ)")).toBeInTheDocument();
      const phone = screen.getByLabelText(/ເບີໂທ/);
      await user.clear(phone);
      await user.type(phone, "02099999999");
      expect(await screen.findByText("ໃຊ້ແຕ້ມໄດ້ສະເພາະເມື່ອເບີໂທຜູ້ຮັບແມ່ນ 02055555555")).toBeInTheDocument();
      expect(screen.getByLabelText("ໃຊ້ແຕ້ມ", { selector: "input" })).toBeDisabled();
      await waitFor(() => expect(checkCartMock).toHaveBeenLastCalledWith([{ variantId: "v1", quantity: 2 }], undefined, undefined));
      await waitFor(() => expect(screen.queryByText("ໃຊ້ແຕ້ມ (100 ແຕ້ມ)")).not.toBeInTheDocument());
    });

    it("session ໝົດອາຍຸຕອນກວດກະຕ່າພ້ອມແຕ້ມ → ຖອດແຕ້ມ, ກວດໃໝ່ແບບ guest ແລະ ບອກໃຫ້ເຂົ້າລະບົບໃໝ່", async () => {
      const user = userEvent.setup();
      checkCartMock.mockImplementation(async (_items, _code, points) => {
        if (points) throw new ClientApiError(401, "MEMBER_REQUIRED");
        return memberCart(undefined);
      });
      render(<CheckoutForm couriers={couriers} loyalty={loyalty} />);
      await user.click(await screen.findByRole("button", { name: "ໃຊ້ສູງສຸດ" }));
      expect(await screen.findByText(/ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່ ເພື່ອໃຊ້ແຕ້ມ/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(checkCartMock).toHaveBeenLastCalledWith([{ variantId: "v1", quantity: 2 }], undefined, undefined);
    });

    it("server ປະຕິເສດແຕ້ມຕອນສັ່ງ (POINTS_INVALID) → ບອກເຫດຜົນ ແລະ ຖອດແຕ້ມອອກ", async () => {
      const user = userEvent.setup();
      createOrderMock.mockRejectedValue(new ClientApiError(409, "POINTS_INVALID", { code: "POINTS_INVALID", reason: "INSUFFICIENT", balance: 20 }));
      render(<CheckoutForm couriers={couriers} loyalty={loyalty} />);
      await user.click(await screen.findByRole("button", { name: "ໃຊ້ສູງສຸດ" }));
      expect(await screen.findByText("ໃຊ້ແຕ້ມ (100 ແຕ້ມ)")).toBeInTheDocument();
      await fillRest(user);
      await user.click(submit());
      expect(await screen.findByRole("alert")).toHaveTextContent("ແຕ້ມບໍ່ພໍ (ມີ 20 ແຕ້ມ) — ແຕ້ມຖືກຖອດອອກແລ້ວ");
      await waitFor(() => expect(screen.queryByText("ໃຊ້ແຕ້ມ (100 ແຕ້ມ)")).not.toBeInTheDocument());
    });
  });
});
