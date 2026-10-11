import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedLiveSession, seedRoleUsers } from "./helpers";

type OrderStatus = "PENDING_PAYMENT" | "PAID" | "PACKING" | "SHIPPED" | "COMPLETED" | "CANCELLED" | "EXPIRED";
type Outcome = "ORDERED" | "NO_MATCH" | "OUT_OF_STOCK" | "LIMIT_REACHED" | "ERROR";

describe("live host snapshot (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let auth: { Authorization: string };
  const server = () => app.getHttpServer();
  let seq = 0;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    f = await seedCatalog(db);
    auth = await bearerFor(app, "chat_admin@role.test");
  });

  const stock = (variantId: string, warehouseId: string, onHand: number, reserved = 0) =>
    db.stockLevel.create({ data: { variantId, warehouseId, onHand, reserved } });
  const order = (sessionId: string | null, status: OrderStatus, total: string) =>
    db.order.create({
      data: {
        orderNumber: `T-${(seq += 1)}`,
        channel: "FACEBOOK",
        source: "LIVE_CF",
        status,
        currency: "LAK",
        subtotal: total,
        vatRate: "0",
        vatAmount: "0",
        total,
        liveSessionId: sessionId,
      },
    });
  const comment = (sessionId: string, author: string, outcome: Outcome, createdAt: Date, message = "A1") =>
    db.cfComment.create({
      data: {
        externalCommentId: `c-${(seq += 1)}`,
        sessionId,
        authorExternalId: author,
        authorName: `Name ${author}`,
        message,
        outcome,
        lines: outcome === "ORDERED" ? [{ itemId: "x", code: "A1", quantity: 1 }] : undefined,
        createdAt,
      },
    });
  const host = (id: string) => request(server()).get(`/live-sessions/${id}/host`).set(auth);

  it("items: remaining = min(limit−claimed, ສະຕ໋ອກສາງຫຼັກ), level, ລາຄາ/ຮູບ; featured", async () => {
    await db.product.update({ where: { id: f.product.id }, data: { images: { create: [{ url: "https://cdn/p2.jpg", position: 2 }, { url: "https://cdn/p1.jpg", position: 1 }] } } });
    await db.productImage.create({ data: { productId: f.product.id, variantId: f.v2.id, url: "https://cdn/v2.jpg", position: 9 } });
    await stock(f.v1.id, f.whA.id, 10, 2); // ສາງຫຼັກ: ຂາຍໄດ້ 8
    await stock(f.v1.id, f.whB.id, 50); // ສາງອື່ນບໍ່ນັບ
    await stock(f.v2.id, f.whA.id, 3, 1); // ຂາຍໄດ້ 2
    const session = await seedLiveSession(db, {
      items: [
        { code: "A1", variantId: f.v1.id, limit: 5 },
        { code: "B2", variantId: f.v2.id },
      ],
    });
    const [a1, b2] = session.items;
    await db.liveSessionItem.update({ where: { id: a1!.id }, data: { claimed: 5 } });
    await db.liveSession.update({ where: { id: session.id }, data: { featuredItemId: b2!.id } });

    const res = await host(session.id).expect(200);
    expect(res.body.session).toMatchObject({ id: session.id, title: "Test Live", status: "LIVE", kind: "LIVE", featuredItemId: b2!.id });
    expect(res.body.items).toEqual([
      expect.objectContaining({ id: a1!.id, code: "A1", sku: "SKU-1", productName: "Product", price: "100.00", imageUrl: "https://cdn/p1.jpg", limit: 5, claimed: 5, stockAvailable: 8, remaining: 0, level: "SOLD_OUT" }),
      expect.objectContaining({ id: b2!.id, code: "B2", imageUrl: "https://cdn/v2.jpg", limit: null, claimed: 0, stockAvailable: 2, remaining: 2, level: "LOW" }),
    ]);
  });

  it("ບໍ່ມີສາງຫຼັກ: stockAvailable = null; ບໍ່ມີ limit ດ້ວຍ → remaining = null, level OK", async () => {
    await db.warehouse.update({ where: { id: f.whA.id }, data: { isDefault: false } });
    const session = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }, { code: "B2", variantId: f.v2.id, limit: 10 }] });
    const res = await host(session.id).expect(200);
    expect(res.body.items[0]).toMatchObject({ stockAvailable: null, remaining: null, level: "OK" });
    expect(res.body.items[1]).toMatchObject({ stockAvailable: null, remaining: 10, level: "OK" });
  });

  it("totals: ຄົນ CF ບໍ່ຊ້ຳ, ບິນບໍ່ນັບຍົກເລີກ/ໝົດເວລາ, ຍອດຈອງ vs ຈ່າຍແລ້ວ, ຈຳນວນຈອງ", async () => {
    const session = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }, { code: "B2", variantId: f.v2.id }] });
    await db.liveSessionItem.updateMany({ where: { sessionId: session.id }, data: { claimed: 3 } });
    const now = Date.now();
    await comment(session.id, "U1", "ORDERED", new Date(now - 5000));
    await comment(session.id, "U1", "ORDERED", new Date(now - 4000));
    await comment(session.id, "U2", "ORDERED", new Date(now - 3000));
    await comment(session.id, "U3", "OUT_OF_STOCK", new Date(now - 2000));
    await comment(session.id, "U4", "NO_MATCH", new Date(now - 1000), "hello");
    await order(session.id, "PENDING_PAYMENT", "100.00");
    await order(session.id, "PENDING_PAYMENT", "50.50");
    await order(session.id, "PAID", "200.00");
    await order(session.id, "COMPLETED", "300.00");
    await order(session.id, "CANCELLED", "999.00");
    await order(session.id, "EXPIRED", "999.00");
    await order(null, "PAID", "999.00"); // ບໍ່ແມ່ນຂອງ session

    const res = await host(session.id).expect(200);
    expect(res.body.totals).toEqual({ buyers: 2, orders: 4, reservedAmount: "150.50", paidAmount: "500.00", unitsClaimed: 6, comments: 5 });
  });

  it("recent: ໃໝ່→ເກົ່າ, ບໍ່ມີ NO_MATCH, ສູງສຸດ 20", async () => {
    const session = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }] });
    const base = Date.now() - 100_000;
    for (let i = 0; i < 22; i += 1) await comment(session.id, `U${i}`, "ORDERED", new Date(base + i * 1000), `A1 #${i}`);
    await comment(session.id, "UX", "NO_MATCH", new Date(base + 50_000), "hi");
    const res = await host(session.id).expect(200);
    expect(res.body.recent).toHaveLength(20);
    expect(res.body.recent[0]).toMatchObject({ authorName: "Name U21", message: "A1 #21", outcome: "ORDERED", lines: [{ code: "A1", quantity: 1 }] });
    expect(res.body.recent.map((row: { outcome: string }) => row.outcome)).not.toContain("NO_MATCH");
    expect(res.body.recent[19].message).toBe("A1 #2");
  });

  it("session ບໍ່ພົບ → 404; ບໍ່ມີ live-cf:read → 403", async () => {
    expect((await host("nope").expect(404)).body.code).toBe("LIVE_SESSION_NOT_FOUND");
    const session = await seedLiveSession(db);
    const warehouse = await bearerFor(app, "warehouse@role.test");
    await request(server()).get(`/live-sessions/${session.id}/host`).set(warehouse).expect(403);
  });
});
