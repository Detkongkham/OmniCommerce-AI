import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_KEYS, keysOf, setupStoreTest } from "./storefront-fixtures";

describe("storefront coupons (e2e)", () => {
  const { server, db, state } = setupStoreTest();

  const coupon = (data: object = {}) => db().coupon.create({ data: { code: "NEW10", type: "PERCENT", value: "10", ...data } });
  const check = (couponCode: string | undefined, quantity = 2) =>
    request(server())
      .post("/store/cart/check")
      .send({ items: [{ variantId: state.f.v1.id, quantity }], ...(couponCode === undefined ? {} : { couponCode }) });
  const body = (patch: object = {}) => ({
    items: [{ variantId: state.f.v1.id, quantity: 2 }],
    name: "ນາງ ກ",
    phone: "02055555555",
    address: "ບ້ານ ກ",
    courierId: state.courier.id,
    branch: "ສາຂາ",
    expectedTotal: "180.00",
    couponCode: "NEW10",
    ...patch,
  });
  const post = (payload: object = body()) => request(server()).post("/store/orders").set("Idempotency-Key", randomUUID()).send(payload);

  describe("POST /store/cart/check", () => {
    it("ໂຄດໃຊ້ໄດ້ (ບໍ່ສົນຕົວພິມ/ຍະຫວ່າງ) → ສ່ວນຫຼຸດ ແລະ ຍອດໃໝ່", async () => {
      await coupon();
      const res = await check("  new10 ").expect(200);
      expect(res.body).toMatchObject({
        coupon: { code: "NEW10", discount: "20.00" },
        couponError: null,
        subtotal: "180.00",
        total: "180.00",
        orderable: true,
      });
      expect(res.body.items[0].lineTotal).toBe("200.00");
      const keys = keysOf(res.body);
      for (const key of [...FORBIDDEN_KEYS, "couponId", "usageLimit", "perPhoneLimit"]) expect(keys.has(key), key).toBe(false);
    });

    it("ບໍ່ສົ່ງໂຄດ ຫຼື ສົ່ງວ່າງ → coupon null, couponError null", async () => {
      await coupon();
      for (const code of [undefined, "", "   "]) {
        const res = await check(code).expect(200);
        expect(res.body).toMatchObject({ coupon: null, couponError: null, total: "200.00" });
      }
    });

    it("ໂຄດໃຊ້ບໍ່ໄດ້ → couponError ພ້ອມ reason, ຍອດບໍ່ຫຼຸດ ແຕ່ຍັງສັ່ງໄດ້ (ໂດຍບໍ່ມີໂຄດ)", async () => {
      await coupon({ code: "BIG", minSubtotal: "1000" });
      await coupon({ code: "OLD", endsAt: new Date("2020-01-01") });
      const low = await check("BIG").expect(200);
      expect(low.body).toMatchObject({ coupon: null, couponError: { reason: "MIN_SUBTOTAL", minSubtotal: "1000.00" }, total: "200.00", orderable: true });
      expect((await check("OLD").expect(200)).body.couponError).toEqual({ reason: "EXPIRED" });
      expect((await check("NOPE").expect(200)).body.couponError).toEqual({ reason: "NOT_FOUND" });
      // ຜິດຮູບແບບ ຫຼື ຍາວແປກ = ບໍ່ພົບ (ບໍ່ແມ່ນ 400)
      expect((await check("ໂຄດ ລາວ!").expect(200)).body.couponError).toEqual({ reason: "NOT_FOUND" });
      await check("X".repeat(31)).expect(400);
    });

    it("limit ຕໍ່ເບີບໍ່ຖືກກວດຕອນກວດກະຕ່າ (ຍັງບໍ່ຮູ້ເບີ)", async () => {
      await coupon({ perPhoneLimit: 1 });
      await post().expect(201);
      expect((await check("NEW10").expect(200)).body.coupon).toEqual({ code: "NEW10", discount: "20.00" });
    });
  });

  describe("POST /store/orders", () => {
    it("ສັ່ງດ້ວຍໂຄດ: ບິນບັນທຶກໂຄດ ແລະ ຍອດຫຼັງຫຼຸດ; ໜ້າບິນສະແດງສ່ວນຫຼຸດ", async () => {
      await coupon();
      const res = await post().expect(201);
      const row = await db().order.findFirstOrThrow();
      expect(row).toMatchObject({ couponCode: "NEW10" });
      expect(row.couponDiscount.toFixed(2)).toBe("20.00");
      expect(row.total.toFixed(2)).toBe("180.00");
      const page = await request(server()).get(`/store/orders/${res.body.token as string}`).expect(200);
      expect(page.body).toMatchObject({ coupon: { code: "NEW10", discount: "20.00" }, subtotal: "180.00", total: "180.00" });
      expect(keysOf(page.body).has("couponId")).toBe(false);
    });

    it("ບິນທີ່ບໍ່ໃຊ້ໂຄດ: coupon ເປັນ null", async () => {
      const res = await post(body({ couponCode: undefined, expectedTotal: "200.00" })).expect(201);
      const page = await request(server()).get(`/store/orders/${res.body.token as string}`).expect(200);
      expect(page.body.coupon).toBeNull();
    });

    it("ລູກຄ້າເຫັນຍອດຫຼັງຫຼຸດ ແຕ່ໂຄດຖືກປິດກ່ອນກົດສັ່ງ → 409 COUPON_INVALID; ບໍ່ສ້າງບິນ", async () => {
      const created = await coupon();
      await db().coupon.update({ where: { id: created.id }, data: { isActive: false } });
      const res = await post().expect(409);
      expect(res.body).toMatchObject({ code: "COUPON_INVALID", reason: "INACTIVE" });
      expect(await db().order.count()).toBe(0);
    });

    it("ໂຄດຜິດຮູບແບບ → 409 COUPON_INVALID NOT_FOUND (ບໍ່ແມ່ນ 500)", async () => {
      const res = await post(body({ couponCode: "ໂຄດ!" })).expect(409);
      expect(res.body).toMatchObject({ code: "COUPON_INVALID", reason: "NOT_FOUND" });
    });

    it("ຍອດທີ່ຄາດບໍ່ລວມສ່ວນຫຼຸດ → PRICE_CHANGED ພ້ອມຍອດຫຼັງຫຼຸດ", async () => {
      await coupon();
      const res = await post(body({ expectedTotal: "200.00" })).expect(409);
      expect(res.body).toMatchObject({ code: "PRICE_CHANGED", total: "180.00" });
    });

    it("perPhoneLimit ຖືກບັງຄັບຕອນສັ່ງ", async () => {
      await coupon({ perPhoneLimit: 1 });
      await post().expect(201);
      const again = await post().expect(409);
      expect(again.body).toMatchObject({ code: "COUPON_INVALID", reason: "PHONE_LIMIT" });
      await post(body({ phone: "02099999999" })).expect(201);
    });

    it("ບິນໝົດອາຍຸ → ສິດຂອງໂຄດຄືນ", async () => {
      await coupon({ usageLimit: 1 });
      const first = await post().expect(201);
      expect((await post(body({ phone: "02099999999" })).expect(409)).body.reason).toBe("USAGE_LIMIT");
      await db().order.update({ where: { publicToken: first.body.token as string }, data: { status: "EXPIRED" } });
      await post(body({ phone: "02099999999" })).expect(201);
    });
  });
});
