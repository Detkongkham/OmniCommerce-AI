import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedConversation } from "./helpers";

describe("inbox migration", () => {
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

  it("Conversation ຊ້ຳ (channel, externalThreadId) ບໍ່ໄດ້", async () => {
    await seedConversation(db, { externalThreadId: "T1" });
    await expect(seedConversation(db, { externalThreadId: "T1" })).rejects.toThrow();
  });

  it("Message: externalId ຊ້ຳໃນເຄສດຽວກັນບໍ່ໄດ້ ແຕ່ NULL ຫຼາຍແຖວໄດ້ ແລະ ຕ່າງເຄສໃຊ້ mid ດຽວກັນໄດ້", async () => {
    const a = await seedConversation(db);
    const b = await seedConversation(db);
    const msg = (conversationId: string, externalId: string | null) =>
      db.message.create({ data: { conversationId, direction: "IN", externalId, text: "x" } });
    await msg(a.id, "m1");
    await expect(msg(a.id, "m1")).rejects.toThrow();
    await msg(a.id, null);
    await msg(a.id, null);
    await msg(b.id, "m1");
    expect(await db.message.count()).toBe(4);
  });

  it("ລຶບ Conversation ລຶບ Message ຕາມ (cascade) ແລະ ເຮັດໃຫ້ Order.conversationId ເປັນ NULL", async () => {
    const conversation = await seedConversation(db);
    await db.message.create({ data: { conversationId: conversation.id, direction: "IN", text: "hi" } });
    const order = await db.order.create({
      data: {
        orderNumber: "SO-T1",
        channel: "FACEBOOK",
        source: "CHAT",
        currency: "LAK",
        subtotal: "0",
        vatRate: "0",
        vatAmount: "0",
        total: "0",
        conversationId: conversation.id,
      },
    });
    await db.conversation.delete({ where: { id: conversation.id } });
    expect(await db.message.count()).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).conversationId).toBeNull();
  });

  it("Message.status ເລີ່ມຕົ້ນ SENT; Conversation ເລີ່ມຕົ້ນ OPEN ແລະ unreadCount 0", async () => {
    const conversation = await seedConversation(db);
    const message = await db.message.create({
      data: { conversationId: conversation.id, direction: "OUT", text: "x" },
    });
    expect(message.status).toBe("SENT");
    expect(conversation).toMatchObject({ status: "OPEN", unreadCount: 0 });
  });
});
