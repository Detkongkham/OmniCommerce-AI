import { randomUUID } from "node:crypto";
import { STORE_TOKEN_PATTERN } from "@oca/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { expectLedgerMatches } from "./helpers";
import { GIF, PNG } from "./slip-fixtures";
import { FORBIDDEN_KEYS, keysOf, setupStoreTest } from "./storefront-fixtures";

describe("storefront orders (e2e)", () => {
  const { server, db, state, enqueueRead } = setupStoreTest();

  const body = (patch: object = {}) => ({
    items: [{ variantId: state.f.v1.id, quantity: 2 }],
    name: "ນາງ ກ",
    phone: "02055555555",
    address: "ບ້ານ ກ, ວຽງຈັນ",
    courierId: state.courier.id,
    branch: "ສາຂາ ໂພນທັນ",
    expectedTotal: "200.00",
    ...patch,
  });
  const post = (payload: object = body(), key: string = randomUUID()) =>
    request(server()).post("/store/orders").set("Idempotency-Key", key).send(payload);
  const place = async (payload: object = body()) => (await post(payload).expect(201)).body as { orderNumber: string; token: string };
  const reservedOf = async (variantId: string) =>
    (await db().stockLevel.findFirstOrThrow({ where: { variantId, warehouseId: state.f.whA.id } })).reserved;
  const expectNoForbiddenKeys = (payload: unknown) => {
    const keys = keysOf(payload);
    for (const key of FORBIDDEN_KEYS) expect(keys.has(key), key).toBe(false);
  };

  describe("POST /store/orders", () => {
    it("201 ໂດຍບໍ່ຕ້ອງ token: ຄືນເລກບິນ + token; ບິນ STOREFRONT ຈອງສະຕ໋ອກ ແລະ ຜູກລູກຄ້າຕາມເບີ", async () => {
      const res = await post().expect(201);
      expect(Object.keys(res.body).sort()).toEqual(["orderNumber", "token"]);
      expect(res.body.orderNumber).toBe("SO-000001");
      expect(res.body.token).toMatch(STORE_TOKEN_PATTERN);
      expect(res.headers["cache-control"]).toBe("no-store");

      const row = await db().order.findFirstOrThrow({ include: { customer: true, items: true } });
      expect(row).toMatchObject({
        channel: "STOREFRONT",
        source: "WEB_CHECKOUT",
        status: "PENDING_PAYMENT",
        createdById: null,
        publicToken: res.body.token,
        shippingName: "ນາງ ກ",
        shippingPhone: "02055555555",
        shippingAddress: "ບ້ານ ກ, ວຽງຈັນ",
        shippingCourierId: state.courier.id,
        shippingBranch: "ສາຂາ ໂພນທັນ",
      });
      expect(row.total.toFixed(2)).toBe("200.00");
      expect(row.shippingFee.toFixed(2)).toBe("0.00");
      expect(row.discountTotal.toFixed(2)).toBe("0.00");
      expect(row.customer).toMatchObject({ name: "ນາງ ກ", phone: "02055555555" });
      expect(row.items).toHaveLength(1);
      expect(row.items[0]).toMatchObject({ quantity: 2, warehouseId: state.f.whA.id });
      expect(await reservedOf(state.f.v1.id)).toBe(2);
      await expectLedgerMatches(db());
    });

    it("ບໍ່ມີ Idempotency-Key ຫຼື key ຜິດຮູບແບບ → 400 ແລະ ບໍ່ສ້າງບິນ", async () => {
      await request(server()).post("/store/orders").send(body()).expect(400);
      await post(body(), "has space").expect(400);
      expect(await db().order.count()).toBe(0);
    });

    it("ສົ່ງຊ້ຳດ້ວຍ key ເດີມ → ບິນເດີມ token ເດີມ (ບໍ່ຈອງຊ້ຳ); key ເດີມ + body ຕ່າງ → 409 CONFLICT", async () => {
      const key = randomUUID();
      const first = await post(body(), key).expect(201);
      const again = await post(body(), key).expect(201);
      expect(again.body).toEqual(first.body);
      expect(await db().order.count()).toBe(1);
      expect(await reservedOf(state.f.v1.id)).toBe(2);
      const conflict = await post(body({ branch: "ສາຂາອື່ນ" }), key).expect(409);
      expect(conflict.body.code).toBe("CONFLICT");
    });

    it("ຍອດທີ່ລູກຄ້າເຫັນບໍ່ຕົງ → 409 PRICE_CHANGED ພ້ອມຍອດໃໝ່; ບໍ່ສ້າງບິນ", async () => {
      await db().productVariant.update({ where: { id: state.f.v1.id }, data: { price: "120.00" } });
      const res = await post().expect(409);
      expect(res.body).toMatchObject({ code: "PRICE_CHANGED", total: "240.00" });
      expect(await db().order.count()).toBe(0);
      expect(await reservedOf(state.f.v1.id)).toBe(0);
    });

    it("ສະຕ໋ອກບໍ່ພໍ → 409 INSUFFICIENT_STOCK ບອກຈຳນວນທີ່ເຫຼືອ ໂດຍບໍ່ເປີດເຜີຍສາງ/SKU; ບໍ່ສ້າງບິນບາງສ່ວນ", async () => {
      const res = await post(
        body({
          items: [
            { variantId: state.f.v1.id, quantity: 11 },
          ],
          expectedTotal: "1100.00",
        }),
      ).expect(409);
      expect(res.body.code).toBe("INSUFFICIENT_STOCK");
      expect(res.body.shortages).toEqual([{ variantId: state.f.v1.id, requested: 11, available: 10 }]);
      expectNoForbiddenKeys(res.body);
      expect(await db().order.count()).toBe(0);
      expect(await db().customer.count()).toBe(0);
    });

    it("ສອງຄົນສັ່ງອັນສຸດທ້າຍພ້ອມກັນ → ສຳເລັດຄົນດຽວ, ອີກຄົນ 409; ledger ຕົງ", async () => {
      await db().stockLevel.updateMany({ where: { variantId: state.f.v1.id, warehouseId: state.f.whA.id }, data: { reserved: 9 } });
      await db().stockMovement.create({
        data: { variantId: state.f.v1.id, warehouseId: state.f.whA.id, type: "RESERVE", quantity: 9 },
      });
      const one = { items: [{ variantId: state.f.v1.id, quantity: 1 }], expectedTotal: "100.00" };
      const results = await Promise.all([
        post(body({ ...one, phone: "02011111111" })),
        post(body({ ...one, phone: "02022222222" })),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(results.find((res) => res.status === 409)?.body.code).toBe("INSUFFICIENT_STOCK");
      expect(await db().order.count()).toBe(1);
      expect(await reservedOf(state.f.v1.id)).toBe(10);
      await expectLedgerMatches(db());
    });

    it("ເບີໂທທີ່ມີລູກຄ້າຢູ່ແລ້ວ: ຜູກບິນ ແຕ່ບໍ່ແກ້ຊື່ລູກຄ້າເດີມ (ຊື່ທີ່ພິມຢູ່ໃນບິນ)", async () => {
      const existing = await db().customer.create({ data: { name: "ຊື່ເດີມ", phone: "02055555555" } });
      await place(body({ name: "ຊື່ອື່ນ" }));
      const row = await db().order.findFirstOrThrow();
      expect(row.customerId).toBe(existing.id);
      expect(row.shippingName).toBe("ຊື່ອື່ນ");
      expect((await db().customer.findUniqueOrThrow({ where: { id: existing.id } })).name).toBe("ຊື່ເດີມ");
      expect(await db().customer.count()).toBe(1);
    });

    it("ເບີດຽວມີບິນຄ້າງຈ່າຍຈາກເວັບໄດ້ 2 ບິນ: ບິນທີ 3 → 409 TOO_MANY_OPEN_ORDERS; ບິນໝົດອາຍຸ/ຈ່າຍແລ້ວ ບໍ່ນັບ", async () => {
      const one = { items: [{ variantId: state.f.v1.id, quantity: 1 }], expectedTotal: "100.00" };
      const first = await place(body(one));
      await place(body(one));
      const blocked = await post(body(one)).expect(409);
      expect(blocked.body.code).toBe("TOO_MANY_OPEN_ORDERS");
      expect(await db().order.count()).toBe(2);
      expect(await reservedOf(state.f.v1.id)).toBe(2);

      // ເບີອື່ນບໍ່ຖືກກະທົບ
      await place(body({ ...one, phone: "02099999999" }));

      // ບິນທຳອິດໝົດເວລາຈອງ → ສັ່ງໄດ້ອີກ
      await db().order.update({ where: { publicToken: first.token }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      await place(body(one));

      // ບິນທີ່ຈ່າຍແລ້ວ ບໍ່ນັບ
      await db().order.updateMany({ where: { publicToken: { not: first.token }, shippingPhone: "02055555555" }, data: { status: "PAID" } });
      await place(body(one));
    });

    it("courier ບໍ່ມີ → 404 COURIER_NOT_FOUND; ປິດໃຊ້ → 409 COURIER_INACTIVE", async () => {
      const missing = await post(body({ courierId: "nope" })).expect(404);
      expect(missing.body.code).toBe("COURIER_NOT_FOUND");
      await db().courier.update({ where: { id: state.courier.id }, data: { isActive: false } });
      const inactive = await post().expect(409);
      expect(inactive.body.code).toBe("COURIER_INACTIVE");
      expect(await db().order.count()).toBe(0);
    });

    it("ສິນຄ້າທີ່ບໍ່ຂາຍແລ້ວ → 409 VARIANT_NOT_AVAILABLE; variant ບໍ່ມີ → 404", async () => {
      await db().product.update({ where: { id: state.f.product.id }, data: { status: "DRAFT" } });
      const draft = await post().expect(409);
      expect(draft.body.code).toBe("VARIANT_NOT_AVAILABLE");
      const missing = await post(body({ items: [{ variantId: "nope", quantity: 1 }], expectedTotal: "0" })).expect(404);
      expect(missing.body.code).toBe("VARIANT_NOT_FOUND");
    });

    it("body ຜິດ → 400: ຈຳນວນເກີນ 20, ເບີຜິດ, ສົ່ງ field ລາຄາ/ສ່ວນຫຼຸດ/ຄ່າສົ່ງມາເອງ", async () => {
      await post(body({ items: [{ variantId: state.f.v1.id, quantity: 21 }] })).expect(400);
      await post(body({ phone: "abc" })).expect(400);
      await post(body({ shippingFee: "0" })).expect(400);
      await post(body({ items: [{ variantId: state.f.v1.id, quantity: 1, discount: "50" }] })).expect(400);
      await post(body({ items: [{ variantId: state.f.v1.id, quantity: 1, unitPrice: "1" }] })).expect(400);
      expect(await db().order.count()).toBe(0);
    });
  });

  describe("GET /store/orders/:token", () => {
    it("ຄືນບິນແບບສາທາລະນະ: ລາຍການ, ຍອດ, ຂໍ້ມູນຈັດສົ່ງ, ເວລາຈອງ; ບໍ່ມີຂໍ້ມູນພາຍໃນ", async () => {
      const { token } = await place(body({ note: "ໂທກ່ອນສົ່ງ" }));
      const res = await request(server()).get(`/store/orders/${token}`).expect(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toMatchObject({
        orderNumber: "SO-000001",
        status: "PENDING_PAYMENT",
        currency: "LAK",
        subtotal: "200.00",
        vatAmount: "18.18",
        total: "200.00",
        paidAt: null,
        items: [{ productName: "Product", variantName: null, quantity: 2, unitPrice: "100.00", lineTotal: "200.00" }],
        shipping: {
          name: "ນາງ ກ",
          phone: "02055555555",
          address: "ບ້ານ ກ, ວຽງຈັນ",
          courierName: "Anousith",
          branch: "ສາຂາ ໂພນທັນ",
        },
        note: "ໂທກ່ອນສົ່ງ",
        slips: [],
        tracking: null,
      });
      expect(new Date(res.body.reservedUntil).getTime()).toBeGreaterThan(Date.now());
      expectNoForbiddenKeys(res.body);
      expect(keysOf(res.body).has("id")).toBe(false);
    });

    it("ເກີນເວລາຈອງ → status EXPIRED ທັນທີ ເຖິງ worker ຍັງບໍ່ທັນປັບ", async () => {
      const { token } = await place();
      await db().order.update({ where: { publicToken: token }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      const res = await request(server()).get(`/store/orders/${token}`).expect(200);
      expect(res.body.status).toBe("EXPIRED");
    });

    it("ສົ່ງອອກແລ້ວ → tracking ມີຊື່ courier, ເລກ ແລະ URL", async () => {
      const { token } = await place();
      const order = await db().order.update({ where: { publicToken: token }, data: { status: "SHIPPED", paidAt: new Date() } });
      await db().shipment.create({ data: { orderId: order.id, courierId: state.courier.id, trackingNumber: "TRK 1" } });
      const res = await request(server()).get(`/store/orders/${token}`).expect(200);
      expect(res.body.status).toBe("SHIPPED");
      expect(res.body.tracking).toEqual({
        courierName: "Anousith",
        trackingNumber: "TRK 1",
        url: "https://track.example/TRK%201",
      });
    });

    it("token ຜິດຮູບແບບ, ບໍ່ມີ ຫຼື ເປັນ id ຂອງບິນ → 404 ORDER_NOT_FOUND ແບບດຽວກັນ", async () => {
      await place();
      const order = await db().order.findFirstOrThrow();
      for (const token of ["x", "A".repeat(43), order.id, order.orderNumber]) {
        const res = await request(server()).get(`/store/orders/${token}`).expect(404);
        expect(res.body.code).toBe("ORDER_NOT_FOUND");
      }
    });
  });

  describe("POST /store/orders/:token/slips", () => {
    const upload = (token: string, file: Buffer = PNG) =>
      request(server()).post(`/store/orders/${token}/slips`).attach("file", file, "slip.png");

    it("201: ສ້າງສະລິບ STOREFRONT ຜູກບິນ, enqueue ອ່ານ, audit ບໍ່ມີຜູ້ໃຊ້; ລູກຄ້າເຫັນ REVIEWING", async () => {
      const { token } = await place();
      const res = await upload(token).expect(201);
      expect(res.body).toEqual({ status: "REVIEWING" });
      const order = await db().order.findUniqueOrThrow({ where: { publicToken: token } });
      const slip = await db().paymentSlip.findFirstOrThrow();
      expect(slip).toMatchObject({ source: "STOREFRONT", orderId: order.id, status: "PENDING_READ", imageMime: "image/png" });
      expect(enqueueRead).toHaveBeenCalledWith(slip.id);
      const audits = await db().auditLog.findMany({ where: { action: "slip.create" } });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.userId).toBeNull();

      const page = await request(server()).get(`/store/orders/${token}`).expect(200);
      expect(page.body.slips).toEqual([{ status: "REVIEWING", createdAt: slip.createdAt.toISOString() }]);
      expectNoForbiddenKeys(page.body);
    });

    it("ສະຖານະສະລິບທີ່ລູກຄ້າເຫັນ: READ/READ_FAILED = REVIEWING, CONFIRMED, REJECTED", async () => {
      const { token } = await place();
      await upload(token).expect(201);
      const slip = await db().paymentSlip.findFirstOrThrow();
      const seen = async () => (await request(server()).get(`/store/orders/${token}`).expect(200)).body.slips[0].status;
      for (const [status, expected] of [
        ["READ", "REVIEWING"],
        ["READ_FAILED", "REVIEWING"],
        ["CONFIRMED", "CONFIRMED"],
        ["REJECTED", "REJECTED"],
      ] as const) {
        await db().paymentSlip.update({ where: { id: slip.id }, data: { status } });
        expect(await seen()).toBe(expected);
      }
    });

    it("ໄຟລ໌ບໍ່ແມ່ນ JPEG/PNG/WebP ຫຼື ບໍ່ມີໄຟລ໌ → 422 SLIP_FILE_INVALID", async () => {
      const { token } = await place();
      const gif = await upload(token, GIF).expect(422);
      expect(gif.body.code).toBe("SLIP_FILE_INVALID");
      const none = await request(server()).post(`/store/orders/${token}/slips`).send({}).expect(422);
      expect(none.body.code).toBe("SLIP_FILE_INVALID");
      expect(await db().paymentSlip.count()).toBe(0);
    });

    it("ສູງສຸດ 3 ໃບທີ່ບໍ່ຖືກປະຕິເສດ: ໃບທີ 4 → 409 SLIP_LIMIT_REACHED; ໃບທີ່ຖືກປະຕິເສດບໍ່ນັບ", async () => {
      const { token } = await place();
      await upload(token).expect(201);
      await upload(token).expect(201);
      await upload(token).expect(201);
      const blocked = await upload(token).expect(409);
      expect(blocked.body.code).toBe("SLIP_LIMIT_REACHED");
      const first = await db().paymentSlip.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
      await db().paymentSlip.update({ where: { id: first.id }, data: { status: "REJECTED" } });
      await upload(token).expect(201);
      expect(await db().paymentSlip.count()).toBe(4);
    });

    it("ບິນທີ່ບໍ່ໄດ້ລໍຈ່າຍ → 409 ORDER_INVALID_STATE; ເກີນເວລາຈອງ → 409 RESERVATION_EXPIRED", async () => {
      const paid = await place(body({ phone: "02011111111" }));
      await db().order.update({ where: { publicToken: paid.token }, data: { status: "PAID" } });
      const invalid = await upload(paid.token).expect(409);
      expect(invalid.body.code).toBe("ORDER_INVALID_STATE");

      const late = await place(body({ phone: "02022222222" }));
      await db().order.update({ where: { publicToken: late.token }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      const expired = await upload(late.token).expect(409);
      expect(expired.body.code).toBe("RESERVATION_EXPIRED");
      expect(await db().paymentSlip.count()).toBe(0);
    });

    it("token ບໍ່ມີ → 404; ບິນທີ່ບໍ່ໄດ້ມາຈາກເວັບອັບໂຫຼດຜ່ານ route ນີ້ບໍ່ໄດ້", async () => {
      const res = await upload("A".repeat(43)).expect(404);
      expect(res.body.code).toBe("ORDER_NOT_FOUND");
      const manual = await db().order.create({
        data: { orderNumber: "SO-M", channel: "OFFLINE", source: "MANUAL", currency: "LAK", subtotal: "0", vatRate: "0", vatAmount: "0", total: "0" },
      });
      await upload(manual.id).expect(404);
    });

    it("ບໍ່ມີ route ສາທາລະນະສຳລັບຮູບສະລິບ: /slips/:id/image ຍັງຕ້ອງ login", async () => {
      const { token } = await place();
      await upload(token).expect(201);
      const slip = await db().paymentSlip.findFirstOrThrow();
      await request(server()).get(`/slips/${slip.id}/image`).expect(401);
    });
  });
});

describe("storefront order rate limits (e2e)", () => {
  const { server, db, state } = setupStoreTest({ STORE_ORDER_RATE_LIMIT: "2", STORE_SLIP_RATE_LIMIT: "1" });

  const post = (phone: string) =>
    request(server())
      .post("/store/orders")
      .set("Idempotency-Key", randomUUID())
      .send({
        items: [{ variantId: state.f.v1.id, quantity: 1 }],
        name: "ກ",
        phone,
        address: "ບ້ານ ກ",
        courierId: state.courier.id,
        branch: "ສາຂາ",
        expectedTotal: "100.00",
      });

  it("ສັ່ງເກີນ limit ຕໍ່ IP → 429 ແລະ ບໍ່ສ້າງບິນ; ອັບໂຫຼດສະລິບເກີນ limit → 429", async () => {
    const first = await post("02011111111").expect(201);
    await post("02022222222").expect(201);
    const blocked = await post("02033333333").expect(429);
    expect(blocked.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(await db().order.count()).toBe(2);

    const upload = () => request(server()).post(`/store/orders/${first.body.token}/slips`).attach("file", PNG, "slip.png");
    await upload().expect(201);
    const slipBlocked = await upload().expect(429);
    expect(slipBlocked.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(await db().paymentSlip.count()).toBe(1);
  });
});
