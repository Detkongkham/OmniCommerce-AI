import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedConversation } from "./helpers";

describe("payment slip migration", () => {
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

  const slip = (data: object = {}) =>
    db.paymentSlip.create({
      data: { source: "UPLOAD", imageKey: "slips/k", imageMime: "image/png", imageBytes: 10, imageSha256: "a".repeat(64), ...data },
    });

  it("ຄ່າເລີ່ມຕົ້ນ: PENDING_READ, flags ວ່າງ", async () => {
    const created = await slip();
    expect(created.status).toBe("PENDING_READ");
    expect(created.flags).toEqual([]);
  });

  it("(messageId, attachmentIndex) ຊ້ຳບໍ່ໄດ້ ແຕ່ NULL ຫຼາຍແຖວໄດ້", async () => {
    const conversation = await seedConversation(db);
    const message = await db.message.create({ data: { conversationId: conversation.id, direction: "IN", text: "x" } });
    await slip({ messageId: message.id, attachmentIndex: 0, conversationId: conversation.id });
    await expect(slip({ messageId: message.id, attachmentIndex: 0 })).rejects.toMatchObject({ code: "P2002" });
    await slip({ messageId: message.id, attachmentIndex: 1 });
    await slip();
    await slip();
    expect(await db.paymentSlip.count()).toBe(4);
  });

  it("ລຶບບິນ → orderId ເປັນ NULL (ສະລິບຍັງຢູ່)", async () => {
    const order = await db.order.create({
      data: {
        orderNumber: "SO-S1",
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "0",
        vatRate: "0",
        vatAmount: "0",
        total: "0",
      },
    });
    const created = await slip({ orderId: order.id });
    await db.order.delete({ where: { id: order.id } });
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: created.id } })).orderId).toBeNull();
  });

  it("StoreSetting.receivingAccounts ເລີ່ມຕົ້ນເປັນ []", async () => {
    const setting = await db.storeSetting.create({ data: { id: 1, name: "t" } });
    expect(setting.receivingAccounts).toEqual([]);
  });
});
