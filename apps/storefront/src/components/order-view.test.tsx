import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCart, resetCartForTests } from "@/lib/cart";
import { ClientApiError, fetchOrder, setOrderPin, uploadSlip } from "@/lib/client-api";
import type { StoreOrder } from "@/lib/types";
import { OrderView } from "./order-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/client-api", async (original) => ({
  ...(await original<typeof import("@/lib/client-api")>()),
  fetchOrder: vi.fn(),
  uploadSlip: vi.fn(),
  setOrderPin: vi.fn(),
}));
const setOrderPinMock = vi.mocked(setOrderPin);
const fetchOrderMock = vi.mocked(fetchOrder);
const uploadSlipMock = vi.mocked(uploadSlip);

const order = (patch: Partial<StoreOrder> = {}): StoreOrder => ({
  orderNumber: "SO-000001",
  status: "PENDING_PAYMENT",
  createdAt: "2026-10-11T10:00:00.000Z",
  reservedUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
  paidAt: null,
  currency: "LAK",
  subtotal: "200000.00",
  vatAmount: "0.00",
  total: "200000.00",
  coupon: null,
  items: [
    { variantId: "v1", productName: "ເສື້ອ", variantName: "ດຳ", quantity: 2, unitPrice: "100000.00", lineTotal: "200000.00" },
  ],
  shipping: { name: "ນາງ ກ", phone: "02055555555", address: "ບ້ານ ກ", courierName: "ອານຸສິດ", branch: "ໂພນທັນ" },
  note: null,
  slips: [],
  tracking: null,
  points: null,
  pointsEarned: null,
  pinSetup: "NONE",
  ...patch,
});
const payment: Parameters<typeof OrderView>[0]["payment"] = {
  receivingAccounts: [{ bank: "BCEL", accountNo: "0101234567", accountName: "ຮ້ານ ກ" }],
  paymentInstructions: "ໂອນແລ້ວອັບໂຫຼດສະລິບ",
};
const view = (initial: StoreOrder, pay = payment) => render(<OrderView token="tok" initialOrder={initial} payment={pay} />);

beforeEach(() => {
  resetCartForTests();
  push.mockReset();
  fetchOrderMock.mockReset();
  uploadSlipMock.mockReset();
  setOrderPinMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  resetCartForTests();
});

describe("OrderView", () => {
  it("ລໍຖ້າຊຳລະ: ເລກບິນ, ຍອດທີ່ຕ້ອງໂອນ, ບັນຊີຮ້ານ, ໂມງນັບຖອຍຫຼັງ, ປຸ່ມອັບໂຫຼດ ແລະ ຂັ້ນຕອນປັດຈຸບັນ", () => {
    view(order());
    expect(screen.getByRole("heading", { name: "ບິນ SO-000001" })).toBeInTheDocument();
    const pay = screen.getByRole("region", { name: "ການຊຳລະເງິນ" });
    expect(within(pay).getByText("200,000 ກີບ")).toBeInTheDocument();
    expect(within(pay).getByText("BCEL")).toBeInTheDocument();
    expect(within(pay).getByText("0101234567")).toBeInTheDocument();
    expect(within(pay).getByText("ຮ້ານ ກ")).toBeInTheDocument();
    expect(within(pay).getByText("ໂອນແລ້ວອັບໂຫຼດສະລິບ")).toBeInTheDocument();
    expect(within(pay).getByRole("timer")).toBeInTheDocument();
    expect(screen.getByLabelText("ເລືອກຮູບສະລິບ")).toBeInTheDocument();
    expect(screen.getByText("ລໍຖ້າຊຳລະ", { selector: "li *" }).closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("ລາຍການ, ຍອດ ແລະ ຂໍ້ມູນຈັດສົ່ງ", () => {
    view(order({ note: "ໂທກ່ອນສົ່ງ" }));
    const items = screen.getByRole("region", { name: "ລາຍການສິນຄ້າ" });
    expect(within(items).getByText("ເສື້ອ")).toBeInTheDocument();
    expect(within(items).getByText("ດຳ × 2")).toBeInTheDocument();
    const shipping = screen.getByRole("region", { name: "ການຈັດສົ່ງ" });
    for (const text of ["ນາງ ກ", "02055555555", "ບ້ານ ກ", "ອານຸສິດ · ໂພນທັນ", "ໂທກ່ອນສົ່ງ"]) {
      expect(within(shipping).getByText(text)).toBeInTheDocument();
    }
  });

  it("ບິນທີ່ໃຊ້ໂຄດ: ສະແດງສ່ວນຫຼຸດ ແລະ ລະຫັດ ກ່ອນຍອດລວມ", () => {
    view(order({ subtotal: "180000.00", total: "180000.00", coupon: { code: "NEW10", discount: "20000.00" } }));
    const items = screen.getByRole("region", { name: "ລາຍການສິນຄ້າ" });
    expect(within(items).getByText("ສ່ວນຫຼຸດ (NEW10)")).toBeInTheDocument();
    expect(within(items).getByText("−20,000 ກີບ")).toBeInTheDocument();
    expect(within(items).getByText("180,000 ກີບ")).toBeInTheDocument();
  });

  it("ຮ້ານຍັງບໍ່ໄດ້ຕັ້ງບັນຊີ → ບອກໃຫ້ຕິດຕໍ່ຮ້ານ", () => {
    view(order(), { receivingAccounts: [], paymentInstructions: null });
    expect(screen.getByText("ກະລຸນາຕິດຕໍ່ຮ້ານເພື່ອຂໍເລກບັນຊີສຳລັບໂອນເງິນ")).toBeInTheDocument();
  });

  it("ມີສະລິບກຳລັງກວດ → ແຈ້ງວ່າໄດ້ຮັບແລ້ວ ແລະ ຍັງອັບໂຫຼດເພີ່ມໄດ້", () => {
    view(order({ slips: [{ status: "REVIEWING", createdAt: "2026-10-11T10:05:00.000Z" }] }));
    expect(screen.getByText("ໄດ້ຮັບສະລິບແລ້ວ ຮ້ານກຳລັງກວດສອບ")).toBeInTheDocument();
    expect(screen.getByText("ອັບໂຫຼດສະລິບເພີ່ມ")).toBeInTheDocument();
  });

  it("ສະລິບຖືກປະຕິເສດ ແລະ ບໍ່ມີໃບທີ່ກຳລັງກວດ → ບອກໃຫ້ອັບໂຫຼດໃໝ່", () => {
    view(order({ slips: [{ status: "REJECTED", createdAt: "2026-10-11T10:05:00.000Z" }] }));
    expect(screen.getByRole("alert")).toHaveTextContent("ສະລິບທີ່ສົ່ງມາບໍ່ຖືກຕ້ອງ ກະລຸນາອັບໂຫຼດສະລິບໃໝ່");
    expect(screen.getByText("ອັບໂຫຼດສະລິບໃໝ່")).toBeInTheDocument();
  });

  it("ຄົບ 3 ໃບທີ່ບໍ່ຖືກປະຕິເສດ → ບໍ່ມີປຸ່ມອັບໂຫຼດ", () => {
    const slip = { status: "REVIEWING" as const, createdAt: "2026-10-11T10:05:00.000Z" };
    view(order({ slips: [slip, slip, slip, { status: "REJECTED", createdAt: slip.createdAt }] }));
    expect(screen.queryByLabelText("ເລືອກຮູບສະລິບ")).not.toBeInTheDocument();
    expect(screen.getByText("ສົ່ງສະລິບຄົບຈຳນວນແລ້ວ ກະລຸນາລໍຖ້າຮ້ານກວດສອບ")).toBeInTheDocument();
  });

  it("ອັບໂຫຼດສຳເລັດ → ໂຫຼດບິນໃໝ່ ແລະ ສະແດງສະຖານະຫຼ້າສຸດ", async () => {
    const user = userEvent.setup();
    uploadSlipMock.mockResolvedValue({ status: "REVIEWING" });
    fetchOrderMock.mockResolvedValue(order({ slips: [{ status: "REVIEWING", createdAt: "2026-10-11T10:05:00.000Z" }] }));
    view(order());
    await user.upload(screen.getByLabelText("ເລືອກຮູບສະລິບ"), new File(["x"], "slip.png", { type: "image/png" }));
    expect(await screen.findByText("ໄດ້ຮັບສະລິບແລ້ວ ຮ້ານກຳລັງກວດສອບ")).toBeInTheDocument();
    expect(fetchOrderMock).toHaveBeenCalledWith("tok");
  });

  it("ລໍຖ້າຊຳລະ: ຖາມສະຖານະທຸກ 15 ວິ; ເມື່ອຈ່າຍແລ້ວ ສະແດງ 'ຊຳລະແລ້ວ' ແລະ ເຊົາຖາມ", async () => {
    vi.useFakeTimers();
    fetchOrderMock.mockResolvedValueOnce(order());
    fetchOrderMock.mockResolvedValueOnce(order({ status: "PAID", paidAt: "2026-10-11T10:10:00.000Z" }));
    view(order());
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(fetchOrderMock).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(fetchOrderMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("ຮ້ານໄດ້ຮັບການຊຳລະແລ້ວ ກຳລັງກຽມສິນຄ້າໃຫ້ທ່ານ")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "ການຊຳລະເງິນ" })).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchOrderMock).toHaveBeenCalledTimes(2);
  });

  it("ການຖາມສະຖານະລົ້ມ → ຍັງສະແດງຂໍ້ມູນເດີມ (ບໍ່ພັງ)", async () => {
    vi.useFakeTimers();
    fetchOrderMock.mockRejectedValue(new Error("offline"));
    view(order());
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByRole("heading", { name: "ບິນ SO-000001" })).toBeInTheDocument();
  });

  it("ບິນທີ່ບໍ່ໄດ້ລໍຈ່າຍ ບໍ່ຖາມສະຖານະຊ້ຳ", async () => {
    vi.useFakeTimers();
    view(order({ status: "SHIPPED", reservedUntil: null }));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchOrderMock).not.toHaveBeenCalled();
  });

  it("ສົ່ງແລ້ວ: ເລກ tracking ແລະ ລິ້ງຕິດຕາມ (ບໍ່ສົ່ງ referrer)", () => {
    view(
      order({
        status: "SHIPPED",
        reservedUntil: null,
        tracking: { courierName: "ອານຸສິດ", trackingNumber: "TRK1", url: "https://track.example/TRK1" },
      }),
    );
    const tracking = screen.getByRole("region", { name: "ຕິດຕາມພັດສະດຸ" });
    expect(within(tracking).getByText("TRK1")).toBeInTheDocument();
    const link = within(tracking).getByRole("link", { name: "ຕິດຕາມພັດສະດຸ" });
    expect(link).toHaveAttribute("href", "https://track.example/TRK1");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("tracking ບໍ່ມີ URL → ສະແດງເລກຢ່າງດຽວ", () => {
    view(order({ status: "SHIPPED", reservedUntil: null, tracking: { courierName: null, trackingNumber: "TRK1", url: null } }));
    expect(screen.getByText("TRK1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ຕິດຕາມພັດສະດຸ" })).not.toBeInTheDocument();
  });

  it("ໝົດເວລາຊຳລະ: ບໍ່ມີການອັບໂຫຼດ; 'ສັ່ງໃໝ່' ເຕີມກະຕ່າຈາກລາຍການເດີມ ແລ້ວໄປໜ້າກະຕ່າ", async () => {
    const user = userEvent.setup();
    view(order({ status: "EXPIRED" }));
    expect(screen.getByText("ບິນນີ້ໝົດເວລາຊຳລະແລ້ວ ສິນຄ້າທີ່ຈອງໄວ້ຖືກປ່ອຍຄືນ")).toBeInTheDocument();
    expect(screen.queryByLabelText("ເລືອກຮູບສະລິບ")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ສັ່ງໃໝ່" }));
    expect(getCart()).toEqual([{ variantId: "v1", quantity: 2 }]);
    expect(push).toHaveBeenCalledWith("/cart");
  });

  it("ຍົກເລີກແລ້ວ: ແຈ້ງ ແລະ ບໍ່ມີຂັ້ນຕອນ/ການຊຳລະ", () => {
    view(order({ status: "CANCELLED", reservedUntil: null }));
    expect(screen.getByText("ບິນນີ້ຖືກຍົກເລີກແລ້ວ")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "ຂັ້ນຕອນຂອງບິນ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "ການຊຳລະເງິນ" })).not.toBeInTheDocument();
  });

  it("ໂມງນັບຖອຍຫຼັງຮອດ 0 → ຖາມສະຖານະທັນທີ ແລະ ສະແດງວ່າໝົດເວລາ", async () => {
    vi.useFakeTimers();
    fetchOrderMock.mockResolvedValue(order({ status: "EXPIRED" }));
    view(order({ reservedUntil: new Date(Date.now() + 2000).toISOString() }));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(fetchOrderMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ບິນນີ້ໝົດເວລາຊຳລະແລ້ວ ສິນຄ້າທີ່ຈອງໄວ້ຖືກປ່ອຍຄືນ")).toBeInTheDocument();
  });

  it("ໃຊ້ແຕ້ມ ແລະ ໄດ້ແຕ້ມ: ແຖວສ່ວນຫຼຸດຈາກແຕ້ມ ແລະ ແຕ້ມທີ່ໄດ້ຮັບ", () => {
    view(order({ status: "PAID", total: "190000.00", points: { redeemed: 100, discount: "10000.00" }, pointsEarned: 19 }));
    const items = screen.getByRole("region", { name: "ລາຍການສິນຄ້າ" });
    expect(within(items).getByText("ໃຊ້ແຕ້ມ (100 ແຕ້ມ)")).toBeInTheDocument();
    expect(within(items).getByText("−10,000 ກີບ")).toBeInTheDocument();
    expect(within(items).getByText("+19 ແຕ້ມ")).toBeInTheDocument();
  });

  it("pinSetup NONE → ບໍ່ມີກ່ອງ PIN; AFTER_PAYMENT → ບອກໃຫ້ຊຳລະກ່ອນ", () => {
    const { unmount } = view(order());
    expect(screen.queryByRole("region", { name: "ບັນຊີສະມາຊິກ" })).not.toBeInTheDocument();
    unmount();
    view(order({ pinSetup: "AFTER_PAYMENT" }));
    expect(screen.getByRole("region", { name: "ບັນຊີສະມາຊິກ" })).toHaveTextContent("ຕັ້ງ PIN ໄດ້ຫຼັງຊຳລະເງິນແລ້ວ");
    expect(screen.queryByLabelText(/PIN ໃໝ່/)).not.toBeInTheDocument();
  });

  it("AVAILABLE: PIN ບໍ່ກົງກັນ → ຂໍ້ຄວາມ ແລະ ບໍ່ສົ່ງ", async () => {
    const user = userEvent.setup();
    view(order({ status: "PAID", pinSetup: "AVAILABLE" }));
    const card = screen.getByRole("region", { name: "ບັນຊີສະມາຊິກ" });
    expect(within(card).getByText("ຕັ້ງ PIN 6 ຕົວ ເພື່ອເບິ່ງແຕ້ມ ແລະ ປະຫວັດການສັ່ງຊື້")).toBeInTheDocument();
    expect(within(card).getByLabelText(/PIN ໃໝ່/)).toHaveAttribute("autocomplete", "new-password");
    expect(within(card).getByLabelText(/ຢືນຢັນ PIN/)).toHaveAttribute("inputmode", "numeric");
    await user.type(within(card).getByLabelText(/PIN ໃໝ່/), "123456");
    await user.type(within(card).getByLabelText(/ຢືນຢັນ PIN/), "123457");
    await user.click(within(card).getByRole("button", { name: "ຕັ້ງ PIN" }));
    expect(within(card).getByText("PIN ທັງສອງຊ່ອງບໍ່ກົງກັນ")).toBeInTheDocument();
    expect(setOrderPinMock).not.toHaveBeenCalled();
  });

  it("AVAILABLE: ຕັ້ງ PIN ສຳເລັດ → ເຂົ້າລະບົບແລ້ວ + ລິ້ງໄປບັນຊີ", async () => {
    const user = userEvent.setup();
    setOrderPinMock.mockResolvedValue({
      member: { name: "ນາງ ກ", phone: "02055555555", pointsBalance: 19, tier: "BRONZE", spend12m: "200000.00", nextTier: null, pointsMultiplier: "1" },
    });
    view(order({ status: "PAID", pinSetup: "AVAILABLE" }));
    await user.type(screen.getByLabelText(/PIN ໃໝ່/), "12a3456");
    await user.type(screen.getByLabelText(/ຢືນຢັນ PIN/), "123456");
    await user.click(screen.getByRole("button", { name: "ຕັ້ງ PIN" }));
    expect(setOrderPinMock).toHaveBeenCalledWith("tok", "123456");
    expect(await screen.findByText(/ຕັ້ງ PIN ສຳເລັດ — ທ່ານເຂົ້າສູ່ລະບົບແລ້ວ/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ໄປທີ່ບັນຊີຂອງຂ້ອຍ" })).toHaveAttribute("href", "/account");
  });

  it("AVAILABLE: PIN_ALREADY_SET → ບອກວ່າມີ PIN ແລ້ວ + ລິ້ງເຂົ້າສູ່ລະບົບ", async () => {
    const user = userEvent.setup();
    setOrderPinMock.mockRejectedValue(new ClientApiError(409, "PIN_ALREADY_SET"));
    view(order({ status: "PAID", pinSetup: "AVAILABLE" }));
    await user.type(screen.getByLabelText(/PIN ໃໝ່/), "123456");
    await user.type(screen.getByLabelText(/ຢືນຢັນ PIN/), "123456");
    await user.click(screen.getByRole("button", { name: "ຕັ້ງ PIN" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "ບັນຊີສະມາຊິກ" })).toHaveTextContent("ເບີນີ້ມີ PIN ແລ້ວ"));
    expect(screen.getByRole("link", { name: "ເຂົ້າສູ່ລະບົບ" })).toHaveAttribute("href", "/account");
  });
});
