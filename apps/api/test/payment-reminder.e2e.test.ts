import type { INestApplication } from "@nestjs/common";
import * as simulator from "@oca/channels/simulator";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PaymentReminderService } from "../src/modules/promotion/payment-reminder.service";
import { bearerFor, createTestApp, resetDb, seedConversation, seedRoleUsers } from "./helpers";

const OUTSIDE_WINDOW = { status: 400, code: 10, subcode: 2018278, message: "(#10) This message is sent outside of allowed window." };

describe("payment reminders (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let reminders: PaymentReminderService;
  const server = () => app.getHttpServer();
  const NOW = new Date("2026-10-11T10:00:00Z");
  const inMinutes = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: "s",
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "v",
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      FACEBOOK_GRAPH_BASE_URL: graph.url,
    }));
    reminders = app.get(PaymentReminderService);
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    graph.reset();
    await db.storeSetting.create({ data: { id: 1, name: "ຮ້ານ", paymentReminderMinutes: 10, paymentInstructions: "BCEL 010-12-00-0123" } });
  });

  let seq = 0;
  const order = (data: object = {}) => {
    seq += 1;
    return db.order.create({
      data: {
        orderNumber: `SO-R${seq}`,
        channel: "FACEBOOK",
        source: "CHAT",
        currency: "LAK",
        subtotal: "180000",
        vatRate: "0",
        vatAmount: "0",
        total: "180000",
        reservedUntil: inMinutes(8),
        ...data,
      },
    });
  };
  const reload = (id: string) => db.order.findUniqueOrThrow({ where: { id } });

  it("ບິນຈາກແຊັດທີ່ເຫຼືອເວລາບໍ່ເກີນທີ່ຕັ້ງ → ສົ່ງເຂົ້າເຄສນັ້ນ ເທື່ອດຽວ ແລະ ປາກົດໃນ Inbox ເປັນຂໍ້ຄວາມຂອງລະບົບ", async () => {
    const conversation = await seedConversation(db, { externalThreadId: "PSID_1" });
    const created = await order({ conversationId: conversation.id });
    expect(await reminders.runDue(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(graph.sent).toHaveLength(1);
    expect(graph.sent[0]).toMatchObject({ recipientId: "PSID_1" });
    expect(graph.sent[0]?.text).toContain(created.orderNumber);
    expect(graph.sent[0]?.text).toContain("180,000 LAK");
    expect(graph.sent[0]?.text).toContain("8 ນາທີ");
    expect(graph.sent[0]?.text).toContain("BCEL 010-12-00-0123");
    const after = await reload(created.id);
    expect(after).toMatchObject({ paymentReminderStatus: "SENT", paymentReminderAt: NOW });
    const message = await db.message.findFirstOrThrow({ where: { conversationId: conversation.id } });
    expect(message).toMatchObject({ direction: "OUT", status: "SENT", sentByUserId: null });

    expect(await reminders.runDue(inMinutes(1))).toEqual({ sent: 0, failed: 0 });
    expect(graph.sent).toHaveLength(1);
  });

  it("ຍັງບໍ່ຮອດເວລາ, ໝົດເວລາຈອງແລ້ວ ຫຼື ຈ່າຍແລ້ວ → ບໍ່ເຕືອນ; ຮອດເວລາແລ້ວຈຶ່ງເຕືອນ", async () => {
    const conversation = await seedConversation(db);
    const early = await order({ conversationId: conversation.id, reservedUntil: inMinutes(25) });
    await order({ conversationId: conversation.id, reservedUntil: inMinutes(-1) });
    await order({ conversationId: conversation.id, status: "PAID" });
    expect(await reminders.runDue(NOW)).toEqual({ sent: 0, failed: 0 });
    expect(graph.sent).toHaveLength(0);
    expect(await reminders.runDue(inMinutes(15))).toEqual({ sent: 1, failed: 0 });
    expect((await reload(early.id)).paymentReminderStatus).toBe("SENT");
  });

  it("ບິນເວັບ ແລະ ບິນທີ່ສ້າງດ້ວຍມື ບໍ່ຖືກເຕືອນ (ບໍ່ມີຊ່ອງທາງ)", async () => {
    const conversation = await seedConversation(db);
    const web = await order({ channel: "STOREFRONT", source: "WEB_CHECKOUT", conversationId: conversation.id });
    const manual = await order({ channel: "OFFLINE", source: "MANUAL", conversationId: conversation.id });
    expect(await reminders.runDue(NOW)).toEqual({ sent: 0, failed: 0 });
    expect((await reload(web.id)).paymentReminderStatus).toBe("NONE");
    expect((await reload(manual.id)).paymentReminderStatus).toBe("NONE");
  });

  it("ບິນ CF (ບໍ່ມີ conversationId): ສົ່ງເຂົ້າເຄສ Messenger ຫຼ້າສຸດຂອງລູກຄ້າ; ບໍ່ມີເຄສ → FAILED", async () => {
    const customer = await db.customer.create({ data: { name: "ກ", facebookUserId: "FB1" } });
    await seedConversation(db, { externalThreadId: "PSID_OLD", customerId: customer.id, lastMessageAt: new Date("2026-10-01") });
    await seedConversation(db, { externalThreadId: "PSID_NEW", customerId: customer.id, lastMessageAt: new Date("2026-10-10") });
    const cf = await order({ source: "LIVE_CF", customerId: customer.id });
    const lonely = await order({ source: "POST_CF", customerId: (await db.customer.create({ data: { name: "ຂ" } })).id });
    expect(await reminders.runDue(NOW)).toEqual({ sent: 1, failed: 1 });
    expect(graph.sent.map((sent) => sent.recipientId)).toEqual(["PSID_NEW"]);
    expect((await reload(cf.id)).paymentReminderStatus).toBe("SENT");
    expect((await reload(lonely.id)).paymentReminderStatus).toBe("FAILED");
  });

  it("Messenger ປະຕິເສດ (ນອກ 24 ຊມ) → FAILED ແລະ ບໍ່ລອງຊ້ຳ", async () => {
    const conversation = await seedConversation(db);
    const created = await order({ conversationId: conversation.id });
    graph.failNext(OUTSIDE_WINDOW);
    expect(await reminders.runDue(NOW)).toEqual({ sent: 0, failed: 1 });
    expect((await reload(created.id)).paymentReminderStatus).toBe("FAILED");
    expect(await reminders.runDue(inMinutes(1))).toEqual({ sent: 0, failed: 0 });
    expect(graph.sent).toHaveLength(0);
  });

  it("ປິດໃນຕັ້ງຄ່າ (null) → ບໍ່ເຕືອນ; ຕັ້ງ/ປິດຜ່ານ PATCH /settings/store; ໜ້າບິນສະແດງສະຖານະ", async () => {
    await seedRoleUsers(db);
    const owner = await bearerFor(app, "owner@role.test");
    const conversation = await seedConversation(db);
    const created = await order({ conversationId: conversation.id });
    const off = await request(server()).patch("/settings/store").set(owner).send({ paymentReminderMinutes: null }).expect(200);
    expect(off.body.paymentReminderMinutes).toBeNull();
    expect(await reminders.runDue(NOW)).toEqual({ sent: 0, failed: 0 });
    await request(server()).patch("/settings/store").set(owner).send({ paymentReminderMinutes: 0 }).expect(400);
    const on = await request(server()).patch("/settings/store").set(owner).send({ paymentReminderMinutes: 15 }).expect(200);
    expect(on.body.paymentReminderMinutes).toBe(15);
    expect(await reminders.runDue(NOW)).toEqual({ sent: 1, failed: 0 });
    const detail = await request(server()).get(`/orders/${created.id}`).set(owner).expect(200);
    expect(detail.body).toMatchObject({ paymentReminderStatus: "SENT", paymentReminderAt: NOW.toISOString() });
  });
});
