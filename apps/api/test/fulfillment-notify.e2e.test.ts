import type { INestApplication } from "@nestjs/common";
import * as simulator from "@oca/channels/simulator";
import { type PrismaClient, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedConversation, seedRoleUsers } from "./helpers";

const OUTSIDE_WINDOW = { status: 400, code: 10, subcode: 2018278, message: "(#10) This message is sent outside of allowed window." };

describe("fulfillment tracking notification (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let owner: { Authorization: string };
  let wh: { Authorization: string };
  let courierId: string;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: "s",
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "v",
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      FACEBOOK_GRAPH_BASE_URL: graph.url,
    }));
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    graph.reset();
    await seedRoleUsers(db);
    f = await seedCatalog(db);
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 10 }));
    owner = await bearerFor(app, "owner@role.test");
    wh = await bearerFor(app, "warehouse@role.test");
    courierId = (await db.courier.create({ data: { code: "AN", name: "Anousith", trackingUrlTemplate: "https://an.la/t/{tracking}" } })).id;
  });

  /** ບິນທີ່ກວດແພັກແລ້ວ (PACKING + verified) ພ້ອມສົ່ງ */
  async function readyOrder() {
    const created = await request(server())
      .post("/orders")
      .set(owner)
      .send({ customer: { name: "Noy", phone: "02055551234" }, items: [{ variantId: f.v1.id, quantity: 1 }], shippingName: "Noy", shippingPhone: "02055551234" })
      .expect(201);
    const id = created.body.id as string;
    await request(server()).post(`/orders/${id}/pay`).set(owner).expect(200);
    await request(server()).post(`/fulfillment/${id}/start`).set(wh).expect(200);
    await request(server()).post(`/fulfillment/${id}/verify`).set(wh).send({ scans: [{ code: "SKU-1", quantity: 1 }] }).expect(200);
    const order = await db.order.findUniqueOrThrow({ where: { id } });
    return { id, orderNumber: order.orderNumber, customerId: order.customerId as string };
  }
  const ship = (id: string) => request(server()).post(`/fulfillment/${id}/ship`).set(wh).send({ courierId, trackingNumber: "AN123" });
  const notify = (id: string, body: object = {}) => request(server()).post(`/fulfillment/${id}/notify`).set(wh).send(body);

  it("ບິນເປີດຈາກແຊັດ (conversationId): ສົ່ງ tracking ເຂົ້າເຄສນັ້ນ → SENT ແລະ ຂໍ້ຄວາມຢູ່ Inbox", async () => {
    const order = await readyOrder();
    const conversation = await seedConversation(db, { externalThreadId: "PSID_CHAT" });
    await db.order.update({ where: { id: order.id }, data: { conversationId: conversation.id } });
    const res = await ship(order.id).expect(200);
    expect(res.body.shipment).toMatchObject({ notifyStatus: "SENT", notifyErrorCode: null });
    expect(graph.sent).toHaveLength(1);
    expect(graph.sent[0]).toMatchObject({ recipientId: "PSID_CHAT" });
    expect(graph.sent[0]?.text).toContain("AN123");
    expect(graph.sent[0]?.text).toContain("https://an.la/t/AN123");
    const message = await db.message.findFirstOrThrow({ where: { conversationId: conversation.id } });
    expect(message).toMatchObject({ direction: "OUT", status: "SENT" });
    expect(message.text).toContain(order.orderNumber);
  });

  it("ບໍ່ມີ conversationId: ໃຊ້ເຄສ FACEBOOK ຫຼ້າສຸດຂອງລູກຄ້າ", async () => {
    const order = await readyOrder();
    await seedConversation(db, { externalThreadId: "OLD", customerId: order.customerId, lastMessageAt: new Date(Date.now() - 3600_000) });
    await seedConversation(db, { externalThreadId: "NEW", customerId: order.customerId, lastMessageAt: new Date() });
    await ship(order.id).expect(200);
    expect(graph.sent.map((sent) => sent.recipientId)).toEqual(["NEW"]);
  });

  it("ບໍ່ມີແຊັດຂອງລູກຄ້າເລີຍ → MANUAL (ສົ່ງອອກສຳເລັດ, notifyText ໃຫ້ copy)", async () => {
    const order = await readyOrder();
    const res = await ship(order.id).expect(200);
    expect(res.body.status).toBe("SHIPPED");
    expect(res.body.shipment.notifyStatus).toBe("MANUAL");
    expect(res.body.notifyText).toContain("AN123");
    expect(graph.sent).toHaveLength(0);
  });

  it("ເກີນ 24 ຊມ → FAILED (OUTSIDE_WINDOW) ແຕ່ສົ່ງອອກສຳເລັດ; ສົ່ງໃໝ່ → SENT; SENT ແລ້ວສົ່ງຊ້ຳຕ້ອງ force", async () => {
    const order = await readyOrder();
    await seedConversation(db, { externalThreadId: "PSID_1", customerId: order.customerId });
    graph.failNext(OUTSIDE_WINDOW);
    const shipped = await ship(order.id).expect(200);
    expect(shipped.body.status).toBe("SHIPPED");
    expect(shipped.body.shipment).toMatchObject({ notifyStatus: "FAILED", notifyErrorCode: "OUTSIDE_WINDOW" });

    const retried = await notify(order.id).expect(200);
    expect(retried.body.shipment).toMatchObject({ notifyStatus: "SENT", notifyErrorCode: null });
    expect((await notify(order.id).expect(409)).body.code).toBe("CONFLICT");
    await notify(order.id, { force: true }).expect(200);
    expect(graph.sent).toHaveLength(2);
  });

  it("notify ກ່ອນສົ່ງອອກ → 409 ORDER_INVALID_STATE; ບໍ່ມີສິດ write → 403", async () => {
    const order = await readyOrder();
    expect((await notify(order.id).expect(409)).body.code).toBe("ORDER_INVALID_STATE");
    const accountant = await bearerFor(app, "accountant@role.test");
    await request(server()).post(`/fulfillment/${order.id}/notify`).set(accountant).send({}).expect(403);
  });
});
