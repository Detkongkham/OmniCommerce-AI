import type { INestApplication } from "@nestjs/common";
import * as simulator from "@oca/channels/simulator";
import type { PrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CfReplyService } from "../src/modules/live-cf/cf-reply.service";
import { createTestApp, resetDb, seedCatalog, seedLiveSession } from "./helpers";

describe("CfReplyService (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let service: CfReplyService;
  let seq = 0;

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: "app-secret-test",
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "verify-me",
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      FACEBOOK_GRAPH_BASE_URL: graph.url,
    }));
    service = app.get(CfReplyService);
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    graph.reset();
  });

  async function seedOrdered(publicReplyEnabled = true) {
    const { v1, whA } = await seedCatalog(db);
    const session = await seedLiveSession(db, { publicReplyEnabled, items: [{ code: "A1", variantId: v1.id }] });
    seq += 1;
    const order = await db.order.create({
      data: {
        orderNumber: `SO-T${seq}`,
        channel: "FACEBOOK",
        source: "LIVE_CF",
        currency: "LAK",
        subtotal: "200000.00",
        vatRate: "0",
        vatAmount: "0",
        total: "200000.00",
        reservedUntil: new Date(Date.now() + 30 * 60_000),
        items: {
          create: [
            {
              variantId: v1.id,
              warehouseId: whA.id,
              productName: "ເສື້ອ",
              variantName: "ດຳ",
              sku: "SKU-1",
              unitPrice: "100000.00",
              unitCost: "60000.00",
              quantity: 2,
              lineTotal: "200000.00",
            },
          ],
        },
      },
    });
    return { session, order };
  }
  const ledger = (sessionId: string, outcome: "ORDERED" | "OUT_OF_STOCK", orderId: string | null, commentId: string) =>
    db.cfComment.create({
      data: {
        externalCommentId: commentId,
        sessionId,
        authorExternalId: "U1",
        authorName: "User",
        message: "A1 2",
        outcome,
        lines: [{ itemId: "x", code: "A1", quantity: 2 }],
        orderId,
      },
    });

  it("ORDERED: ສົ່ງສະຫຼຸບ private + ຕອບສາທາລະນະ, replyStatus SENT, ສົ່ງຊ້ຳ = no-op", async () => {
    const { session, order } = await seedOrdered();
    const row = await ledger(session.id, "ORDERED", order.id, "P_1_c1");
    await service.deliver(row.id);
    expect(graph.privateReplies).toHaveLength(1);
    expect(graph.privateReplies[0]?.commentId).toBe("P_1_c1");
    expect(graph.privateReplies[0]?.text).toContain(order.orderNumber);
    expect(graph.privateReplies[0]?.text).toContain("200,000 LAK");
    expect(graph.commentReplies).toHaveLength(1);
    expect((await db.cfComment.findUniqueOrThrow({ where: { id: row.id } })).replyStatus).toBe("SENT");
    await service.deliver(row.id);
    expect(graph.privateReplies).toHaveLength(1);
    expect(graph.commentReplies).toHaveLength(1);
  });

  it("private ລົ້ມ → FAILED + ບໍ່ຕອບສາທາລະນະ; ລອງໃໝ່ສຳເລັດ → SENT ແຕ່ບໍ່ຕອບສາທາລະນະ (ບໍ່ແມ່ນຄັ້ງທຳອິດ)", async () => {
    const { session, order } = await seedOrdered();
    const row = await ledger(session.id, "ORDERED", order.id, "P_1_c2");
    graph.failNext({ status: 400, code: 10, subcode: 2018278, message: "(#10) outside window" });
    await service.deliver(row.id);
    const failed = await db.cfComment.findUniqueOrThrow({ where: { id: row.id } });
    expect(failed.replyStatus).toBe("FAILED");
    expect(failed.replyErrorCode).toBeTruthy();
    expect(graph.commentReplies).toHaveLength(0);
    await service.deliver(row.id);
    expect((await db.cfComment.findUniqueOrThrow({ where: { id: row.id } })).replyStatus).toBe("SENT");
    expect(graph.privateReplies).toHaveLength(1);
    expect(graph.commentReplies).toHaveLength(0);
  });

  it("OUT_OF_STOCK: ສົ່ງຂໍ້ຄວາມປະຕິເສດ; publicReplyEnabled=false → ບໍ່ຕອບສາທາລະນະ", async () => {
    const { session } = await seedOrdered(false);
    const row = await ledger(session.id, "OUT_OF_STOCK", null, "P_1_c3");
    await service.deliver(row.id);
    expect(graph.privateReplies[0]?.text).toContain("A1");
    expect(graph.commentReplies).toHaveLength(0);
    expect((await db.cfComment.findUniqueOrThrow({ where: { id: row.id } })).replyStatus).toBe("SENT");
  });

  it("OUT_OF_STOCK + private ລົ້ມ: ຍັງຕອບສາທາລະນະ (ຄັ້ງທຳອິດ)", async () => {
    const { session } = await seedOrdered(true);
    const row = await ledger(session.id, "OUT_OF_STOCK", null, "P_1_c4");
    graph.failNext({ status: 400, code: 100, message: "(#100) bad" });
    await service.deliver(row.id);
    expect((await db.cfComment.findUniqueOrThrow({ where: { id: row.id } })).replyStatus).toBe("FAILED");
    expect(graph.commentReplies).toHaveLength(1);
  });
});
