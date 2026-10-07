import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedCatalog, seedLiveSession } from "./helpers";

describe("cf engine migration", () => {
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

  it("ລະຫັດຊ້ຳໃນ session ດຽວກັນບໍ່ໄດ້ ແຕ່ຕ່າງ session ໃຊ້ໄດ້", async () => {
    const f = await seedCatalog(db);
    const a = await seedLiveSession(db, { externalPostId: "P1", items: [{ code: "A1", variantId: f.v1.id }] });
    const b = await seedLiveSession(db, { status: "DRAFT", externalPostId: null });
    await expect(
      db.liveSessionItem.create({ data: { sessionId: a.id, code: "A1", variantId: f.v2.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
    await db.liveSessionItem.create({ data: { sessionId: b.id, code: "A1", variantId: f.v2.id } });
  });

  it("ຫ້າມ 2 session LIVE ໃຊ້ externalPostId ດຽວກັນ; DRAFT/ENDED ຊ້ຳໄດ້", async () => {
    await seedLiveSession(db, { status: "LIVE", externalPostId: "P1" });
    await expect(seedLiveSession(db, { status: "LIVE", externalPostId: "P1" })).rejects.toMatchObject({ code: "P2002" });
    await seedLiveSession(db, { status: "DRAFT", externalPostId: "P1" });
    await seedLiveSession(db, { status: "ENDED", externalPostId: "P1" });
    await seedLiveSession(db, { status: "LIVE", externalPostId: "P2" });
  });

  it("claimed ຕ້ອງບໍ່ລົບ ແລະ ບໍ່ເກີນ limit (CHECK)", async () => {
    const f = await seedCatalog(db);
    const s = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id, limit: 2 }] });
    const item = s.items[0];
    if (!item) throw new Error("item missing");
    await db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 2 } });
    await expect(db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 3 } })).rejects.toThrow();
    await expect(db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: -1 } })).rejects.toThrow();
  });

  it("externalCommentId ຊ້ຳບໍ່ໄດ້; ລຶບ session ລຶບ items+comments ແລະ ເຮັດໃຫ້ Order.liveSessionId ເປັນ NULL", async () => {
    const f = await seedCatalog(db);
    const s = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }] });
    const order = await db.order.create({
      data: {
        orderNumber: "SO-T1",
        channel: "FACEBOOK",
        source: "LIVE_CF",
        liveSessionId: s.id,
        currency: "LAK",
        subtotal: "0",
        vatRate: "10",
        vatAmount: "0",
        total: "0",
      },
    });
    const comment = (id: string) =>
      db.cfComment.create({
        data: { externalCommentId: id, sessionId: s.id, authorExternalId: "U1", authorName: "U", message: "A1", outcome: "ORDERED", orderId: order.id },
      });
    await comment("C1");
    await expect(comment("C1")).rejects.toMatchObject({ code: "P2002" });
    await db.liveSession.delete({ where: { id: s.id } });
    expect(await db.liveSessionItem.count()).toBe(0);
    expect(await db.cfComment.count()).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).liveSessionId).toBeNull();
  });

  it("Customer.facebookUserId unique (NULL ຫຼາຍແຖວໄດ້)", async () => {
    await db.customer.create({ data: { name: "A", facebookUserId: "U1" } });
    await expect(db.customer.create({ data: { name: "B", facebookUserId: "U1" } })).rejects.toMatchObject({ code: "P2002" });
    await db.customer.create({ data: { name: "C" } });
    await db.customer.create({ data: { name: "D" } });
  });
});
