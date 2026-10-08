import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SLIP_FETCH, SLIP_QUEUE } from "../src/modules/payments/slip.providers";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const JPEG = Buffer.from("ffd8ffe000104a464946", "hex");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const GIF = Buffer.from("474946383961000000000000", "hex");

describe("slips (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let dir: string;
  const enqueueRead = vi.fn(async (_slipId: string) => {});
  // fake fetch: ຫ້າມອອກເຄືອຂ່າຍຈິງ
  const fetchImpl = vi.fn<typeof fetch>();
  const server = () => app.getHttpServer();
  const as = (name: string) => bearerFor(app, `${name.toLowerCase()}@role.test`);

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "oca-slips-"));
    ({ app, db } = await createTestApp({ SLIP_STORAGE_DIR: dir }, (builder) =>
      builder.overrideProvider(SLIP_QUEUE).useValue({ enqueueRead }).overrideProvider(SLIP_FETCH).useValue(fetchImpl),
    ));
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    // ລ້າງ storage ທຸກ test ເພື່ອກວດ orphan ໄດ້ແນ່ນອນ
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    await resetDb(db);
    await seedRoleUsers(db);
    enqueueRead.mockClear();
    fetchImpl.mockReset();
    enqueueRead.mockResolvedValue(undefined);
  });

  const makeOrder = (patch: object = {}) =>
    db.order.create({
      data: {
        orderNumber: `SO-${Math.random().toString(36).slice(2, 8)}`,
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "100000",
        vatRate: "0",
        vatAmount: "0",
        total: "100000",
        reservedUntil: new Date(Date.now() + 3_600_000),
        ...patch,
      },
    });

  const upload = (orderId: string, headers: { Authorization: string }, file: Buffer = PNG, filename = "slip.png") =>
    request(server()).post(`/orders/${orderId}/slips`).set(headers).attach("file", file, filename);

  /** GET ຮູບແບບ buffer ຖ້າເປັນ binary (reuse ໃນ task ຕໍ່ໄປ) */
  const getImage = (slipId: string, headers: { Authorization: string }) =>
    request(server())
      .get(`/slips/${slipId}/image`)
      .set(headers)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

  /** ລາຍຊື່ໄຟລ໌ທັງໝົດ (ບໍ່ລວມໂຟເດີ) ໃນ storage ຊົ່ວຄາວ */
  const storedFiles = async () =>
    (await readdir(dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());

  describe("ອັບໂຫຼດ", () => {
    it("JPEG ແລະ WebP ຖືກຮັບ ແລະ imageMime ຖືກຕາມ magic bytes", async () => {
      const order = await makeOrder();
      const owner = await as("OWNER");
      const jpeg = await upload(order.id, owner, JPEG, "a.bin").expect(201);
      const webp = await upload(order.id, owner, WEBP, "b.bin").expect(201);
      expect(jpeg.body.imageMime).toBe("image/jpeg");
      expect(webp.body.imageMime).toBe("image/webp");
    });

    it("ບໍ່ມີ token → 401 ທັງ POST ແລະ GET ລາຍການ", async () => {
      const order = await makeOrder();
      await request(server()).post(`/orders/${order.id}/slips`).attach("file", PNG, "slip.png").expect(401);
      await request(server()).get(`/orders/${order.id}/slips`).expect(401);
    });

    it("DB create ລົ້ມ → ລຶບໄຟລ໌ທີ່ເກັບໄປແລ້ວ (ບໍ່ມີ orphan), ຕອບ 500, ບໍ່ enqueue", async () => {
      const order = await makeOrder();
      const owner = await as("OWNER");
      const spy = vi.spyOn(db.paymentSlip, "create").mockRejectedValueOnce(new Error("db down"));
      try {
        await upload(order.id, owner).expect(500);
      } finally {
        spy.mockRestore();
      }
      expect(await storedFiles()).toHaveLength(0);
      expect(enqueueRead).not.toHaveBeenCalled();
    });

    it("201: ເກັບຮູບ, ສ້າງ PENDING_READ, enqueue ອ່ານ, ບັນທຶກ audit; ຕອບ DTO ທີ່ບໍ່ຮົ່ວ imageKey", async () => {
      const order = await makeOrder();
      const res = await upload(order.id, await as("CHAT_ADMIN")).expect(201);
      expect(res.body).toMatchObject({
        orderId: order.id,
        source: "UPLOAD",
        status: "PENDING_READ",
        imageMime: "image/png",
        imageBytes: PNG.length,
        flags: [],
        read: { amount: null, refNo: null },
        confirmed: { amount: null },
        reviewedBy: null,
      });
      expect(res.body).not.toHaveProperty("imageKey");
      expect(res.body).not.toHaveProperty("readRaw");
      expect(enqueueRead).toHaveBeenCalledWith(res.body.id);
      const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.imageSha256).toMatch(/^[0-9a-f]{64}$/);
      const audits = await db.auditLog.findMany({ where: { action: "slip.create", entityId: res.body.id } });
      expect(audits).toHaveLength(1);
      const chatAdmin = await db.user.findUniqueOrThrow({ where: { email: "chat_admin@role.test" } });
      expect(audits[0]?.userId).toBe(chatAdmin.id);
    });

    it("ຊະນິດຮູບຖືກກວດຈາກ magic bytes ບໍ່ແມ່ນຊື່ໄຟລ໌/Content-Type: gif ປອມເປັນ .png → 422 SLIP_FILE_INVALID", async () => {
      const order = await makeOrder();
      const res = await upload(order.id, await as("OWNER"), GIF, "slip.png").expect(422);
      expect(res.body.code).toBe("SLIP_FILE_INVALID");
      expect(await db.paymentSlip.count()).toBe(0);
    });

    it("ບໍ່ເຊື່ອ mimetype ຈາກ client: gif ທີ່ອ້າງ image/png → 422", async () => {
      const order = await makeOrder();
      const owner = await as("OWNER");
      const res = await request(server())
        .post(`/orders/${order.id}/slips`)
        .set(owner)
        .attach("file", GIF, { filename: "slip.png", contentType: "image/png" })
        .expect(422);
      expect(res.body.code).toBe("SLIP_FILE_INVALID");
    });

    it("ບໍ່ມີໄຟລ໌ → 422; ໄຟລ໌ວ່າງ → 422; ໃຫຍ່ເກີນ → 413", async () => {
      const order = await makeOrder();
      const owner = await as("OWNER");
      const none = await request(server()).post(`/orders/${order.id}/slips`).set(owner).send({}).expect(422);
      expect(none.body.code).toBe("SLIP_FILE_INVALID");
      await upload(order.id, owner, Buffer.alloc(0)).expect(422);
      const big = Buffer.concat([PNG, Buffer.alloc(8 * 1024 * 1024)]);
      await upload(order.id, owner, big).expect(413);
    });

    it("ບິນບໍ່ມີ → 404 ORDER_NOT_FOUND; ບໍ່ມີ orders:write (WAREHOUSE) → 403", async () => {
      const owner = await as("OWNER");
      const res = await upload("nope", owner).expect(404);
      expect(res.body.code).toBe("ORDER_NOT_FOUND");
      const order = await makeOrder();
      await upload(order.id, await as("WAREHOUSE")).expect(403);
    });

    it("enqueue ລົ້ມ (Redis ຫາຍ) → ຍັງ 201 ແລະ ສະລິບຄ້າງ PENDING_READ (retry ໄດ້ພາຍຫຼັງ)", async () => {
      enqueueRead.mockRejectedValueOnce(new Error("redis down"));
      const order = await makeOrder();
      const res = await upload(order.id, await as("OWNER")).expect(201);
      expect(res.body.status).toBe("PENDING_READ");
    });
  });

  describe("ອ່ານ", () => {
    it("GET /orders/:id/slips ໃໝ່ກ່ອນ; GET /slips/:id; ຜູ້ມີ orders:read (WAREHOUSE) ເຫັນໄດ້", async () => {
      const order = await makeOrder();
      const owner = await as("OWNER");
      const first = await upload(order.id, owner).expect(201);
      const second = await upload(order.id, owner).expect(201);
      const warehouse = await as("WAREHOUSE");
      const list = await request(server()).get(`/orders/${order.id}/slips`).set(warehouse).expect(200);
      expect(list.body.map((s: { id: string }) => s.id)).toEqual([second.body.id, first.body.id]);
      const one = await request(server()).get(`/slips/${first.body.id}`).set(warehouse).expect(200);
      expect(one.body.id).toBe(first.body.id);
    });

    it("404: ບິນ/ສະລິບບໍ່ມີ", async () => {
      const owner = await as("OWNER");
      expect((await request(server()).get("/orders/nope/slips").set(owner).expect(404)).body.code).toBe("ORDER_NOT_FOUND");
      expect((await request(server()).get("/slips/nope").set(owner).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
    });

    it("GET /slips/:id/image ຂອງສະລິບທີ່ບໍ່ມີ → 404 JSON code SLIP_NOT_FOUND (filter ທັງໝົດຍັງເຮັດວຽກກັບ @Res)", async () => {
      const owner = await as("OWNER");
      const res = await request(server()).get("/slips/nope/image").set(owner).expect(404);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.code).toBe("SLIP_NOT_FOUND");
    });

    it("GET /slips/:id/image ເມື່ອໄຟລ໌ໃນ storage ຫາຍ → 404 JSON SLIP_NOT_FOUND", async () => {
      const order = await makeOrder();
      const owner = await as("OWNER");
      const created = await upload(order.id, owner).expect(201);
      await rm(dir, { recursive: true, force: true });
      const res = await request(server()).get(`/slips/${created.body.id}/image`).set(owner).expect(404);
      expect(res.body.code).toBe("SLIP_NOT_FOUND");
    });

    it("GET /slips/:id/image: bytes ເດີມ + header ປອດໄພ; ຕ້ອງ login", async () => {
      const order = await makeOrder();
      const owner = await as("OWNER");
      const created = await upload(order.id, owner).expect(201);
      const res = await getImage(created.body.id, owner).expect(200);
      expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.headers["content-length"]).toBe(String(PNG.length));
      expect(res.headers["content-disposition"]).toBe("inline");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
      expect(res.headers["cache-control"]).toBe("private, no-store");
      await request(server()).get(`/slips/${created.body.id}/image`).expect(401);
    });
  });

  describe("ຜູກຈາກແຊັດ", () => {
    async function seedChat(attachments: unknown = [{ type: "image", url: "https://cdn.example/a.png" }]) {
      const conversation = await db.conversation.create({
        data: { channel: "FACEBOOK", externalThreadId: `T${Math.random()}`, displayName: "C", lastMessageAt: new Date() },
      });
      const message = await db.message.create({
        data: { conversationId: conversation.id, direction: "IN", text: null, attachments: attachments as object },
      });
      const order = await makeOrder({ conversationId: conversation.id });
      return { conversation, message, order };
    }
    const link = (cid: string, mid: string, body: object, headers: { Authorization: string }) =>
      request(server()).post(`/conversations/${cid}/messages/${mid}/slips`).set(headers).send(body);

    it("201: ດາວໂຫຼດຮູບຈາກ attachment, ເກັບ, ຜູກບິນ+ເຄສ+ຂໍ້ຄວາມ, enqueue", async () => {
      const { conversation, message, order } = await seedChat();
      fetchImpl.mockResolvedValueOnce(new Response(PNG, { status: 200 }));
      const res = await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, await as("CHAT_ADMIN")).expect(201);
      expect(res.body).toMatchObject({
        source: "CHAT",
        status: "PENDING_READ",
        orderId: order.id,
        conversationId: conversation.id,
        messageId: message.id,
        attachmentIndex: 0,
      });
      expect(fetchImpl).toHaveBeenCalledWith("https://cdn.example/a.png", expect.objectContaining({ redirect: "error" }));
      expect(enqueueRead).toHaveBeenCalledWith(res.body.id);
      expect((await storedFiles()).length).toBeGreaterThan(0);
    });

    it("ຜູກຊ້ຳ (ຂໍ້ຄວາມ+ລຳດັບດຽວກັນ) → 409 DUPLICATE_VALUE ໂດຍບໍ່ດາວໂຫຼດຊ້ຳ", async () => {
      const { conversation, message, order } = await seedChat();
      fetchImpl.mockResolvedValue(new Response(PNG, { status: 200 }));
      const owner = await as("OWNER");
      await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(201);
      fetchImpl.mockClear();
      const res = await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(409);
      expect(res.body.code).toBe("DUPLICATE_VALUE");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("ແຂ່ງກັນຜູກ (unique violation ຕອນ create) → 409 DUPLICATE_VALUE ແລະ ລຶບໄຟລ໌ທີ່ເກັບແລ້ວ", async () => {
      const { conversation, message, order } = await seedChat();
      fetchImpl.mockResolvedValueOnce(new Response(PNG, { status: 200 }));
      const spy = vi
        .spyOn(db.paymentSlip, "create")
        .mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
      let res;
      try {
        res = await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, await as("OWNER")).expect(409);
      } finally {
        spy.mockRestore();
      }
      expect(res.body.code).toBe("DUPLICATE_VALUE");
      expect(await storedFiles()).toHaveLength(0);
      expect(enqueueRead).not.toHaveBeenCalled();
    });

    it("404: ເຄສ/ຂໍ້ຄວາມບໍ່ກົງ → CONVERSATION_NOT_FOUND; ບິນບໍ່ແມ່ນຂອງເຄສນີ້ → ORDER_NOT_FOUND", async () => {
      const { conversation, message, order } = await seedChat();
      const other = await seedChat();
      const owner = await as("OWNER");
      const wrongConv = await link(other.conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(404);
      expect(wrongConv.body.code).toBe("CONVERSATION_NOT_FOUND");
      const wrongOrder = await link(conversation.id, message.id, { orderId: other.order.id, attachmentIndex: 0 }, owner).expect(404);
      expect(wrongOrder.body.code).toBe("ORDER_NOT_FOUND");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("attachment ບໍ່ມີ (ລຳດັບເກີນ)/ບໍ່ແມ່ນຮູບ/ບໍ່ມີ url/attachments=null/ບໍ່ແມ່ນ array → 422 SLIP_FILE_INVALID", async () => {
      const owner = await as("OWNER");
      const cases: unknown[] = [
        [],
        [{ type: "image", url: "https://x/a.png" }], // index 0 ມີ ແຕ່ຈະຂໍ index 1 ຂ້າງລຸ່ມ
        [{ type: "file", url: "https://x/a" }],
        [{ type: "image", url: null }],
        [{ type: "image", url: "" }],
        { type: "image", url: "https://x/a.png" },
        "oops",
      ];
      for (const [i, attachments] of cases.entries()) {
        const { conversation, message, order } = await seedChat(attachments);
        const attachmentIndex = i === 1 ? 5 : 0;
        const res = await link(conversation.id, message.id, { orderId: order.id, attachmentIndex }, owner).expect(422);
        expect(res.body.code).toBe("SLIP_FILE_INVALID");
      }
      // Message.attachments = null (Prisma JSON null ຕ້ອງໃຊ້ undefined/ຄ່າເລີ່ມຕົ້ນ)
      const conversation = await db.conversation.create({
        data: { channel: "FACEBOOK", externalThreadId: `T${Math.random()}`, displayName: "C", lastMessageAt: new Date() },
      });
      const message = await db.message.create({ data: { conversationId: conversation.id, direction: "IN", text: "hi" } });
      const order = await makeOrder({ conversationId: conversation.id });
      const res = await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(422);
      expect(res.body.code).toBe("SLIP_FILE_INVALID");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("ດາວໂຫຼດລົ້ມ (ລິ້ງໝົດອາຍຸ 403) ຫຼື ບໍ່ແມ່ນຮູບ → 422 ແລະ ບໍ່ສ້າງແຖວ", async () => {
      const { conversation, message, order } = await seedChat();
      const owner = await as("OWNER");
      fetchImpl.mockResolvedValueOnce(new Response("expired", { status: 403 }));
      await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(422);
      fetchImpl.mockResolvedValueOnce(new Response(GIF, { status: 200 }));
      await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(422);
      expect(await db.paymentSlip.count()).toBe(0);
      expect(await storedFiles()).toHaveLength(0);
    });

    it("ຕ້ອງ orders:write ແລະ inbox:write: ACCOUNTANT/WAREHOUSE → 403; body ຜິດ → 400", async () => {
      const { conversation, message, order } = await seedChat();
      await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, await as("WAREHOUSE")).expect(403);
      await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, await as("ACCOUNTANT")).expect(403);
      await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: -1 }, await as("OWNER")).expect(400);
    });

    it("GET /conversations/:id/slips ຄືນສະລິບຂອງເຄສ (ເພື່ອ UI ຮູ້ວ່າຮູບໃດຜູກແລ້ວ); ເຄສບໍ່ມີ → 404", async () => {
      const { conversation, message, order } = await seedChat();
      fetchImpl.mockResolvedValueOnce(new Response(PNG, { status: 200 }));
      const owner = await as("OWNER");
      await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(201);
      const res = await request(server()).get(`/conversations/${conversation.id}/slips`).set(owner).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ messageId: message.id, attachmentIndex: 0 });
      expect((await request(server()).get("/conversations/nope/slips").set(owner).expect(404)).body.code).toBe("CONVERSATION_NOT_FOUND");
    });
  });
});
