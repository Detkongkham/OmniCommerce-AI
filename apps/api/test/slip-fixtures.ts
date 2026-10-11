import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { SLIP_FETCH, SLIP_QUEUE } from "../src/modules/payments/slip.providers";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

export const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
export const JPEG = Buffer.from("ffd8ffe000104a464946", "hex");
export const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
export const GIF = Buffer.from("474946383961000000000000", "hex");

/**
 * ຕັ້ງ app/db/ໂຟເດີ storage ຊົ່ວຄາວ/fake (SLIP_QUEUE, SLIP_FETCH) ແລະ hook ລ້າງຂໍ້ມູນ.
 * ເອີ້ນພາຍໃນ describe ຂອງໄຟລ໌ test; ຄືນ accessor ໃຫ້ໃຊ້ຮ່ວມ.
 */
export function setupSlipTest() {
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

  /** ສ້າງສະລິບ READ ພ້ອມບິນ (ໃຊ້ຮ່ວມຫຼາຍ describe) */
  async function seedSlip(patch: object = {}, orderPatch: object = {}) {
    const order = await makeOrder(orderPatch);
    const slip = await db.paymentSlip.create({
      data: {
        source: "UPLOAD",
        orderId: order.id,
        imageKey: "slips/none",
        imageMime: "image/png",
        imageBytes: 1,
        imageSha256: Math.random().toString(16).slice(2).padEnd(64, "0"),
        status: "READ",
        readAmount: "100000",
        readCurrency: "LAK",
        readRefNo: "R1",
        ...patch,
      },
    });
    return { order, slip };
  }

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

  return {
    /** db ຖືກສ້າງໃນ beforeAll: proxy ໃຫ້ destructure ໄດ້ກ່ອນ app ເລີ່ມ */
    db: new Proxy({} as PrismaClient, { get: (_t, prop) => (db as never)[prop] }),
    server,
    as,
    enqueueRead,
    fetchImpl,
    makeOrder,
    seedSlip,
    getImage,
    storedFiles,
    /** ລຶບໂຟເດີ storage ທັງໝົດ (ຈຳລອງໄຟລ໌ຫາຍ) */
    wipeStorage: () => rm(dir, { recursive: true, force: true }),
  };
}
