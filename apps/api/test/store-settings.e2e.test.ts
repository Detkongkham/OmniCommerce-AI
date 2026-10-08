import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StoreSettingsService } from "../src/modules/inventory/store-settings.service";
import { bearerFor, createTestApp, resetDb, seedInventoryUsers } from "./helpers";

describe("store settings (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
  });

  it("ຕ້ອງ login; ບໍ່ມີ inventory:read → 403", async () => {
    await request(server()).get("/settings/store").expect(401);
    const noInv = await bearerFor(app, "noinv@test.local");
    await request(server()).get("/settings/store").set(noInv).expect(403);
  });

  it("GET ສ້າງແຖວເລີ່ມຕົ້ນຖ້າຍັງບໍ່ມີ (ບໍ່ຕ້ອງ seed)", async () => {
    const reader = await bearerFor(app, "inv-read@test.local");
    const res = await request(server()).get("/settings/store").set(reader).expect(200);
    expect(res.body).toEqual({
      name: "OCA Store",
      baseCurrency: "LAK",
      vatRate: "10.00",
      pricesIncludeVat: true,
      reservationMinutes: 30,
      receivingAccounts: [],
    });
    expect(await db.storeSetting.count()).toBe(1);
  });

  it("PATCH receivingAccounts: ບັນທຶກ + ອ່ານຄືນ + audit; ລ້າງດ້ວຍ []; ຂໍ້ມູນຜິດຮູບແບບໃນ DB ບໍ່ເຮັດໃຫ້ GET ລົ້ມ", async () => {
    const writer = await bearerFor(app, "inv-write@test.local");
    const accounts = [{ bank: "BCEL", accountNo: "010-12-00-0123", accountName: "OCA" }];
    const saved = await request(server()).patch("/settings/store").set(writer).send({ receivingAccounts: accounts }).expect(200);
    expect(saved.body.receivingAccounts).toEqual(accounts);
    const reader = await bearerFor(app, "inv-read@test.local");
    expect((await request(server()).get("/settings/store").set(reader).expect(200)).body.receivingAccounts).toEqual(accounts);
    expect(await db.auditLog.count({ where: { action: "settings.store.update" } })).toBe(1);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "settings.store.update" } });
    expect((audit.before as { receivingAccounts: unknown }).receivingAccounts).toEqual([]);
    expect((audit.after as { receivingAccounts: unknown }).receivingAccounts).toEqual(accounts);

    await db.storeSetting.update({ where: { id: 1 }, data: { receivingAccounts: [{ bad: true }, accounts[0]] } });
    expect((await request(server()).get("/settings/store").set(reader).expect(200)).body.receivingAccounts).toEqual(accounts);

    const cleared = await request(server()).patch("/settings/store").set(writer).send({ receivingAccounts: [] }).expect(200);
    expect(cleared.body.receivingAccounts).toEqual([]);
    await request(server()).patch("/settings/store").set(writer).send({ receivingAccounts: [{ bank: "A", accountNo: "x" }] }).expect(400);
    // inventory:read ແກ້ບໍ່ໄດ້
    await request(server()).patch("/settings/store").set(reader).send({ receivingAccounts: accounts }).expect(403);
  });

  it("PATCH ສະເພາະ field ອື່ນ (ບໍ່ສົ່ງ receivingAccounts) ບໍ່ລ້າງບັນຊີຮັບເງິນ", async () => {
    const writer = await bearerFor(app, "inv-write@test.local");
    const accounts = [{ bank: "BCEL", accountNo: "010-12-00-0123" }];
    await request(server()).patch("/settings/store").set(writer).send({ receivingAccounts: accounts }).expect(200);
    const res = await request(server()).patch("/settings/store").set(writer).send({ name: "x" }).expect(200);
    expect(res.body.receivingAccounts).toEqual(accounts);
    const reader = await bearerFor(app, "inv-read@test.local");
    expect((await request(server()).get("/settings/store").set(reader).expect(200)).body.receivingAccounts).toEqual(accounts);
  });

  it("GET ພ້ອມກັນ 10 ຄັ້ງຕອນຍັງບໍ່ມີແຖວ → 200 ທັງໝົດ ແລະ ມີແຖວດຽວ", async () => {
    await db.storeSetting.deleteMany();
    const reader = await bearerFor(app, "inv-read@test.local");
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => request(server()).get("/settings/store").set(reader)),
    );
    expect(responses.map((res) => res.status)).toEqual(Array.from({ length: 10 }, () => 200));
    expect(await db.storeSetting.count()).toBe(1);

    // ຜ່ານ HTTP ການກວດ auth ຕໍ່ request ເຮັດໃຫ້ບໍ່ຄ່ອຍຊ້ອນກັນ; ເອີ້ນ service ກົງເພື່ອໃຫ້ race ເກີດແທ້ (ກ່ອນແກ້ fail ເກືອບທຸກຮອບ)
    const settings = app.get(StoreSettingsService);
    for (let round = 0; round < 5; round += 1) {
      await db.storeSetting.deleteMany();
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => settings.get()));
      expect(results.filter((result) => result.status === "rejected")).toEqual([]);
      expect(await db.storeSetting.count()).toBe(1);
    }
  });

  it("PATCH ແກ້ໄດ້ດ້ວຍ inventory:write ແລະ ຂຽນ audit; inventory:read ແກ້ບໍ່ໄດ້", async () => {
    const writer = await bearerFor(app, "inv-write@test.local");
    const res = await request(server())
      .patch("/settings/store")
      .set(writer)
      .send({ name: "ຮ້ານນ້ອງ", vatRate: "7", reservationMinutes: 45, pricesIncludeVat: false })
      .expect(200);
    expect(res.body).toMatchObject({ name: "ຮ້ານນ້ອງ", vatRate: "7.00", reservationMinutes: 45, pricesIncludeVat: false });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "settings.store.update" } });
    expect(audit.entity).toBe("StoreSetting");

    const reader = await bearerFor(app, "inv-read@test.local");
    await request(server())
      .patch("/settings/store")
      .set(reader)
      .send({ name: "x" })
      .expect(403);
  });

  it("PATCH: body ວ່າງ / ຄ່າຜິດ / baseCurrency → 400", async () => {
    const writer = await bearerFor(app, "inv-write@test.local");
    await request(server()).patch("/settings/store").set(writer).send({}).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ vatRate: "101" }).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ reservationMinutes: 0 }).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ baseCurrency: "USD" }).expect(400);
  });
});
