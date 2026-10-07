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
    await expect(seedConversation(db, { externalThreadId: "T1" })).rejects.toMatchObject({ code: "P2002" });
  });

  it("Message: externalId ຊ້ຳໃນເຄສດຽວກັນບໍ່ໄດ້ ແຕ່ NULL ຫຼາຍແຖວໄດ້ ແລະ ຕ່າງເຄສໃຊ້ mid ດຽວກັນໄດ້", async () => {
    const a = await seedConversation(db);
    const b = await seedConversation(db);
    const msg = (conversationId: string, externalId: string | null) =>
      db.message.create({ data: { conversationId, direction: "IN", externalId, text: "x" } });
    await msg(a.id, "m1");
    await expect(msg(a.id, "m1")).rejects.toMatchObject({ code: "P2002" });
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

  it("externalThreadId ດຽວກັນໃນຕ່າງ channel ໄດ້", async () => {
    await seedConversation(db, { externalThreadId: "T1" });
    await db.conversation.create({
      data: { channel: "INSTAGRAM", externalThreadId: "T1", displayName: "ig", lastMessageAt: new Date() },
    });
    expect(await db.conversation.count()).toBe(2);
  });

  it("ລຶບ assignee/Customer/sentBy ເຮັດໃຫ້ FK ເປັນ NULL ໂດຍບໍ່ລຶບເຄສ/ຂໍ້ຄວາມ", async () => {
    const role = await db.role.create({ data: { name: "R_TEST" } });
    const assignee = await db.user.create({
      data: { email: "a@test.local", name: "A", passwordHash: "x", roleId: role.id },
    });
    const sender = await db.user.create({
      data: { email: "s@test.local", name: "S", passwordHash: "x", roleId: role.id },
    });
    const customer = await db.customer.create({ data: { name: "C" } });
    const conversation = await seedConversation(db, { assigneeId: assignee.id, customerId: customer.id });
    const message = await db.message.create({
      data: { conversationId: conversation.id, direction: "OUT", text: "x", sentByUserId: sender.id },
    });

    await db.user.delete({ where: { id: assignee.id } });
    await db.customer.delete({ where: { id: customer.id } });
    await db.user.delete({ where: { id: sender.id } });

    const after = await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(after.assigneeId).toBeNull();
    expect(after.customerId).toBeNull();
    expect((await db.message.findUniqueOrThrow({ where: { id: message.id } })).sentByUserId).toBeNull();
  });

  it("Message.attachments (Json) ເກັບແລ້ວອ່ານຄືນໄດ້ຄືເກົ່າ", async () => {
    const conversation = await seedConversation(db);
    const attachments = [
      { type: "image", url: "https://x/y.jpg" },
      { type: "location", url: null },
    ];
    const message = await db.message.create({
      data: { conversationId: conversation.id, direction: "IN", attachments },
    });
    expect((await db.message.findUniqueOrThrow({ where: { id: message.id } })).attachments).toEqual(attachments);
  });
});
