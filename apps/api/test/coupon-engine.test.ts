import { CouponRejectedError, type PrismaClient, createPrismaClient, evaluateCoupon } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

describe("evaluateCoupon", () => {
  let db: PrismaClient;
  const NOW = new Date("2026-10-11T10:00:00Z");

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
  });

  const coupon = (data: object = {}) => db.coupon.create({ data: { code: "NEW10", type: "PERCENT", value: "10", ...data } });
  const order = async (couponId: string, status: string, phone?: string) => {
    const customer = phone ? await db.customer.upsert({ where: { phone }, create: { name: "C", phone }, update: {} }) : null;
    return db.order.create({
      data: {
        orderNumber: `SO-${Math.random().toString(36).slice(2, 8)}`,
        channel: "OFFLINE",
        source: "MANUAL",
        status: status as "PAID",
        currency: "LAK",
        subtotal: "0",
        vatRate: "0",
        vatAmount: "0",
        total: "0",
        couponId,
        customerId: customer?.id,
      },
    });
  };
  const evaluate = (patch: object = {}) => evaluateCoupon(db, { code: "NEW10", merchandiseSubtotal: "100000.00", now: NOW, ...patch });
  const reasonOf = async (run: Promise<unknown>) => {
    const error = await run.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CouponRejectedError);
    return (error as CouponRejectedError).reason;
  };

  it("ໃຊ້ໄດ້: ຄືນ id, ລະຫັດ ແລະ ສ່ວນຫຼຸດ", async () => {
    const created = await coupon();
    await expect(evaluate()).resolves.toEqual({ couponId: created.id, code: "NEW10", discount: "10000.00" });
  });

  it("FIXED ແລະ PERCENT ທີ່ມີເພດານ", async () => {
    await coupon({ code: "FIX", type: "FIXED", value: "20000" });
    await coupon({ code: "CAP", type: "PERCENT", value: "50", maxDiscount: "30000" });
    await expect(evaluate({ code: "FIX" })).resolves.toMatchObject({ discount: "20000.00" });
    await expect(evaluate({ code: "CAP" })).resolves.toMatchObject({ discount: "30000.00" });
  });

  it("ບໍ່ພົບ / ປິດ / ຍັງບໍ່ເລີ່ມ / ໝົດອາຍຸ (ຂອບເວລາ: startsAt ລວມ, endsAt ບໍ່ລວມ)", async () => {
    expect(await reasonOf(evaluate())).toBe("NOT_FOUND");
    await coupon({ code: "OFF", isActive: false });
    expect(await reasonOf(evaluate({ code: "OFF" }))).toBe("INACTIVE");
    await coupon({ code: "SOON", startsAt: new Date(NOW.getTime() + 1) });
    expect(await reasonOf(evaluate({ code: "SOON" }))).toBe("NOT_STARTED");
    await coupon({ code: "START", startsAt: NOW });
    await expect(evaluate({ code: "START" })).resolves.toBeDefined();
    await coupon({ code: "OLD", endsAt: NOW });
    expect(await reasonOf(evaluate({ code: "OLD" }))).toBe("EXPIRED");
    await coupon({ code: "LAST", endsAt: new Date(NOW.getTime() + 1) });
    await expect(evaluate({ code: "LAST" })).resolves.toBeDefined();
  });

  it("ຍອດບໍ່ຮອດຂັ້ນຕ່ຳ → MIN_SUBTOTAL ພ້ອມ minSubtotal; ຮອດພໍດີໃຊ້ໄດ້", async () => {
    await coupon({ minSubtotal: "100000.01" });
    const error = (await evaluate().catch((caught: unknown) => caught)) as CouponRejectedError;
    expect(error.reason).toBe("MIN_SUBTOTAL");
    expect(error.detail).toEqual({ minSubtotal: "100000.01" });
    await expect(evaluate({ merchandiseSubtotal: "100000.01" })).resolves.toBeDefined();
  });

  it("usageLimit ນັບບິນທີ່ບໍ່ແມ່ນ CANCELLED/EXPIRED: ສິດຄືນເມື່ອບິນຖືກຍົກເລີກ ຫຼື ໝົດອາຍຸ", async () => {
    const created = await coupon({ usageLimit: 2 });
    await order(created.id, "PAID");
    const pending = await order(created.id, "PENDING_PAYMENT");
    await order(created.id, "CANCELLED");
    await order(created.id, "EXPIRED");
    expect(await reasonOf(evaluate())).toBe("USAGE_LIMIT");
    await db.order.update({ where: { id: pending.id }, data: { status: "EXPIRED" } });
    await expect(evaluate()).resolves.toBeDefined();
  });

  it("perPhoneLimit: ນັບຕໍ່ເບີ; ບໍ່ມີເບີ → PHONE_REQUIRED; ບໍ່ຮູ້ເບີ (preview) → ຂ້າມ", async () => {
    const created = await coupon({ perPhoneLimit: 1 });
    await order(created.id, "PAID", "02011111111");
    expect(await reasonOf(evaluate({ phone: "02011111111" }))).toBe("PHONE_LIMIT");
    await expect(evaluate({ phone: "02022222222" })).resolves.toBeDefined();
    expect(await reasonOf(evaluate({ phone: null }))).toBe("PHONE_REQUIRED");
    await expect(evaluate()).resolves.toBeDefined();
  });
});
