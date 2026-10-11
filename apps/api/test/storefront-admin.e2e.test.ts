import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PERMISSIONS } from "@oca/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { TEST_PASSWORD, bearerFor } from "./helpers";
import { PNG } from "./slip-fixtures";
import { setupStoreTest } from "./storefront-fixtures";

/** ສິ່ງທີ່ແອດມິນເຫັນຂອງບິນ/ສະລິບທີ່ມາຈາກໜ້າຮ້ານ */
describe("storefront orders in admin (e2e)", () => {
  const { server, db, state, app } = setupStoreTest();

  const owner = async () => {
    const role = await db().role.create({
      data: { name: "OWNER", isSystem: true, permissions: { create: PERMISSIONS.map((permission) => ({ permission })) } },
    });
    await db().user.create({ data: { email: "owner@test.local", name: "Owner", passwordHash: await hash(TEST_PASSWORD), roleId: role.id } });
    return bearerFor(app(), "owner@test.local");
  };
  const placeWebOrder = async () => {
    const res = await request(server())
      .post("/store/orders")
      .set("Idempotency-Key", randomUUID())
      .send({
        items: [{ variantId: state.f.v1.id, quantity: 1 }],
        name: "ນາງ ກ",
        phone: "02055555555",
        address: "ບ້ານ ກ",
        courierId: state.courier.id,
        branch: "ສາຂາ ໂພນທັນ",
        expectedTotal: "100.00",
      })
      .expect(201);
    const order = await db().order.findUniqueOrThrow({ where: { publicToken: res.body.token as string } });
    return { token: res.body.token as string, id: order.id };
  };

  it("GET /orders/:id: ມີ courier ທີ່ລູກຄ້າເລືອກ + ສາຂາ; ບໍ່ສົ່ງ publicToken ອອກ", async () => {
    const auth = await owner();
    const { id } = await placeWebOrder();
    const res = await request(server()).get(`/orders/${id}`).set(auth).expect(200);
    expect(res.body).toMatchObject({
      channel: "STOREFRONT",
      source: "WEB_CHECKOUT",
      preferredCourier: { id: state.courier.id, name: "Anousith", isActive: true },
      shippingBranch: "ສາຂາ ໂພນທັນ",
    });
    expect(res.body).not.toHaveProperty("publicToken");
  });

  it("ບິນທີ່ບໍ່ໄດ້ມາຈາກເວັບ: preferredCourier ແລະ shippingBranch ເປັນ null", async () => {
    const auth = await owner();
    const created = await request(server()).post("/orders").set(auth).send({ items: [{ variantId: state.f.v1.id, quantity: 1 }] }).expect(201);
    expect(created.body).toMatchObject({ preferredCourier: null, shippingBranch: null });
  });

  it("GET /fulfillment/:orderId (ໜ້າແພັກ + ໃບປະໜ້າ): ມີ courier ທີ່ລູກຄ້າເລືອກ + ສາຂາ", async () => {
    const auth = await owner();
    const { id } = await placeWebOrder();
    await request(server()).post(`/orders/${id}/pay`).set(auth).expect(200);
    const res = await request(server()).get(`/fulfillment/${id}`).set(auth).expect(200);
    expect(res.body).toMatchObject({
      preferredCourier: { id: state.courier.id, name: "Anousith", isActive: true },
      shippingBranch: "ສາຂາ ໂພນທັນ",
    });
  });

  it("ສະລິບຈາກເວັບປາກົດໃນລາຍການສະລິບຂອງບິນ ດ້ວຍ source STOREFRONT ແລະ ແອດມິນຢືນຢັນໄດ້ → ລູກຄ້າເຫັນ PAID", async () => {
    const auth = await owner();
    const { id, token } = await placeWebOrder();
    await request(server()).post(`/store/orders/${token}/slips`).attach("file", PNG, "slip.png").expect(201);
    const slips = await request(server()).get(`/orders/${id}/slips`).set(auth).expect(200);
    expect(slips.body).toHaveLength(1);
    expect(slips.body[0]).toMatchObject({ source: "STOREFRONT", status: "PENDING_READ", orderId: id });

    // worker ອ່ານແລ້ວ (ຈຳລອງ) → ແອດມິນຢືນຢັນດ້ວຍຍອດຂອງບິນ
    await db().paymentSlip.update({ where: { id: slips.body[0].id as string }, data: { status: "READ" } });
    const slipId = slips.body[0].id as string;
    await request(server()).patch(`/slips/${slipId}`).set(auth).send({ confirmedAmount: "100.00", confirmedCurrency: "LAK" }).expect(200);
    await request(server()).post(`/slips/${slipId}/confirm`).set(auth).send({}).expect(200);
    const page = await request(server()).get(`/store/orders/${token}`).expect(200);
    expect(page.body.status).toBe("PAID");
    expect(page.body.slips).toEqual([{ status: "CONFIRMED", createdAt: expect.any(String) }]);
  });
});
