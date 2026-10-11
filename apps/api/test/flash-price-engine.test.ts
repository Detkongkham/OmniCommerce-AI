import { type PrismaClient, activeFlashPrices, createPrismaClient, effectivePrice } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedCatalog } from "./helpers";

describe("activeFlashPrices / effectivePrice", () => {
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  const NOW = new Date("2026-10-11T10:00:00Z");
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
    f = await seedCatalog(db);
  });

  const sale = (data: { startsAt?: Date; endsAt?: Date; isActive?: boolean; price?: string; variantId?: string } = {}) =>
    db.flashSale.create({
      data: {
        name: "Sale",
        startsAt: data.startsAt ?? at(-60),
        endsAt: data.endsAt ?? at(60),
        isActive: data.isActive ?? true,
        items: { create: { variantId: data.variantId ?? f.v1.id, salePrice: data.price ?? "80" } },
      },
    });
  const priceOf = async (variantId: string, now = NOW) => {
    const prices = await activeFlashPrices(db, [f.v1.id, f.v2.id], now);
    const variant = await db.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    return effectivePrice(variant.price, prices.get(variantId));
  };

  it("ບໍ່ມີແຄມເປນ → ລາຄາປົກກະຕິ; ລາຍການວ່າງບໍ່ query", async () => {
    expect((await activeFlashPrices(db, [], NOW)).size).toBe(0);
    const price = await priceOf(f.v1.id);
    expect(price.price.toFixed(2)).toBe("100.00");
    expect(price).toMatchObject({ flashSaleId: null, saleEndsAt: null });
  });

  it("ແຄມເປນທີ່ກຳລັງດຳເນີນ → ລາຄາພິເສດສະເພາະ variant ໃນແຄມເປນ", async () => {
    const created = await sale();
    const price = await priceOf(f.v1.id);
    expect(price.price.toFixed(2)).toBe("80.00");
    expect(price.regularPrice.toFixed(2)).toBe("100.00");
    expect(price.flashSaleId).toBe(created.id);
    expect(price.saleEndsAt).toEqual(at(60));
    expect((await priceOf(f.v2.id)).flashSaleId).toBeNull();
  });

  it("ຂອບເວລາ: startsAt ລວມ, endsAt ບໍ່ລວມ; ປິດ = ບໍ່ມີຜົນ", async () => {
    await sale({ startsAt: NOW, endsAt: at(10) });
    expect((await priceOf(f.v1.id, new Date(NOW.getTime() - 1))).flashSaleId).toBeNull();
    expect((await priceOf(f.v1.id, NOW)).flashSaleId).not.toBeNull();
    expect((await priceOf(f.v1.id, new Date(at(10).getTime() - 1))).flashSaleId).not.toBeNull();
    expect((await priceOf(f.v1.id, at(10))).flashSaleId).toBeNull();
    await db.flashSale.updateMany({ data: { isActive: false } });
    expect((await priceOf(f.v1.id, NOW)).flashSaleId).toBeNull();
  });

  it("ລາຄາພິເສດບໍ່ຕ່ຳກວ່າລາຄາປົກກະຕິ (ລາຄາປົກກະຕິຖືກຫຼຸດພາຍຫຼັງ) → ໃຊ້ລາຄາປົກກະຕິ ບໍ່ຖືວ່າເປັນ Flash Sale", async () => {
    await sale({ price: "80" });
    await db.productVariant.update({ where: { id: f.v1.id }, data: { price: "80" } });
    expect(await priceOf(f.v1.id)).toMatchObject({ flashSaleId: null });
    await db.productVariant.update({ where: { id: f.v1.id }, data: { price: "70" } });
    expect((await priceOf(f.v1.id)).price.toFixed(2)).toBe("70.00");
  });

  it("ສອງແຄມເປນຊ້ອນກັນ (ຂໍ້ມູນຜິດປົກກະຕິ) → ລາຄາຕ່ຳສຸດ", async () => {
    await sale({ price: "90" });
    const lower = await sale({ price: "75" });
    const price = await priceOf(f.v1.id);
    expect(price.price.toFixed(2)).toBe("75.00");
    expect(price.flashSaleId).toBe(lower.id);
  });
});
