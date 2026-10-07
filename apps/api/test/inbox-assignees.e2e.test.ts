import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedInboxReader, seedRoleUsers } from "./helpers";

describe("GET /inbox/assignees (e2e)", () => {
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
    await seedRoleUsers(db);
    await seedInboxReader(db);
  });

  it("ຄືນສະເພາະຜູ້ໃຊ້ active ທີ່ມີ inbox:write (ລຽງຕາມຊື່) ໂດຍ CHAT_ADMIN ກໍເອີ້ນໄດ້ (ບໍ່ຕ້ອງ staff:read)", async () => {
    const chat = await bearerFor(app, "chat_admin@role.test");
    const res = await request(server()).get("/inbox/assignees").set(chat).expect(200);
    expect(res.body.map((user: { name: string }) => user.name)).toEqual(["CHAT_ADMIN", "MANAGER", "OWNER"]);
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"]);
  });

  it("ຕັດຄົນທີ່ຖືກປິດໃຊ້ງານ ແລະ ຄົນທີ່ມີແຕ່ inbox:read ອອກ", async () => {
    await db.user.update({ where: { email: "manager@role.test" }, data: { isActive: false } });
    const owner = await bearerFor(app, "owner@role.test");
    const res = await request(server()).get("/inbox/assignees").set(owner).expect(200);
    const names = res.body.map((user: { name: string }) => user.name);
    expect(names).toEqual(["CHAT_ADMIN", "OWNER"]);
    expect(names).not.toContain("Inbox Reader");
  });

  it("ຕ້ອງ login ແລະ inbox:read", async () => {
    await request(server()).get("/inbox/assignees").expect(401);
    const accountant = await bearerFor(app, "accountant@role.test");
    await request(server()).get("/inbox/assignees").set(accountant).expect(403);
    const reader = await bearerFor(app, "inbox-read@test.local");
    await request(server()).get("/inbox/assignees").set(reader).expect(200);
  });
});
