import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientApiError, fetchMember, fetchMemberOrders, fetchMemberPoints, memberLogin, memberLogout } from "@/lib/client-api";
import type { StoreLoyalty, StoreMember } from "@/lib/types";
import { AccountView } from "./account-view";

vi.mock("@/lib/client-api", async (original) => ({
  ...(await original<typeof import("@/lib/client-api")>()),
  fetchMember: vi.fn(),
  fetchMemberOrders: vi.fn(),
  fetchMemberPoints: vi.fn(),
  memberLogin: vi.fn(),
  memberLogout: vi.fn(),
}));
const fetchMemberMock = vi.mocked(fetchMember);
const ordersMock = vi.mocked(fetchMemberOrders);
const pointsMock = vi.mocked(fetchMemberPoints);
const loginMock = vi.mocked(memberLogin);
const logoutMock = vi.mocked(memberLogout);

const loyalty: StoreLoyalty = {
  enabled: true,
  earnPer: "10000.00",
  pointValue: "100.00",
  maxRedeemPercent: 50,
  tiers: [
    { tier: "BRONZE", minSpend: "0.00", multiplier: "1" },
    { tier: "SILVER", minSpend: "2000000.00", multiplier: "1.25" },
    { tier: "GOLD", minSpend: "5000000.00", multiplier: "1.5" },
    { tier: "PLATINUM", minSpend: "10000000.00", multiplier: "2" },
  ],
};
const member = (patch: Partial<StoreMember> = {}): StoreMember => ({
  name: "ນາງ ກ",
  phone: "02055555555",
  pointsBalance: 1250,
  tier: "BRONZE",
  spend12m: "500000.00",
  nextTier: { tier: "SILVER", minSpend: "2000000.00", remaining: "1500000.00" },
  pointsMultiplier: "1",
  ...patch,
});
const required = () => new ClientApiError(401, "MEMBER_REQUIRED", { code: "MEMBER_REQUIRED" });

beforeEach(() => {
  fetchMemberMock.mockReset();
  ordersMock.mockReset();
  pointsMock.mockReset();
  loginMock.mockReset();
  logoutMock.mockReset();
  ordersMock.mockResolvedValue({
    items: [
      { orderNumber: "SO-000002", createdAt: "2026-10-10T10:00:00.000Z", status: "PAID", total: "150000.00", channel: "STOREFRONT", token: "tok2" },
      { orderNumber: "SO-000001", createdAt: "2026-10-01T10:00:00.000Z", status: "COMPLETED", total: "90000.00", channel: "FACEBOOK", token: null },
    ],
    total: 2,
    page: 1,
    pageSize: 10,
  });
  pointsMock.mockResolvedValue({
    items: [{ createdAt: "2026-10-10T10:00:00.000Z", type: "EARN", points: 15, balanceAfter: 1250, orderNumber: "SO-000002" }],
    total: 1,
    page: 1,
    pageSize: 10,
  });
});

describe("AccountView — ຍັງບໍ່ເຂົ້າລະບົບ", () => {
  beforeEach(() => {
    fetchMemberMock.mockRejectedValue(required());
  });

  it("ສະແດງຟອມເຂົ້າສູ່ລະບົບ ແລະ ຄຳອະທິບາຍວິທີເປີດບັນຊີ", async () => {
    render(<AccountView loyalty={loyalty} />);
    expect(await screen.findByRole("form", { name: "ເຂົ້າສູ່ລະບົບ" })).toBeInTheDocument();
    const pin = screen.getByLabelText(/PIN 6 ຕົວ/);
    expect(pin).toHaveAttribute("inputmode", "numeric");
    expect(pin).toHaveAttribute("autocomplete", "off");
    expect(screen.getByText(/ບັນຊີຈະເປີດໃຊ້ໄດ້ຫຼັງຈາກທ່ານສັ່ງຊື້ ແລະ ຊຳລະເງິນເທິງເວັບແລ້ວ/)).toBeInTheDocument();
    expect(screen.getByText(/ລືມ PIN\? ຕິດຕໍ່ຮ້ານເພື່ອ reset/)).toBeInTheDocument();
  });

  it("ກວດເບີ ແລະ PIN ກ່ອນສົ່ງ", async () => {
    const user = userEvent.setup();
    render(<AccountView loyalty={loyalty} />);
    await user.type(await screen.findByLabelText(/ເບີໂທ/), "12");
    await user.type(screen.getByLabelText(/PIN 6 ຕົວ/), "12a3");
    await user.click(screen.getByRole("button", { name: "ເຂົ້າສູ່ລະບົບ" }));
    expect(screen.getByText("ເບີໂທບໍ່ຖືກຕ້ອງ (ຕົວເລກ 6–15 ຫຼັກ)")).toBeInTheDocument();
    expect(screen.getByText("PIN ຕ້ອງເປັນຕົວເລກ 6 ຕົວ")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("ເຂົ້າສູ່ລະບົບສຳເລັດ: ເບີ normalize ແລ້ວ → ສະແດງໜ້າບັນຊີ", async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ member: member() });
    render(<AccountView loyalty={loyalty} />);
    await user.type(await screen.findByLabelText(/ເບີໂທ/), "020 5555-5555");
    await user.type(screen.getByLabelText(/PIN 6 ຕົວ/), "123456");
    await user.click(screen.getByRole("button", { name: "ເຂົ້າສູ່ລະບົບ" }));
    expect(loginMock).toHaveBeenCalledWith("02055555555", "123456");
    expect(await screen.findByText("1,250 ແຕ້ມ")).toBeInTheDocument();
  });

  it.each([
    [new ClientApiError(401, "MEMBER_LOGIN_FAILED"), "ເບີໂທ ຫຼື PIN ບໍ່ຖືກຕ້ອງ"],
    [new ClientApiError(429, "MEMBER_LOCKED", { code: "MEMBER_LOCKED", retryAfterSeconds: 610 }), "ໃສ່ PIN ຜິດຫຼາຍເທື່ອ ກະລຸນາລອງໃໝ່ໃນອີກ 11 ນາທີ"],
    [new ClientApiError(429, "TOO_MANY_ATTEMPTS"), "ມີການໃຊ້ງານຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າຈັກໜ້ອຍແລ້ວລອງໃໝ່"],
    [new ClientApiError(400, "VALIDATION_ERROR"), "ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"],
  ])("error %# → ຂໍ້ຄວາມທີ່ເໝາະສົມ ແລະ ລ້າງ PIN", async (error, message) => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(error);
    render(<AccountView loyalty={loyalty} />);
    await user.type(await screen.findByLabelText(/ເບີໂທ/), "02055555555");
    await user.type(screen.getByLabelText(/PIN 6 ຕົວ/), "000000");
    await user.click(screen.getByRole("button", { name: "ເຂົ້າສູ່ລະບົບ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText(/PIN 6 ຕົວ/)).toHaveValue("");
  });
});

describe("AccountView — ເຂົ້າລະບົບແລ້ວ", () => {
  it("ແຕ້ມ + ມູນຄ່າ, ລະດັບ + ຕົວຄູນ, ຄວາມຄືບໜ້າ, ປະຫວັດບິນ ແລະ ແຕ້ມ", async () => {
    fetchMemberMock.mockResolvedValue(member());
    render(<AccountView loyalty={loyalty} />);
    const summary = await screen.findByRole("region", { name: "ແຕ້ມສະສົມ" });
    expect(within(summary).getByText("1,250 ແຕ້ມ")).toBeInTheDocument();
    expect(within(summary).getByText("ມູນຄ່າ 125,000 ກີບ")).toBeInTheDocument();
    expect(within(summary).getByText(/ລະດັບ Bronze/)).toBeInTheDocument();
    expect(within(summary).getByText(/ແຕ້ມ ×1/)).toBeInTheDocument();
    const bar = within(summary).getByRole("progressbar", { name: "ຄວາມຄືບໜ້າສູ່ລະດັບ Silver" });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(within(summary).getByText("ຊື້ອີກ 1,500,000 ກີບ ເພື່ອຂຶ້ນເປັນ Silver")).toBeInTheDocument();

    const orders = screen.getByRole("region", { name: "ປະຫວັດການສັ່ງຊື້" });
    expect(await within(orders).findByRole("link", { name: /SO-000002/ })).toHaveAttribute("href", "/orders/tok2");
    expect(within(orders).getByText("SO-000001").closest("a")).toBeNull();
    const points = screen.getByRole("region", { name: "ປະຫວັດແຕ້ມ" });
    expect(await within(points).findByText("ໄດ້ຈາກບິນ")).toBeInTheDocument();
    expect(within(points).getByText("+15 ແຕ້ມ")).toBeInTheDocument();
  });

  it("ຮອດເກນແລ້ວ (remaining 0) → ບອກວ່າຈະຂຶ້ນລະດັບຮອບຄຳນວນຕໍ່ໄປ", async () => {
    fetchMemberMock.mockResolvedValue(member({ spend12m: "2100000.00", nextTier: { tier: "SILVER", minSpend: "2000000.00", remaining: "0.00" } }));
    render(<AccountView loyalty={loyalty} />);
    expect(await screen.findByText("ຈະຂຶ້ນເປັນ Silver ໃນການຄຳນວນຮອບຕໍ່ໄປ")).toBeInTheDocument();
    expect(screen.queryByText(/ຊື້ອີກ/)).not.toBeInTheDocument();
  });

  it("ລະບົບແຕ້ມປິດ → ບໍ່ສະແດງແຕ້ມ/ລະດັບ ແຕ່ຍັງມີປະຫວັດບິນ", async () => {
    fetchMemberMock.mockResolvedValue(member());
    render(<AccountView loyalty={{ enabled: false }} />);
    expect(await screen.findByRole("region", { name: "ປະຫວັດການສັ່ງຊື້" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "ແຕ້ມສະສົມ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "ປະຫວັດແຕ້ມ" })).not.toBeInTheDocument();
    expect(pointsMock).not.toHaveBeenCalled();
  });

  it("ໂຫຼດເພີ່ມ → ຂໍໜ້າຖັດໄປ ແລະ ຕໍ່ທ້າຍລາຍການ", async () => {
    const user = userEvent.setup();
    fetchMemberMock.mockResolvedValue(member());
    const row = (n: number) => ({ orderNumber: `SO-${n}`, createdAt: "2026-10-10T10:00:00.000Z", status: "PAID" as const, total: "1.00", channel: "STOREFRONT" as const, token: `t${n}` });
    ordersMock.mockResolvedValueOnce({ items: [row(1)], total: 2, page: 1, pageSize: 1 }).mockResolvedValueOnce({ items: [row(2)], total: 2, page: 2, pageSize: 1 });
    render(<AccountView loyalty={{ enabled: false }} />);
    await user.click(await screen.findByRole("button", { name: "ໂຫຼດເພີ່ມ" }));
    expect(await screen.findByText("SO-2")).toBeInTheDocument();
    expect(screen.getByText("SO-1")).toBeInTheDocument();
    expect(ordersMock).toHaveBeenLastCalledWith(2);
    expect(screen.queryByRole("button", { name: "ໂຫຼດເພີ່ມ" })).not.toBeInTheDocument();
  });

  it("ອອກຈາກລະບົບ → ເອີ້ນ logout ແລ້ວກັບໄປຟອມເຂົ້າສູ່ລະບົບ", async () => {
    const user = userEvent.setup();
    fetchMemberMock.mockResolvedValue(member());
    logoutMock.mockResolvedValue(undefined);
    render(<AccountView loyalty={loyalty} />);
    await user.click(await screen.findByRole("button", { name: "ອອກຈາກລະບົບ" }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("form", { name: "ເຂົ້າສູ່ລະບົບ" })).toBeInTheDocument();
  });

  it("session ໝົດອາຍຸລະຫວ່າງໂຫຼດປະຫວັດ → ກັບໄປຟອມພ້ອມບອກໃຫ້ເຂົ້າລະບົບໃໝ່", async () => {
    fetchMemberMock.mockResolvedValue(member());
    ordersMock.mockReset();
    ordersMock.mockRejectedValue(required());
    render(<AccountView loyalty={loyalty} />);
    expect(await screen.findByRole("form", { name: "ເຂົ້າສູ່ລະບົບ" })).toBeInTheDocument();
    expect(screen.getByText("ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່")).toBeInTheDocument();
  });

  it("ໂຫຼດບັນຊີບໍ່ໄດ້ (ເຄືອຂ່າຍ) → ຂໍ້ຄວາມ + ລອງໃໝ່", async () => {
    const user = userEvent.setup();
    fetchMemberMock.mockRejectedValueOnce(new ClientApiError(0, "NETWORK")).mockResolvedValueOnce(member());
    render(<AccountView loyalty={loyalty} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("ເຊື່ອມຕໍ່ບໍ່ໄດ້");
    await user.click(screen.getByRole("button", { name: "ລອງໃໝ່" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "ແຕ້ມສະສົມ" })).toBeInTheDocument());
  });
});
