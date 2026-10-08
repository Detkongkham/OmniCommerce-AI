import { existsSync } from "node:fs";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { MEDIA_MAX_BYTES } from "@oca/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StorageService } from "../src/common/storage/storage.service";
import { TEST_PNG, bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

describe("media (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let chat: { Authorization: string };
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
    chat = await bearerFor(app, "chat_admin@role.test");
  });

  it("ອັບໂຫຼດ PNG → ບັນທຶກ MediaFile + ໄຟລ໌ເທິງ disk; ດຶງຄືນແບບບໍ່ login ພ້ອມ header", async () => {
    const res = await request(server()).post("/media").set(chat).attach("file", TEST_PNG, "ຮູບ.png").expect(201);
    expect(res.body).toMatchObject({ mimeType: "image/png", size: TEST_PNG.length, originalName: "ຮູບ.png" });
    expect(res.body.path).toMatch(/^\/media\/files\/[a-f0-9]{32}\.png$/);

    const row = await db.mediaFile.findUniqueOrThrow({ where: { id: res.body.id } });
    const storage = app.get(StorageService);
    expect(existsSync(join(storage.root, row.storageKey))).toBe(true);

    const file = await request(server()).get(res.body.path).buffer(true).expect(200);
    expect(Buffer.compare(file.body as Buffer, TEST_PNG)).toBe(0);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["cache-control"]).toContain("immutable");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["cross-origin-resource-policy"]).toBe("cross-origin");

    const audit = await db.auditLog.findFirst({ where: { action: "media.upload", entityId: res.body.id } });
    expect(audit).not.toBeNull();
  });

  it("ປະເພດປອມ (ນາມສະກຸນ .png ແຕ່ເປັນ SVG) → 400 MEDIA_INVALID/TYPE ແລະ ບໍ່ບັນທຶກ", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await request(server()).post("/media").set(chat).attach("file", svg, { filename: "x.png", contentType: "image/png" }).expect(400);
    expect(res.body).toMatchObject({ code: "MEDIA_INVALID", reason: "TYPE" });
    expect(await db.mediaFile.count()).toBe(0);
  });

  it("ໃຫຍ່ເກີນ 8 MB → 400 MEDIA_INVALID/SIZE", async () => {
    const big = Buffer.concat([TEST_PNG, Buffer.alloc(MEDIA_MAX_BYTES)]);
    const res = await request(server()).post("/media").set(chat).attach("file", big, "big.png").expect(400);
    expect(res.body).toMatchObject({ code: "MEDIA_INVALID", reason: "SIZE" });
    expect(await db.mediaFile.count()).toBe(0);
  });

  it("ບໍ່ມີໄຟລ໌ / field ຜິດ → 400 MEDIA_INVALID/MISSING", async () => {
    const none = await request(server()).post("/media").set(chat).field("x", "y").expect(400);
    expect(none.body).toMatchObject({ code: "MEDIA_INVALID", reason: "MISSING" });
    const wrong = await request(server()).post("/media").set(chat).attach("photo", TEST_PNG, "a.png").expect(400);
    expect(wrong.body).toMatchObject({ code: "MEDIA_INVALID", reason: "MISSING" });
    const json = await request(server()).post("/media").set(chat).send({}).expect(400);
    expect(json.body).toMatchObject({ code: "MEDIA_INVALID", reason: "MISSING" });
  });

  it("ສິດ: ຕ້ອງ posting:write (WAREHOUSE ບໍ່ມີ → 403); ບໍ່ login → 401", async () => {
    const warehouse = await bearerFor(app, "warehouse@role.test");
    await request(server()).post("/media").set(warehouse).attach("file", TEST_PNG, "a.png").expect(403);
    await request(server()).post("/media").attach("file", TEST_PNG, "a.png").expect(401);
  });

  it("ດຶງໄຟລ໌: key ຜິດຮູບແບບ / path traversal / ບໍ່ມີ → 404 MEDIA_NOT_FOUND", async () => {
    for (const key of ["nope", "..%2F..%2Fetc%2Fpasswd", `${"a".repeat(32)}.png`, `${"a".repeat(32)}.svg`]) {
      const res = await request(server()).get(`/media/files/${key}`).expect(404);
      expect(res.body.code).toBe("MEDIA_NOT_FOUND");
    }
  });
});
