import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedBasics, seedCatalog } from "./helpers";
import { makeOrder, storeTime } from "./report-fixtures";

describe("Analytics (/analytics)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let owner: { Authorization: string };
  let noCost: { Authorization: string };
  let f: Awaited<ReturnType<typeof seedCatalog>>;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    const { ownerUser } = await seedBasics(db);
    f = await seedCatalog(db);
    owner = await bearerFor(app, "owner@test.local");
    const role = await db.role.create({ data: { name: "ANALYST", permissions: { create: [{ permission: "analytics:read" }] } } });
    await db.user.create({ data: { email: "analyst@test.local", name: "Analyst", passwordHash: ownerUser.passwordHash, roleId: role.id } });
    noCost = await bearerFor(app, "analyst@test.local");

    const customer = await db.customer.create({ data: { name: "=cmd|evil", phone: "020 1111" } });
    const v1 = (quantity: number) => ({ variantId: f.v1.id, warehouseId: f.whA.id, unitPrice: "100.00", unitCost: "60.00", quantity, sku: "SKU-1" });
    const v2 = (quantity: number) => ({ variantId: f.v2.id, warehouseId: f.whA.id, unitPrice: "100.00", unitCost: "60.00", quantity, sku: "SKU-2" });
    // ໃນຊ່ວງ (1–2 ຕ.ລ.): A ເຟສບຸກ CF 2×v1 + ຄ່າສົ່ງ 20 + VAT 10; B ໜ້າຮ້ານ 1×v2 ສ່ວນຫຼຸດ 10; C ຈ່າຍວັນທີ 2
    await makeOrder(db, { channel: "FACEBOOK", source: "LIVE_CF", customerId: customer.id, paidAt: storeTime("2026-10-01T10:00:00"), shippingFee: "20.00", vatAmount: "10.00", items: [v1(2)] });
    await makeOrder(db, { channel: "STOREFRONT", source: "WEB_CHECKOUT", status: "COMPLETED", paidAt: storeTime("2026-10-01T23:30:00"), discountTotal: "10.00", items: [v2(1)] });
    await makeOrder(db, { channel: "FACEBOOK", source: "CHAT", customerId: customer.id, status: "SHIPPED", paidAt: storeTime("2026-10-02T08:00:00"), items: [v1(1)] });
    // ບໍ່ນັບ: ຄ້າງຈ່າຍ (ສ້າງໃນຊ່ວງ), ຍົກເລີກຫຼັງຈ່າຍ, ຈ່າຍນອກຊ່ວງ
    await makeOrder(db, { status: "PENDING_PAYMENT", createdAt: storeTime("2026-10-02T09:00:00"), items: [v1(5)] });
    await makeOrder(db, { status: "CANCELLED", paidAt: storeTime("2026-10-01T11:00:00"), cancelledAt: storeTime("2026-10-02T11:00:00"), items: [v1(3)] });
    await makeOrder(db, { paidAt: storeTime("2026-10-03T00:00:00"), items: [v1(1)] });
  });

  const get = (path: string, auth = owner) => request(app.getHttpServer()).get(path).set(auth).expect(200);

  it("summary: P&L ຕາມ paidAt, ບໍ່ນັບຄ້າງຈ່າຍ/ຍົກເລີກ/ນອກຊ່ວງ", async () => {
    const res = await get("/analytics/summary?from=2026-10-01&to=2026-10-02");
    // ຍອດ: A total 220 (vat 10), B 90, C 100 → revenue = 210 + 90 + 100 = 400; cogs = 4×60 = 240
    expect(res.body).toEqual({
      from: "2026-10-01",
      to: "2026-10-02",
      orders: 3,
      units: 4,
      customers: 1,
      grossSales: "400.00",
      discounts: "10.00",
      shippingIncome: "20.00",
      vat: "10.00",
      revenue: "400.00",
      avgOrderValue: "133.33",
      cogs: "240.00",
      grossProfit: "160.00",
      grossMargin: "40.0",
      cancelled: 1,
      pendingAmount: "500.00",
    });
  });

  it("ບໍ່ມີ costs:read → ບໍ່ມີ cogs/grossProfit/grossMargin/stockValue", async () => {
    const summary = await get("/analytics/summary?from=2026-10-01&to=2026-10-02", noCost);
    expect(summary.body).not.toHaveProperty("cogs");
    expect(summary.body).not.toHaveProperty("grossProfit");
    expect(summary.body).not.toHaveProperty("grossMargin");
    expect(summary.body.revenue).toBe("400.00");
    const top = await get("/analytics/top-products?from=2026-10-01&to=2026-10-02", noCost);
    expect(top.body[0]).not.toHaveProperty("cogs");
    const dead = await get("/analytics/deadstock", noCost);
    expect(JSON.stringify(dead.body)).not.toContain("stockValue");
  });

  it("daily: ຄົບທຸກມື້ ແບ່ງຕາມເວລາຮ້ານ", async () => {
    const res = await get("/analytics/daily?from=2026-09-30&to=2026-10-02");
    expect(res.body.days).toEqual([
      { date: "2026-09-30", orders: 0, revenue: "0.00", cogs: "0.00", grossProfit: "0.00" },
      { date: "2026-10-01", orders: 2, revenue: "300.00", cogs: "180.00", grossProfit: "120.00" },
      { date: "2026-10-02", orders: 1, revenue: "100.00", cogs: "60.00", grossProfit: "40.00" },
    ]);
  });

  it("channels: ທຸກຊ່ອງທາງ/ແຫຼ່ງ, share %, ລຽງລາຍຮັບ", async () => {
    const res = await get("/analytics/channels?from=2026-10-01&to=2026-10-02");
    expect(res.body.channels[0]).toEqual({ key: "FACEBOOK", orders: 2, revenue: "310.00", share: "77.5", cogs: "180.00", grossProfit: "130.00" });
    expect(res.body.channels[1]).toMatchObject({ key: "STOREFRONT", orders: 1, revenue: "90.00", share: "22.5" });
    expect(res.body.channels).toHaveLength(6);
    expect(res.body.channels.at(-1)).toMatchObject({ orders: 0, revenue: "0.00", share: "0.0" });
    expect(res.body.sources.map((row: { key: string }) => row.key).slice(0, 3)).toEqual(["LIVE_CF", "CHAT", "WEB_CHECKOUT"]);
    expect(res.body.sources).toHaveLength(5);
  });

  it("top-products: ຕາມຈຳນວນ, limit", async () => {
    const res = await get("/analytics/top-products?from=2026-10-01&to=2026-10-02");
    expect(res.body).toEqual([
      { variantId: f.v1.id, sku: "SKU-1", productName: "Product", variantName: null, units: 3, revenue: "300.00", cogs: "180.00", grossProfit: "120.00" },
      { variantId: f.v2.id, sku: "SKU-2", productName: "Product", variantName: null, units: 1, revenue: "100.00", cogs: "60.00", grossProfit: "40.00" },
    ]);
    expect((await get("/analytics/top-products?from=2026-10-01&to=2026-10-02&limit=1")).body).toHaveLength(1);
  });

  it("deadstock: ມີສະຕ໋ອກ ແຕ່ບໍ່ຂາຍໃນ N ມື້", async () => {
    await db.stockLevel.createMany({
      data: [
        { variantId: f.v1.id, warehouseId: f.whA.id, onHand: 3 },
        { variantId: f.v2.id, warehouseId: f.whA.id, onHand: 2 },
        { variantId: f.v2.id, warehouseId: f.whB.id, onHand: 5 },
      ],
    });
    // v1 ຂາຍມື້ວານ → ບໍ່ຕາຍ; v2 (ລຶບບິນ fixture ອອກ) ຂາຍລ່າສຸດ 30 ມື້ກ່ອນ → ຕາຍເມື່ອ days=7, ບໍ່ຕາຍເມື່ອ days=60
    const line = (variantId: string) => ({ variantId, warehouseId: f.whA.id, unitPrice: "1", unitCost: "1", quantity: 1 });
    await db.order.deleteMany({ where: { items: { some: { variantId: f.v2.id } } } });
    await makeOrder(db, { paidAt: new Date(Date.now() - 24 * 3600_000), items: [line(f.v1.id)] });
    const lastV2 = new Date(Date.now() - 30 * 24 * 3600_000);
    await makeOrder(db, { paidAt: lastV2, items: [line(f.v2.id)] });
    await makeOrder(db, { status: "CANCELLED", paidAt: new Date(), items: [line(f.v2.id)] });

    const res = await get("/analytics/deadstock?days=7");
    expect(res.body).toMatchObject({ total: 1, days: 7, page: 1 });
    expect(res.body.items[0]).toEqual({
      variantId: f.v2.id, sku: "SKU-2", productName: "Product", variantName: null, onHand: 7, stockValue: "420.00",
      lastSoldAt: lastV2.toISOString(),
    });
    expect((await get("/analytics/deadstock?days=60")).body.total).toBe(0);
    // variant ທີ່ບໍ່ເຄີຍຂາຍ
    await db.stockLevel.updateMany({ where: { variantId: f.v1.id }, data: { onHand: 0 } });
    const fresh = await db.productVariant.create({ data: { productId: f.product.id, sku: "SKU-3", price: "1", costPrice: "2" } });
    await db.stockLevel.create({ data: { variantId: fresh.id, warehouseId: f.whA.id, onHand: 1 } });
    const after = await get("/analytics/deadstock?days=7&pageSize=10");
    expect(after.body.items.find((row: { sku: string }) => row.sku === "SKU-3")).toMatchObject({ onHand: 1, stockValue: "2.00", lastSoldAt: null });
    expect(after.body.items.some((row: { sku: string }) => row.sku === "SKU-1")).toBe(false);
  });

  it("export.csv: BOM, header, ກັນ formula injection, cost ສະເພາະ costs:read", async () => {
    const res = await request(app.getHttpServer())
      .get("/analytics/export.csv?from=2026-10-01&to=2026-10-02")
      .set(owner)
      .buffer(true)
      .parse((response, done) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (data += chunk));
        response.on("end", () => done(null, data));
      })
      .expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="sales-2026-10-01-2026-10-02.csv"');
    const text = res.body as string;
    expect(text.startsWith("\uFEFF")).toBe(true);
    const lines = text.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("orderNumber,paidAt,status,channel,source,customer,phone,subtotal,discount,shipping,vat,total,revenue,cogs,grossProfit");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain(",2026-10-01 10:00,PAID,FACEBOOK,LIVE_CF,'=cmd|evil,020 1111,200.00,0.00,20.00,10.00,220.00,210.00,120.00,90.00");

    const limited = await request(app.getHttpServer()).get("/analytics/export.csv?from=2026-10-01&to=2026-10-02").set(noCost).expect(200);
    expect(limited.text.split("\r\n")[0]).not.toContain("cogs");
  });

  it("ຊ່ວງວັນທີຜິດ = 400; ບໍ່ມີ analytics:read = 403", async () => {
    await request(app.getHttpServer()).get("/analytics/summary?from=2026-10-01").set(owner).expect(400);
    await request(app.getHttpServer()).get("/analytics/deadstock?days=1").set(owner).expect(400);
    const viewer = await bearerFor(app, "viewer@test.local");
    await request(app.getHttpServer()).get("/analytics/summary?from=2026-10-01&to=2026-10-01").set(viewer).expect(403);
    await request(app.getHttpServer()).get("/analytics/export.csv?from=2026-10-01&to=2026-10-01").set(viewer).expect(403);
  });
});
