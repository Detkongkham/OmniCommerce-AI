import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, receive } from "@oca/database";
import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { SLIP_QUEUE } from "../src/modules/payments/slip.providers";
import { createTestApp, resetDb, seedCatalog } from "./helpers";

/** key ທີ່ຫ້າມປາກົດໃນ response ຂອງ /store (ຕົ້ນທຶນ, ສະຕ໋ອກດິບ, ຂໍ້ມູນພາຍໃນ) */
export const FORBIDDEN_KEYS = [
  "costPrice",
  "unitCost",
  "onHand",
  "reserved",
  "warehouseId",
  "sku",
  "barcode",
  "createdById",
  "customerId",
  "idempotencyKey",
  "idempotencyHash",
  "imageKey",
  "readRaw",
  "publicToken",
];

export function keysOf(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const inner of value) keysOf(inner, out);
  else if (value !== null && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      out.add(key);
      keysOf(inner, out);
    }
  }
  return out;
}

/**
 * app + db ສຳລັບ test ຂອງ /store: storage ສະລິບຊົ່ວຄາວ, ຄິວສະລິບ fake, rate limit ສູງ (override ໄດ້ຜ່ານ env).
 * ທຸກ test: ລ້າງຖານ → ສາງ A (default) + B, ສິນຄ້າ "Product" (ACTIVE) ມີ SKU-1 ສະຕ໋ອກ 10 ແລະ SKU-2 ສະຕ໋ອກ 0, courier 1 ເຈົ້າ.
 */
export function setupStoreTest(env: Record<string, string> = {}) {
  let app: INestApplication;
  let db: PrismaClient;
  let dir: string;
  const enqueueRead = vi.fn(async (_slipId: string) => {});
  const state = {} as {
    f: Awaited<ReturnType<typeof seedCatalog>>;
    courier: { id: string; name: string };
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "oca-store-"));
    ({ app, db } = await createTestApp(
      {
        SLIP_STORAGE_DIR: dir,
        STORE_ORDER_RATE_LIMIT: "1000",
        STORE_SLIP_RATE_LIMIT: "1000",
        STORE_CHECK_RATE_LIMIT: "1000",
        ...env,
      },
      (builder) => builder.overrideProvider(SLIP_QUEUE).useValue({ enqueueRead }),
    ));
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await resetDb(db);
    enqueueRead.mockClear();
    state.f = await seedCatalog(db);
    await db.$transaction((tx) => receive(tx, { variantId: state.f.v1.id, warehouseId: state.f.whA.id, quantity: 10 }));
    state.courier = await db.courier.create({
      data: { code: "ANS", name: "Anousith", trackingUrlTemplate: "https://track.example/{tracking}" },
    });
  });

  return {
    server: () => app.getHttpServer(),
    db: () => db,
    state,
    enqueueRead,
  };
}
