import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, receive } from "@oca/database";
import { createOrderSchema } from "@oca/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrdersService } from "../src/modules/orders/orders.service";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedLiveSession, seedRoleUsers } from "./helpers";

describe("flash sales (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let manager: { Authorization: string };
  let chat: { Authorization: string };
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  const server = () => app.getHttpServer();
  const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

  beforeAll(async () => {
    ({ app, db } = await createTestApp({ STORE_ORDER_RATE_LIMIT: "1000", STORE_CHECK_RATE_LIMIT: "1000" }));
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    manager = await bearerFor(app, "manager@role.test");
    chat = await bearerFor(app, "chat_admin@role.test");
    f = await seedCatalog(db);
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 50 }));
    await db.$transaction((tx) => receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 50 }));
  });

  const body = (patch: object = {}) => ({
    name: "10.10",
    startsAt: hours(-1),
    endsAt: hours(1),
    items: [{ variantId: f.v1.id, salePrice: "80" }],
    ...patch,
  });
  const create = (payload: object = body(), auth = manager) => request(server()).post("/flash-sales").set(auth).send(payload);
  const order = (items: object[] = [{ variantId: f.v1.id, quantity: 2 }], extra: object = {}) =>
    request(server()).post("/orders").set(chat).send({ items, ...extra });

  describe("ຈັດການແຄມເປນ", () => {
    it("ສ້າງ → ລາຍການ (ພ້ອມສິນຄ້າ, ລາຄາປົກກະຕິ ແລະ ລາຄາພິເສດ) → ແກ້ (ແທນລາຍການທັງໝົດ) → ປິດ", async () => {
      const created = await create().expect(201);
      expect(created.body).toMatchObject({
        name: "10.10",
        isActive: true,
        items: [{ variantId: f.v1.id, sku: "SKU-1", productName: "Product", variantName: null, regularPrice: "100.00", salePrice: "80.00" }],
      });
      const id = created.body.id as string;
      const patched = await request(server())
        .patch(`/flash-sales/${id}`)
        .set(manager)
        .send({ name: "11.11", items: [{ variantId: f.v2.id, salePrice: "70" }], isActive: false })
        .expect(200);
      expect(patched.body).toMatchObject({ name: "11.11", isActive: false });
      expect(patched.body.items).toEqual([expect.objectContaining({ variantId: f.v2.id, salePrice: "70.00" })]);
      const list = await request(server()).get("/flash-sales").set(manager).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].items).toHaveLength(1);
      expect(await db.flashSaleItem.count()).toBe(1);
      expect(await db.auditLog.count({ where: { action: { in: ["flashSale.create", "flashSale.update"] } } })).toBe(2);
    });

    it("body ຜິດ → 400: ຈົບກ່ອນເລີ່ມ, ບໍ່ມີສິນຄ້າ, variant ຊ້ຳ, ລາຄາ 0", async () => {
      await create(body({ startsAt: hours(2), endsAt: hours(1) })).expect(400);
      await create(body({ items: [] })).expect(400);
      await create(body({ items: [{ variantId: f.v1.id, salePrice: "80" }, { variantId: f.v1.id, salePrice: "70" }] })).expect(400);
      await create(body({ items: [{ variantId: f.v1.id, salePrice: "0" }] })).expect(400);
      expect(await db.flashSale.count()).toBe(0);
    });

    it("ລາຄາພິເສດບໍ່ຕ່ຳກວ່າລາຄາປົກກະຕິ → 409 FLASH_SALE_PRICE_INVALID ພ້ອມ SKU; variant ບໍ່ມີ → 404", async () => {
      const same = await create(body({ items: [{ variantId: f.v1.id, salePrice: "100" }, { variantId: f.v2.id, salePrice: "50" }] })).expect(409);
      expect(same.body).toMatchObject({ code: "FLASH_SALE_PRICE_INVALID", skus: ["SKU-1"] });
      const missing = await create(body({ items: [{ variantId: "nope", salePrice: "1" }] })).expect(404);
      expect(missing.body.code).toBe("VARIANT_NOT_FOUND");
      expect(await db.flashSale.count()).toBe(0);
    });

    it("variant ດຽວຢູ່ໃນແຄມເປນທີ່ເວລາຊ້ອນກັນບໍ່ໄດ້ → 409 FLASH_SALE_OVERLAP; ເວລາບໍ່ຊ້ອນ ຫຼື ແຄມເປນອື່ນປິດຢູ່ = ໄດ້", async () => {
      const first = await create().expect(201);
      const overlap = await create(body({ name: "ຊ້ອນ", startsAt: hours(0.5), endsAt: hours(3) })).expect(409);
      expect(overlap.body).toMatchObject({ code: "FLASH_SALE_OVERLAP", skus: ["SKU-1"] });
      // ຕໍ່ກັນພໍດີ (ເລີ່ມຕອນອັນເກົ່າຈົບ) ບໍ່ຖືວ່າຊ້ອນ
      const endsAt = (first.body as { endsAt: string }).endsAt;
      await create(body({ name: "ຕໍ່", startsAt: endsAt, endsAt: hours(5) })).expect(201);
      // variant ອື່ນ ໃນເວລາດຽວກັນ ໄດ້
      await create(body({ name: "v2", items: [{ variantId: f.v2.id, salePrice: "60" }] })).expect(201);
      // ແກ້ຕົນເອງ ບໍ່ຊ້ອນກັບຕົນເອງ
      await request(server()).patch(`/flash-sales/${first.body.id as string}`).set(manager).send({ name: "ປ່ຽນຊື່" }).expect(200);
      // ປິດອັນເກົ່າ → ສ້າງຊ້ອນໄດ້; ເປີດອັນເກົ່າຄືນ → ຖືກກັນ
      await request(server()).patch(`/flash-sales/${first.body.id as string}`).set(manager).send({ isActive: false }).expect(200);
      await create(body({ name: "ແທນ", startsAt: hours(-0.5), endsAt: hours(0.5) })).expect(201);
      const reopen = await request(server()).patch(`/flash-sales/${first.body.id as string}`).set(manager).send({ isActive: true }).expect(409);
      expect(reopen.body.code).toBe("FLASH_SALE_OVERLAP");
    });

    it("id ບໍ່ພົບ → 404 FLASH_SALE_NOT_FOUND; ສິດ: promotion:read ເບິ່ງ, promotion:write ແກ້", async () => {
      const missing = await request(server()).patch("/flash-sales/nope").set(manager).send({ name: "x" }).expect(404);
      expect(missing.body.code).toBe("FLASH_SALE_NOT_FOUND");
      await request(server()).get("/flash-sales").set(chat).expect(200);
      await create(body(), chat).expect(403);
      const warehouse = await bearerFor(app, "warehouse@role.test");
      await request(server()).get("/flash-sales").set(warehouse).expect(403);
    });
  });

  describe("ລາຄາທຸກຊ່ອງທາງ", () => {
    it("POST /orders ລະຫວ່າງແຄມເປນ: ໃຊ້ລາຄາພິເສດ ແລະ ບັນທຶກແຄມເປນໃນລາຍການ; variant ນອກແຄມເປນລາຄາປົກກະຕິ", async () => {
      const sale = await create().expect(201);
      const res = await order([
        { variantId: f.v1.id, quantity: 2 },
        { variantId: f.v2.id, quantity: 1 },
      ]).expect(201);
      expect(res.body.total).toBe("260.00");
      const items = await db.orderItem.findMany({ where: { orderId: res.body.id as string }, orderBy: { sku: "asc" } });
      expect(items[0]).toMatchObject({ sku: "SKU-1", flashSaleId: sale.body.id });
      expect(items[0]?.unitPrice.toFixed(2)).toBe("80.00");
      expect(items[1]).toMatchObject({ sku: "SKU-2", flashSaleId: null });
      expect(items[1]?.unitPrice.toFixed(2)).toBe("100.00");
    });

    it("ແຄມເປນຈົບ ຫຼື ຖືກປິດ → ບິນໃໝ່ລາຄາປົກກະຕິ; ບິນເກົ່າຄົງລາຄາທີ່ລັອກໄວ້", async () => {
      const sale = await create().expect(201);
      const during = await order().expect(201);
      await request(server()).patch(`/flash-sales/${sale.body.id as string}`).set(manager).send({ isActive: false }).expect(200);
      const after = await order().expect(201);
      expect(after.body.total).toBe("200.00");
      const kept = await request(server()).get(`/orders/${during.body.id as string}`).set(chat).expect(200);
      expect(kept.body.total).toBe("160.00");
      // ຍັງບໍ່ເລີ່ມ = ລາຄາປົກກະຕິ
      await create(body({ name: "ອະນາຄົດ", startsAt: hours(2), endsAt: hours(3), items: [{ variantId: f.v2.id, salePrice: "10" }] })).expect(201);
      expect((await order([{ variantId: f.v2.id, quantity: 1 }]).expect(201)).body.total).toBe("100.00");
    });

    it("ໂຄດສ່ວນຫຼຸດຄິດຈາກລາຄາ Flash Sale (ຫຼຸດຊ້ອນ)", async () => {
      await create().expect(201);
      await db.coupon.create({ data: { code: "NEW10", type: "PERCENT", value: "10" } });
      const res = await order(undefined, { couponCode: "NEW10", customer: { name: "ກ", phone: "02055555555" } }).expect(201);
      expect(res.body).toMatchObject({ couponDiscount: "16.00", total: "144.00" });
    });

    it("GET /variants (ຟອມເປີດບິນ): price = ລາຄາທີ່ຂາຍຕອນນີ້, ມີ regularPrice ແລະ saleEndsAt", async () => {
      const sale = await create().expect(201);
      const res = await request(server()).get("/variants?q=SKU").set(chat).expect(200);
      const bySku = Object.fromEntries((res.body.items as { sku: string }[]).map((item) => [item.sku, item]));
      expect(bySku["SKU-1"]).toMatchObject({ price: "80.00", regularPrice: "100.00", saleEndsAt: sale.body.endsAt });
      expect(bySku["SKU-2"]).toMatchObject({ price: "100.00", regularPrice: "100.00", saleEndsAt: null });
    });

    it("Host screen ຂອງ Live ສະແດງລາຄາ Flash Sale", async () => {
      await create().expect(201);
      const session = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }] });
      const owner = await bearerFor(app, "owner@role.test");
      const res = await request(server()).get(`/live-sessions/${session.id}/host`).set(owner).expect(200);
      expect(res.body.items[0]).toMatchObject({ code: "A1", price: "80.00" });
    });

    it("ບິນ CF (ສ້າງ ແລະ ເພີ່ມລາຍການ) ໃຊ້ລາຄາ Flash Sale", async () => {
      const sale = await create(body({ items: [{ variantId: f.v1.id, salePrice: "80" }, { variantId: f.v2.id, salePrice: "60" }] })).expect(201);
      const orders = app.get(OrdersService);
      const session = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }] });
      const orderId = await db.$transaction((tx) =>
        orders.createCfOrderInTx(tx, createOrderSchema.parse({ items: [{ variantId: f.v1.id, quantity: 1 }] }), {
          channel: "FACEBOOK",
          source: "LIVE_CF",
          liveSessionId: session.id,
        }),
      );
      await db.$transaction((tx) => orders.appendItemsInTx(tx, orderId, [{ variantId: f.v2.id, quantity: 2 }], null));
      const row = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { orderBy: { sku: "asc" } } } });
      expect(row.total.toFixed(2)).toBe("200.00");
      expect(row.items.map((item) => [item.sku, item.unitPrice.toFixed(2), item.flashSaleId])).toEqual([
        ["SKU-1", "80.00", sale.body.id],
        ["SKU-2", "60.00", sale.body.id],
      ]);
    });
  });

  describe("ເວັບ", () => {
    it("ລາຍການ ແລະ ລາຍລະອຽດ: ລາຄາພິເສດ, ລາຄາປົກກະຕິເປັນ compareAtPrice, saleEndsAt", async () => {
      const sale = await create().expect(201);
      const list = await request(server()).get("/store/products").expect(200);
      expect(list.body.items[0]).toMatchObject({ priceMin: "80.00", priceMax: "100.00", compareAtPrice: "100.00", saleEndsAt: sale.body.endsAt });
      const detail = await request(server()).get("/store/products/product").expect(200);
      const variants = detail.body.variants as { id: string }[];
      expect(variants.find((variant) => variant.id === f.v1.id)).toMatchObject({ price: "80.00", compareAtPrice: "100.00", saleEndsAt: sale.body.endsAt });
      expect(variants.find((variant) => variant.id === f.v2.id)).toMatchObject({ price: "100.00", compareAtPrice: null, saleEndsAt: null });
    });

    it("ບໍ່ມີແຄມເປນ: saleEndsAt null ແລະ compareAtPrice ຕາມທີ່ຕັ້ງໃນສິນຄ້າ", async () => {
      await db.productVariant.update({ where: { id: f.v1.id }, data: { compareAtPrice: "150" } });
      const list = await request(server()).get("/store/products").expect(200);
      expect(list.body.items[0]).toMatchObject({ priceMin: "100.00", compareAtPrice: "150.00", saleEndsAt: null });
    });

    it("ກວດກະຕ່າ ແລະ ສັ່ງຊື້: ໃຊ້ລາຄາພິເສດ; ແຄມເປນຈົບລະຫວ່າງທາງ → PRICE_CHANGED", async () => {
      const sale = await create().expect(201);
      const courier = await db.courier.create({ data: { code: "ANS", name: "Anousith" } });
      const check = await request(server()).post("/store/cart/check").send({ items: [{ variantId: f.v1.id, quantity: 2 }] }).expect(200);
      expect(check.body).toMatchObject({ total: "160.00" });
      expect(check.body.items[0]).toMatchObject({ unitPrice: "80.00", lineTotal: "160.00" });
      const payload = {
        items: [{ variantId: f.v1.id, quantity: 2 }],
        name: "ກ",
        phone: "02055555555",
        address: "ບ້ານ ກ",
        courierId: courier.id,
        branch: "ສາຂາ",
        expectedTotal: "160.00",
      };
      await request(server()).post("/store/orders").set("Idempotency-Key", randomUUID()).send(payload).expect(201);
      await request(server()).patch(`/flash-sales/${sale.body.id as string}`).set(manager).send({ isActive: false }).expect(200);
      const late = await request(server()).post("/store/orders").set("Idempotency-Key", randomUUID()).send({ ...payload, phone: "02099999999" }).expect(409);
      expect(late.body).toMatchObject({ code: "PRICE_CHANGED", total: "200.00" });
    });
  });
});
