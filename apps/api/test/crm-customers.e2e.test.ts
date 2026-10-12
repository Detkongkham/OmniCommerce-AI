import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCustomerOrder, seedCustomerOrders } from "./crm-fixtures";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

describe("crm customers (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let manager: { Authorization: string };
  let chat: { Authorization: string };
  let warehouse: { Authorization: string };
  const server = () => app.getHttpServer();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    for (const key of Object.keys(ids)) delete ids[key];
    await resetDb(db);
    await seedRoleUsers(db);
    manager = await bearerFor(app, "manager@role.test");
    chat = await bearerFor(app, "chat_admin@role.test");
    warehouse = await bearerFor(app, "warehouse@role.test");
  });

  /** ລູກຄ້າ 7 ຄົນ ກວມທຸກກຸ່ມ. ຍອດຊື້: A 10000, D 2000, B 900, F 400, C 50, E 40 */
  async function seedSegments() {
    const make = async (key: string, name: string, phone: string | null) => {
      // createdAt ຫ່າງກັນ 1 ວິ: ການລຽງ "created" ບໍ່ຂຶ້ນກັບຄວາມໄວຂອງ insert
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, Object.keys(ids).length));
      const row = await db.customer.create({ data: { name, phone, createdAt } });
      ids[key] = row.id;
      return row.id;
    };
    await seedCustomerOrders(db, await make("A", "Anou Champion", "02055550001"), 10, 5, "1000.00"); // R5 F5 M5
    await seedCustomerOrders(db, await make("B", "Bounmy Loyal", "02055550002"), 3, 80, "300.00"); // R3 F3
    await seedCustomerOrders(db, await make("C", "Chan New", "02055550003"), 1, 10, "50.00"); // R5 F1
    await seedCustomerOrders(db, await make("D", "Deng Risk", "02055550004"), 4, 150, "500.00"); // R2 F3
    await seedCustomerOrders(db, await make("E", "Eak Lost", "02055550005"), 1, 400, "40.00"); // R1 F1 M1
    await seedCustomerOrders(db, await make("F", "Fa Regular", "02055550006"), 2, 70, "200.00"); // R3 F2
    const g = await make("G", "Gai Prospect", null);
    await seedCustomerOrder(db, g, { status: "PENDING_PAYMENT" });
    await seedCustomerOrder(db, g, { status: "CANCELLED" });
  }
  const list = (query = "", auth = manager) => request(server()).get(`/crm/customers${query}`).set(auth);

  describe("GET /crm/customers", () => {
    beforeEach(seedSegments);

    it("ສະຖິຕິ ແລະ ກຸ່ມ RFM ຂອງແຕ່ລະຄົນ; ບິນຄ້າງຈ່າຍ/ຍົກເລີກບໍ່ນັບ", async () => {
      const res = await list("?pageSize=50").expect(200);
      expect(res.body).toMatchObject({ total: 7, page: 1, pageSize: 50 });
      const byName = Object.fromEntries(res.body.items.map((row: { name: string }) => [row.name.split(" ")[0], row]));
      expect(byName.Anou).toMatchObject({ orderCount: 10, totalSpent: "10000.00", segment: "CHAMPION", phone: "02055550001" });
      expect(byName.Bounmy).toMatchObject({ orderCount: 3, totalSpent: "900.00", segment: "LOYAL" });
      expect(byName.Chan).toMatchObject({ orderCount: 1, segment: "NEW" });
      expect(byName.Deng).toMatchObject({ orderCount: 4, segment: "AT_RISK" });
      expect(byName.Eak).toMatchObject({ orderCount: 1, segment: "LOST" });
      expect(byName.Fa).toMatchObject({ orderCount: 2, segment: "REGULAR" });
      expect(byName.Gai).toMatchObject({ orderCount: 0, totalSpent: "0.00", lastPaidAt: null, segment: null });
      expect(typeof byName.Anou.lastPaidAt).toBe("string");
    });

    it("ລຽງ: lastOrder (ຄ່າເລີ່ມ, ບໍ່ເຄີຍຊື້ຢູ່ທ້າຍ), spent, created", async () => {
      const names = async (query: string) => (await list(query).expect(200)).body.items.map((row: { name: string }) => row.name.split(" ")[0]);
      expect(await names("")).toEqual(["Anou", "Chan", "Fa", "Bounmy", "Deng", "Eak", "Gai"]);
      expect(await names("?sort=spent")).toEqual(["Anou", "Deng", "Bounmy", "Fa", "Chan", "Eak", "Gai"]);
      expect((await names("?sort=created"))[0]).toBe("Gai");
    });

    it("ຄົ້ນຊື່ (ບໍ່ສົນຕົວພິມ) ຫຼື ເບີ; ກັ່ນຕອງກຸ່ມ; ແບ່ງໜ້າ", async () => {
      expect((await list("?q=deng").expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([ids.D]);
      expect((await list("?q=5550003").expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([ids.C]);
      // ຕົວອັກສອນພິເສດຂອງ LIKE ບໍ່ຖືກຕີຄວາມເປັນ wildcard
      expect((await list("?q=%25").expect(200)).body.total).toBe(0);
      const risk = await list("?segment=AT_RISK").expect(200);
      expect(risk.body).toMatchObject({ total: 1 });
      expect(risk.body.items[0].id).toBe(ids.D);
      const page2 = await list("?pageSize=3&page=2").expect(200);
      expect(page2.body).toMatchObject({ total: 7, page: 2, pageSize: 3 });
      expect(page2.body.items).toHaveLength(3);
    });

    it("query ຜິດ → 400", async () => {
      await list("?segment=VIP").expect(400);
      await list("?sort=name").expect(400);
    });
  });

  describe("GET /crm/customers/segments", () => {
    it("ຈຳນວນຕໍ່ກຸ່ມ + ຄົນທີ່ຍັງບໍ່ເຄີຍຊື້", async () => {
      await seedSegments();
      const res = await request(server()).get("/crm/customers/segments").set(manager).expect(200);
      expect(res.body).toEqual({ total: 7, noOrders: 1, segments: { CHAMPION: 1, LOYAL: 1, NEW: 1, AT_RISK: 1, LOST: 1, REGULAR: 1 } });
    });
    it("ບໍ່ມີລູກຄ້າ: ທຸກຄ່າເປັນ 0", async () => {
      const res = await request(server()).get("/crm/customers/segments").set(manager).expect(200);
      expect(res.body).toEqual({ total: 0, noOrders: 0, segments: { CHAMPION: 0, LOYAL: 0, NEW: 0, AT_RISK: 0, LOST: 0, REGULAR: 0 } });
    });
  });

  describe("ສິດ", () => {
    it("crm:read ອ່ານໄດ້; ບໍ່ມີ crm:read → 403; ບໍ່ login → 401", async () => {
      await list("", chat).expect(200);
      await list("", warehouse).expect(403);
      await request(server()).get("/crm/customers").expect(401);
      await request(server()).get("/crm/customers/segments").set(warehouse).expect(403);
    });
  });
});
