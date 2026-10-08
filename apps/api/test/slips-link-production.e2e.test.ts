import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SLIP_FETCH, SLIP_QUEUE } from "../src/modules/payments/slip.providers";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

/** ແອັບແລ່ນດ້ວຍ NODE_ENV=production: allowHttp=false → ຕ້ອງປະຕິເສດ http/host ພາຍໃນກ່ອນ fetch */
describe("slips link from chat (production guard)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let dir: string;
  const fetchImpl = vi.fn<typeof fetch>();
  const enqueueRead = vi.fn(async (_slipId: string) => {});

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "oca-slips-prod-"));
    ({ app, db } = await createTestApp(
      { SLIP_STORAGE_DIR: dir, NODE_ENV: "production", JWT_ACCESS_SECRET: "x".repeat(48) },
      (builder) => builder.overrideProvider(SLIP_QUEUE).useValue({ enqueueRead }).overrideProvider(SLIP_FETCH).useValue(fetchImpl),
    ));
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    fetchImpl.mockReset();
    enqueueRead.mockClear();
  });

  it("URL http / IP ພາຍໃນ / localhost → 422 SLIP_FILE_INVALID ແລະ ບໍ່ເອີ້ນ fetch", async () => {
    const owner = await bearerFor(app, "owner@role.test");
    const urls = [
      "http://cdn.example/a.png",
      "https://127.0.0.1/a.png",
      "https://10.0.0.5/a.png",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/a.png",
    ];
    for (const url of urls) {
      const conversation = await db.conversation.create({
        data: { channel: "FACEBOOK", externalThreadId: `T${Math.random()}`, displayName: "C", lastMessageAt: new Date() },
      });
      const message = await db.message.create({
        data: { conversationId: conversation.id, direction: "IN", text: null, attachments: [{ type: "image", url }] },
      });
      const order = await db.order.create({
        data: {
          orderNumber: `SO-${Math.random().toString(36).slice(2, 8)}`,
          channel: "OFFLINE",
          source: "MANUAL",
          currency: "LAK",
          subtotal: "1",
          vatRate: "0",
          vatAmount: "0",
          total: "1",
          reservedUntil: new Date(Date.now() + 3_600_000),
          conversationId: conversation.id,
        },
      });
      const res = await request(app.getHttpServer())
        .post(`/conversations/${conversation.id}/messages/${message.id}/slips`)
        .set(owner)
        .send({ orderId: order.id, attachmentIndex: 0 });
      expect(res.status, url).toBe(422);
      expect(res.body.code, url).toBe("SLIP_FILE_INVALID");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await db.paymentSlip.count()).toBe(0);
  });
});
