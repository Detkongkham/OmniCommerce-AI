import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CouponDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CouponList } from "./coupon-list";
import { couponStatus } from "./coupon-status";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const coupon = (patch: Partial<CouponDto> = {}): CouponDto => ({
  id: "c1",
  code: "NEW10",
  type: "PERCENT",
  value: "10.00",
  maxDiscount: "50000.00",
  minSubtotal: "100000.00",
  startsAt: null,
  endsAt: null,
  usageLimit: 100,
  perPhoneLimit: 1,
  isActive: true,
  note: "New customers",
  usedCount: 3,
  createdAt: "2026-10-11T00:00:00.000Z",
  ...patch,
});
const COUPONS = [coupon(), coupon({ id: "c2", code: "FIX20", type: "FIXED", value: "20000.00", maxDiscount: null, minSubtotal: "0.00", usageLimit: null, perPhoneLimit: null, note: null, usedCount: 0, isActive: false })];

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => (options?.method ? COUPONS[0] : COUPONS)) as typeof apiFetch);
  vi.mocked(toast.success).mockReset();
});

describe("couponStatus", () => {
  const now = new Date("2026-10-11T10:00:00Z");
  it("ປິດ > ໝົດອາຍຸ > ຍັງບໍ່ເລີ່ມ > ໃຊ້ຄົບ > ໃຊ້ໄດ້", () => {
    expect(couponStatus(coupon(), now)).toBe("active");
    expect(couponStatus(coupon({ isActive: false, endsAt: "2020-01-01T00:00:00Z" }), now)).toBe("inactive");
    expect(couponStatus(coupon({ endsAt: "2026-10-11T10:00:00Z" }), now)).toBe("expired");
    expect(couponStatus(coupon({ startsAt: "2026-10-11T10:00:01Z" }), now)).toBe("scheduled");
    expect(couponStatus(coupon({ usageLimit: 3 }), now)).toBe("usedUp");
  });
});

describe("CouponList", () => {
  it("ຕາຕະລາງ: ລະຫັດ, ສ່ວນຫຼຸດ, ເງື່ອນໄຂ, ໃຊ້ແລ້ວ ແລະ ສະຖານະ", async () => {
    renderWithProviders(<CouponList />);
    const row = await screen.findByTestId("row-coupon-c1");
    expect(within(row).getByText("NEW10")).toBeInTheDocument();
    expect(within(row).getByText("New customers")).toBeInTheDocument();
    expect(within(row).getByText("10% (max 50,000.00)")).toBeInTheDocument();
    expect(within(row).getByText("Min. spend 100,000.00 · 1 per phone")).toBeInTheDocument();
    expect(within(row).getByText("3 / 100")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    const fixed = screen.getByTestId("row-coupon-c2");
    expect(within(fixed).getByText("20,000.00 LAK")).toBeInTheDocument();
    expect(within(fixed).getByText("None")).toBeInTheDocument();
    expect(within(fixed).getByText("No limit")).toBeInTheDocument();
    expect(within(fixed).getByText("Off")).toBeInTheDocument();
  });

  it("ສ້າງ: validate ຝັ່ງ client ແລ້ວ POST (ລະຫັດຕົວພິມໃຫຍ່, ຊ່ອງວ່າງ = null, minSubtotal ວ່າງ = 0)", async () => {
    const { user } = renderWithProviders(<CouponList />);
    await user.click(await screen.findByRole("button", { name: "New code" }));
    await user.type(screen.getByLabelText(/^Code/), "x");
    await user.type(screen.getByLabelText(/^Discount \(/), "150");
    await user.type(screen.getByLabelText(/^Total uses/), "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Use A-Z 0-9 _ - only, 3–30 characters")).toBeInTheDocument();
    expect(screen.getByText("Must be a whole number from 1 to 100")).toBeInTheDocument();
    expect(screen.getByText("Must be a whole number of at least 1")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/coupons", expect.objectContaining({ method: "POST" }));

    await user.clear(screen.getByLabelText(/^Code/));
    await user.type(screen.getByLabelText(/^Code/), "summer15");
    await user.clear(screen.getByLabelText(/^Discount \(/));
    await user.type(screen.getByLabelText(/^Discount \(/), "15");
    await user.clear(screen.getByLabelText(/^Total uses/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/coupons", {
        method: "POST",
        body: {
          code: "SUMMER15",
          type: "PERCENT",
          value: "15",
          maxDiscount: null,
          minSubtotal: "0",
          startsAt: null,
          endsAt: null,
          usageLimit: null,
          perPhoneLimit: null,
          isActive: true,
          note: null,
        },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Discount code created");
  });

  it("ຊະນິດຈຳນວນເງິນ: ບໍ່ມີຊ່ອງຫຼຸດສູງສຸດ ແລະ ບໍ່ສົ່ງ maxDiscount", async () => {
    const { user } = renderWithProviders(<CouponList />);
    await user.click(await screen.findByRole("button", { name: "New code" }));
    await user.type(screen.getByLabelText(/^Maximum discount/), "500");
    await user.selectOptions(screen.getByLabelText(/^Type/), "FIXED");
    expect(screen.queryByLabelText(/^Maximum discount/)).toBeNull();
    await user.type(screen.getByLabelText(/^Code/), "fix20");
    await user.type(screen.getByLabelText(/^Discount \(/), "20000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/coupons", expect.objectContaining({ method: "POST" })));
    const call = vi.mocked(apiFetch).mock.calls.find(([, options]) => (options as { method?: string } | undefined)?.method === "POST");
    expect((call?.[1] as { body: Record<string, unknown> }).body).toMatchObject({ type: "FIXED", value: "20000", maxDiscount: null });
  });

  it("ແກ້ໂຄດທີ່ຖືກໃຊ້ແລ້ວ: ລະຫັດ/ຊະນິດ/ສ່ວນຫຼຸດ ຖືກລັອກ; ປິດໂຄດ → PATCH", async () => {
    const { user } = renderWithProviders(<CouponList />);
    await user.click(await screen.findByRole("button", { name: "Edit NEW10" }));
    expect(screen.getByLabelText(/^Code/)).toBeDisabled();
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();
    expect(screen.getByLabelText(/^Discount \(/)).toBeDisabled();
    expect(screen.getByText("This code has been used, so its code, type and discount cannot be changed")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Minimum spend/)).toHaveValue("100000");
    await user.click(screen.getByLabelText("Active"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/coupons/c1", expect.objectContaining({ method: "PATCH" })));
    const call = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/coupons/c1");
    expect((call?.[1] as { body: Record<string, unknown> }).body).toMatchObject({ code: "NEW10", isActive: false, usageLimit: 100, perPhoneLimit: 1, maxDiscount: "50000", minSubtotal: "100000" });
    expect(toast.success).toHaveBeenCalledWith("Discount code saved");
  });

  it("API error → alert ໃນຟອມ (ຟອມບໍ່ປິດ)", async () => {
    const { user } = renderWithProviders(<CouponList />);
    await user.click(await screen.findByRole("button", { name: "Edit FIX20" }));
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(409, "x", [], "COUPON_IN_USE"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This coupon has been used");
    expect(screen.getByLabelText(/^Code/)).toBeInTheDocument();
  });

  it("ບໍ່ມີ promotion:write: ບໍ່ມີປຸ່ມສ້າງ/ແກ້; ລາຍການວ່າງ → ຂໍ້ຄວາມ", async () => {
    auth.canWrite = false;
    vi.mocked(apiFetch).mockResolvedValue([] as never);
    renderWithProviders(<CouponList />);
    expect(await screen.findByText("No discount codes yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New code" })).toBeNull();
  });
});
