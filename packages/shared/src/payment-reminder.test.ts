import { describe, expect, it } from "vitest";
import { buildPaymentReminderMessage } from "./payment-reminder";
import { updateStoreSettingsSchema } from "./schemas/inventory";

describe("buildPaymentReminderMessage", () => {
  const base = { orderNumber: "SO-000012", total: "180000.00", currency: "LAK", minutesLeft: 10, paymentInstructions: "BCEL 010-12-00-0123" };

  it("ມີເລກບິນ, ຍອດ (ຄັ່ນຫຼັກພັນ, ບໍ່ມີ .00), ນາທີທີ່ເຫຼືອ ແລະ ຂໍ້ມູນໂອນ", () => {
    const text = buildPaymentReminderMessage(base);
    expect(text).toContain("SO-000012");
    expect(text).toContain("180,000 LAK");
    expect(text).toContain("10 ນາທີ");
    expect(text).toContain("BCEL 010-12-00-0123");
  });

  it("ບໍ່ມີຂໍ້ມູນໂອນ → ບໍ່ມີແຖວວ່າງ; ນາທີຕ່ຳສຸດ 1; ເສດຍັງສະແດງ", () => {
    const text = buildPaymentReminderMessage({ ...base, paymentInstructions: null, minutesLeft: 0, total: "1500.50" });
    expect(text.split("\n")).toHaveLength(4);
    expect(text).toContain("1 ນາທີ");
    expect(text).toContain("1,500.50 LAK");
  });
});

describe("updateStoreSettingsSchema: paymentReminderMinutes", () => {
  it("1..1440 ຫຼື null (ປິດ)", () => {
    expect(updateStoreSettingsSchema.parse({ paymentReminderMinutes: 10 })).toEqual({ paymentReminderMinutes: 10 });
    expect(updateStoreSettingsSchema.parse({ paymentReminderMinutes: null })).toEqual({ paymentReminderMinutes: null });
    for (const value of [0, 1441, 2.5, "10"]) {
      expect(updateStoreSettingsSchema.safeParse({ paymentReminderMinutes: value }).success).toBe(false);
    }
  });
});
