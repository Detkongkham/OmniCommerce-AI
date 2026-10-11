import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

describe("storefront migration", () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
  });

  const order = (data: object = {}) =>
    db.order.create({
      data: {
        orderNumber: `SO-${Math.random().toString(36).slice(2, 8)}`,
        channel: "STOREFRONT",
        source: "WEB_CHECKOUT",
        currency: "LAK",
        subtotal: "0",
        vatRate: "0",
        vatAmount: "0",
        total: "0",
        ...data,
      },
    });

  it("publicToken ຊ້ຳບໍ່ໄດ້ ແຕ່ NULL ຫຼາຍແຖວໄດ້", async () => {
    await order({ publicToken: "t1" });
    await expect(order({ publicToken: "t1" })).rejects.toMatchObject({ code: "P2002" });
    await order();
    await order();
    expect(await db.order.count()).toBe(3);
  });

  it("ລຶບ courier → shippingCourierId ເປັນ NULL (ບິນຍັງຢູ່)", async () => {
    const courier = await db.courier.create({ data: { code: "ANS", name: "Anousith" } });
    const created = await order({ shippingCourierId: courier.id, shippingBranch: "ໂພນທັນ" });
    await db.courier.delete({ where: { id: courier.id } });
    const after = await db.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.shippingCourierId).toBeNull();
    expect(after.shippingBranch).toBe("ໂພນທັນ");
  });

  it("PaymentSlip ຮັບ source STOREFRONT", async () => {
    const slip = await db.paymentSlip.create({
      data: { source: "STOREFRONT", imageKey: "slips/k", imageMime: "image/png", imageBytes: 10, imageSha256: "a".repeat(64) },
    });
    expect(slip.source).toBe("STOREFRONT");
  });
});
