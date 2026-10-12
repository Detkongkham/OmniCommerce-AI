import { screen, waitFor } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { StoreSettingsDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { LoyaltySettingsCard } from "./loyalty-settings-card";

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

const base: StoreSettingsDto = {
  name: "OCA",
  baseCurrency: "LAK",
  vatRate: "10.00",
  pricesIncludeVat: true,
  reservationMinutes: 30,
  paymentReminderMinutes: null,
  receivingAccounts: [],
  paymentInstructions: null,
};
const configured: StoreSettingsDto = {
  ...base,
  loyaltyEnabled: true,
  pointsEarnPer: "5000.00",
  pointValue: "50.00",
  pointsMaxRedeemPercent: 30,
  tierRules: [
    { tier: "BRONZE", minSpend: "0", multiplier: "1" },
    { tier: "SILVER", minSpend: "1000000", multiplier: "1.5" },
    { tier: "GOLD", minSpend: "3000000", multiplier: "2" },
    { tier: "PLATINUM", minSpend: "6000000", multiplier: "3" },
  ],
};

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(configured);
  vi.mocked(toast.success).mockReset();
});

describe("LoyaltySettingsCard", () => {
  it("ຄ່າເລີ່ມຕົ້ນເມື່ອ API ຍັງບໍ່ສົ່ງ field ແຕ້ມ: ປິດ, 10000, 100, 50%, 4 ລະດັບ + ຕົວຢ່າງ", () => {
    renderWithProviders(<LoyaltySettingsCard settings={base} />);
    expect(screen.getByRole("switch", { name: "Enable points" })).not.toBeChecked();
    expect(screen.getByLabelText("Spend per 1 point (LAK)")).toHaveValue("10000");
    expect(screen.getByLabelText("Value of 1 point when spent (LAK)")).toHaveValue("100");
    expect(screen.getByLabelText("Max points discount (% of merchandise)")).toHaveValue("50");
    expect(screen.getByLabelText("Minimum spend for Bronze")).toBeDisabled();
    expect(screen.getByLabelText("Minimum spend for Silver")).toHaveValue("2000000");
    expect(screen.getByLabelText("Multiplier for Platinum")).toHaveValue("2");
    expect(screen.getByText("Example: a 100,000.00 LAK order earns 10 points (Bronze), worth 1,000.00 LAK off")).toBeInTheDocument();
  });

  it("ແກ້ ແລ້ວບັນທຶກ: PATCH ສະເພາະ field ຂອງແຕ້ມ", async () => {
    const { user } = renderWithProviders(<LoyaltySettingsCard settings={configured} />);
    await user.click(screen.getByRole("switch", { name: "Enable points" }));
    const earn = screen.getByLabelText("Spend per 1 point (LAK)");
    await user.clear(earn);
    await user.type(earn, "8000");
    const gold = screen.getByLabelText("Multiplier for Gold");
    await user.clear(gold);
    await user.type(gold, "2.5");
    await user.click(screen.getByRole("button", { name: "Save points settings" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Points settings saved"));
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/settings/store", {
      method: "PATCH",
      body: {
        loyaltyEnabled: false,
        pointsEarnPer: "8000",
        pointValue: "50",
        pointsMaxRedeemPercent: 30,
        tierRules: [
          { tier: "BRONZE", minSpend: "0", multiplier: "1" },
          { tier: "SILVER", minSpend: "1000000", multiplier: "1.5" },
          { tier: "GOLD", minSpend: "3000000", multiplier: "2.5" },
          { tier: "PLATINUM", minSpend: "6000000", multiplier: "3" },
        ],
      },
    });
  });

  it("ຄ່າຜິດ: ບອກຊ່ອງທີ່ຜິດ ແລະ ບໍ່ຍິງ API", async () => {
    const { user } = renderWithProviders(<LoyaltySettingsCard settings={configured} />);
    await user.clear(screen.getByLabelText("Spend per 1 point (LAK)"));
    const percent = screen.getByLabelText("Max points discount (% of merchandise)");
    await user.clear(percent);
    await user.type(percent, "150");
    const gold = screen.getByLabelText("Minimum spend for Gold");
    await user.clear(gold);
    await user.type(gold, "500000");
    await user.click(screen.getByRole("button", { name: "Save points settings" }));
    expect(screen.getByText("Enter an amount greater than 0")).toBeInTheDocument();
    expect(screen.getByText("Enter 1–100")).toBeInTheDocument();
    expect(screen.getByText(/Each tier needs a higher minimum/)).toBeInTheDocument();
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
  });

  it("ບໍ່ມີ inventory:write: ອ່ານຢ່າງດຽວ", () => {
    auth.canWrite = false;
    renderWithProviders(<LoyaltySettingsCard settings={configured} />);
    expect(screen.getByRole("switch", { name: "Enable points" })).toBeDisabled();
    expect(screen.getByLabelText("Multiplier for Gold")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save points settings" })).toBeNull();
  });
});
