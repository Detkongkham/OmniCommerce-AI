# Phase 1-A3: Worker `expire-reservations`, Docs ແລະ Smoke Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ໃຫ້ worker ຄືນສະຕ໋ອກຂອງບິນທີ່ໝົດເວລາຈອງອັດຕະໂນມັດທຸກນາທີ, ອັບເດດເອກະສານ, ແລະກວດທັງລະບົບດ້ວຍ smoke test ຈິງ (ສ້າງສິນຄ້າ → ຮັບສະຕ໋ອກ → ສ້າງບິນ → ໝົດເວລາ → ຄືນສະຕ໋ອກ).

**Architecture:** Logic ການຄືນສະຕ໋ອກຢູ່ໃນ `@oca/database` (`runExpireReservations`, ສ້າງແລະທົດສອບກັບ Postgres ຈິງໃນ plan 1a-1). Worker ມີແຕ່ຕົວຫໍ່ບາງໆ: queue `inventory` + job scheduler repeat ທຸກ 60 ວິນາທີ ຮູບແບບດຽວກັບ `MaintenanceWorker`.

**Tech Stack:** NestJS 11 (application context), BullMQ 5, ioredis, Vitest, Redis ຈິງສຳລັບ integration test.

**ອ້າງອີງ spec:** [2026-10-04-phase1-a-inventory-design.md](../specs/2026-10-04-phase1-a-inventory-design.md) §8, §12. **ຕ້ອງເຮັດ plan 1a-1 ແລະ 1a-2a/2b ໃຫ້ສຳເລັດກ່ອນ.** ແຜນຕໍ່ໄປ: **1a-ui**.

## ຂໍ້ຕົກລົງສຳຄັນ (ອ່ານກ່ອນເລີ່ມ)

* ຂໍ້ຕົກລົງຂອງ worker ໃນ Phase 0 (`docs/superpowers/plans/2026-10-04-phase0-c2-worker.md`) ໃຊ້ໄດ້: `@Inject(Token)`, `vitest` ໃຊ້ `oxc.decorator.legacy`, **Redis ຂອງໂປຣເຈັກເທົ່ານັ້ນ** (`REDIS_URL` ໃນ `.env`, ຫ້າມພອດ 6379 ຂອງຜູ້ໃຊ້), test ໃຊ້ `QUEUE_PREFIX` ສຸ່ມ ແລ້ວ `obliterate`.
* Worker test ບໍ່ມີ Postgres: stub `PRISMA`. Logic ຄືນສະຕ໋ອກຈິງຖືກທົດສອບແລ້ວໃນ `apps/api/test/expire-reservations.test.ts` (1a-1).
* ຫຼັງແກ້ `@oca/database` ໃຫ້ `pnpm --filter @oca/database build` ກ່ອນຮັນ test ຂອງ worker.

---

## File Structure

```
apps/worker/
├── src/queues/names.ts                          (ແກ້)
├── src/processors/expire-reservations.processor.ts (+ .test.ts)   (ໃໝ່)
├── src/processors/inventory.worker.ts           (ໃໝ່)
├── src/worker.module.ts                         (ແກ້)
└── test/inventory.worker.test.ts                (ໃໝ່)
docs/DATABASE.md  docs/DEPLOYMENT-NOTES.md  docs/ROADMAP.md  README.md   (ແກ້)
```

---

### Task 1: Processor ຂອງ job `expire-reservations` (TDD)

**Files:**
- Modify: `apps/worker/src/queues/names.ts`
- Create: `apps/worker/src/processors/expire-reservations.processor.ts`, `apps/worker/src/processors/expire-reservations.processor.test.ts`

- [ ] **Step 1: ເພີ່ມຊື່ queue/job**

ໃນ `apps/worker/src/queues/names.ts` ເພີ່ມ (ຕໍ່ຈາກ `QUEUE_MAINTENANCE`):

```ts
export const QUEUE_INVENTORY = "inventory";
```

ແລະຕໍ່ຈາກ `JOB_CLEANUP_REFRESH_TOKENS`:

```ts
export const JOB_EXPIRE_RESERVATIONS = "expire-reservations";
```

- [ ] **Step 2: ຂຽນ test**

`apps/worker/src/processors/expire-reservations.processor.test.ts`:

```ts
import type { PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { expireReservationsJob } from "./expire-reservations.processor";

describe("expireReservationsJob", () => {
  const now = new Date("2026-10-10T12:00:00.000Z");

  it("ຄືນຜົນນັບ expired/skipped/failed ແລະ log ບິນທີ່ພັງ ໂດຍບໍ່ຢຸດບິນອື່ນ", async () => {
    const findMany = vi.fn().mockResolvedValueOnce([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const db = { order: { findMany } } as unknown as PrismaClient;
    const logger = { error: vi.fn() };
    const expire = vi.fn(async (_db: PrismaClient, orderId: string) => {
      if (orderId === "b") throw new Error("boom");
      return orderId === "a";
    });

    const result = await expireReservationsJob(db, logger, { now, expire });

    expect(result).toEqual({ expired: 1, skipped: 1, failed: 1 });
    expect(expire).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]?.[0]).toContain("b");
    expect(logger.error.mock.calls[0]?.[0]).toContain("boom");
  });

  it("ບໍ່ມີບິນໝົດເວລາ → ຜົນເປັນ 0 ທັງໝົດ", async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
    const logger = { error: vi.fn() };
    expect(await expireReservationsJob(db, logger, { now })).toEqual({ expired: 0, skipped: 0, failed: 0 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("ຖາມ findMany ດ້ວຍ status PENDING_PAYMENT ແລະ reservedUntil < now", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { order: { findMany } } as unknown as PrismaClient;
    await expireReservationsJob(db, { error: vi.fn() }, { now, limit: 7 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING_PAYMENT", reservedUntil: { lt: now } }),
        take: 7,
      }),
    );
  });
});
```

- [ ] **Step 3: ຮັນ → fail**

Run: `pnpm --filter @oca/worker test -- expire-reservations`
Expected: FAIL (module ບໍ່ມີ).

- [ ] **Step 4: ຂຽນ processor**

`apps/worker/src/processors/expire-reservations.processor.ts`:

```ts
import {
  type ExpireReservationsOptions,
  type ExpireReservationsResult,
  type PrismaClient,
  runExpireReservations,
} from "@oca/database";

export interface ErrorLogger {
  error(message: string): void;
}

/**
 * ຄືນສະຕ໋ອກຂອງບິນ PENDING_PAYMENT ທີ່ເກີນ reservedUntil. Logic ຢູ່ໃນ @oca/database
 * (ທົດສອບກັບ Postgres ຈິງ); ຕົວນີ້ເພີ່ມແຕ່ການ log ບິນທີ່ພັງ.
 */
export function expireReservationsJob(
  db: PrismaClient,
  logger: ErrorLogger,
  options: ExpireReservationsOptions = {},
): Promise<ExpireReservationsResult> {
  return runExpireReservations(db, {
    ...options,
    onError: (orderId, error) => {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to expire order ${orderId}: ${reason}`);
    },
  });
}
```

- [ ] **Step 5: ຮັນ → pass; commit**

Run: `pnpm --filter @oca/database build && pnpm --filter @oca/worker test -- expire-reservations`
Expected: PASS (3 tests).

```bash
git add apps/worker/src
git commit -m "feat(worker): add expire-reservations processor

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `InventoryWorker` + schedule (TDD integration, Redis ຈິງ)

**Files:**
- Create: `apps/worker/src/processors/inventory.worker.ts`, `apps/worker/test/inventory.worker.test.ts`
- Modify: `apps/worker/src/worker.module.ts`

- [ ] **Step 1: ຂຽນ test**

`apps/worker/test/inventory.worker.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PRISMA } from "../src/prisma/prisma.module";
import { JOB_EXPIRE_RESERVATIONS, QUEUE_INVENTORY } from "../src/queues/names";
import { WorkerModule } from "../src/worker.module";

describe("InventoryWorker (integration, Redis ຈິງ, prisma stub)", () => {
  const prefix = `oca-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL as string;
  const findMany = vi.fn().mockResolvedValue([]);
  let app: INestApplicationContext;
  let producer: Redis;
  let eventsConnection: Redis;
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    expect(redisUrl, "REDIS_URL must be set (copy .env.example to .env)").toBeTruthy();
    process.env.QUEUE_PREFIX = prefix;

    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(PRISMA)
      .useValue({ order: { findMany }, $disconnect: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    producer = new Redis(redisUrl, { maxRetriesPerRequest: null });
    eventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_INVENTORY, { connection: producer, prefix });
    events = new QueueEvents(QUEUE_INVENTORY, { connection: eventsConnection, prefix });
    await events.waitUntilReady();
  });

  afterAll(async () => {
    await events?.close();
    await queue?.obliterate({ force: true });
    await queue?.close();
    await app?.close();
    producer?.disconnect();
    eventsConnection?.disconnect();
    delete process.env.QUEUE_PREFIX;
  });

  it("ລົງທະບຽນ schedule ທຸກ 60 ວິນາທີ ຕອນເລີ່ມ", async () => {
    const scheduler = await queue.getJobScheduler(JOB_EXPIRE_RESERVATIONS);
    expect(scheduler).toMatchObject({ name: JOB_EXPIRE_RESERVATIONS, every: 60_000 });
  });

  it("ຣັນ job ແລະ ຄືນຜົນນັບ (ບໍ່ມີບິນໝົດເວລາ = 0 ທັງໝົດ)", async () => {
    const job = await queue.add(JOB_EXPIRE_RESERVATIONS, {});
    const result = await job.waitUntilFinished(events, 10_000);
    expect(result).toEqual({ expired: 0, skipped: 0, failed: 0 });
    expect(findMany).toHaveBeenCalled();
  });

  it("job ທີ່ບໍ່ຮູ້ຈັກ fail ພ້ອມເຫດຜົນ", async () => {
    const bad = await queue.add("nope", {}, { attempts: 1 });
    await expect(bad.waitUntilFinished(events, 10_000)).rejects.toThrow("Unknown job: nope");
  });
});
```

- [ ] **Step 2: ຮັນ → fail**

Run: `pnpm --filter @oca/worker test -- inventory.worker`
Expected: FAIL (ບໍ່ມີ scheduler / worker ຍັງບໍ່ລົງທະບຽນ).

- [ ] **Step 3: ຂຽນ `InventoryWorker`**

`apps/worker/src/processors/inventory.worker.ts`:

```ts
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { type Job, Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { PRISMA } from "../prisma/prisma.module";
import { JOB_EXPIRE_RESERVATIONS, QUEUE_INVENTORY } from "../queues/names";
import { REDIS } from "../redis/redis.module";
import { expireReservationsJob } from "./expire-reservations.processor";

const EXPIRE_INTERVAL_MS = 60_000;

@Injectable()
export class InventoryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryWorker.name);
  private worker: Worker | undefined;
  private queue: Queue | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    // concurrency 1: ບໍ່ໃຫ້ job ຄືນສະຕ໋ອກສອງອັນຊ້ອນກັນໃນ worker ດຽວ (ເຄື່ອງຈັກກັນຊ້ຳໃນລະດັບ DB ຢູ່ແລ້ວ)
    this.worker = new Worker(QUEUE_INVENTORY, (job) => this.process(job), {
      connection: this.redis,
      prefix: this.env.QUEUE_PREFIX,
      concurrency: 1,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`Job ${job?.name}#${job?.id} failed: ${error.message}`);
    });
    this.worker.on("error", (error) => {
      this.logger.error(error.message);
    });
    await this.worker.waitUntilReady();

    this.queue = new Queue(QUEUE_INVENTORY, { connection: this.redis, prefix: this.env.QUEUE_PREFIX });
    // upsert ເຮັດໃຫ້ idempotent ເມື່ອ restart ຫຼືມີຫຼາຍ worker
    await this.queue.upsertJobScheduler(
      JOB_EXPIRE_RESERVATIONS,
      { every: EXPIRE_INTERVAL_MS },
      { name: JOB_EXPIRE_RESERVATIONS },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_EXPIRE_RESERVATIONS: {
        const result = await expireReservationsJob(this.prisma, this.logger);
        if (result.expired > 0 || result.failed > 0) {
          this.logger.log(
            `Expired ${result.expired} reservation(s), skipped ${result.skipped}, failed ${result.failed}`,
          );
        }
        return result;
      }
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  }
}
```

ແກ້ `apps/worker/src/worker.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module";
import { InventoryWorker } from "./processors/inventory.worker";
import { MaintenanceWorker } from "./processors/maintenance.worker";
import { SystemWorker } from "./processors/system.worker";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [AppConfigModule, RedisModule, PrismaModule],
  providers: [SystemWorker, MaintenanceWorker, InventoryWorker],
})
export class WorkerModule {}
```

- [ ] **Step 4: ຮັນ → pass**

Run: `pnpm --filter @oca/worker test`
Expected: PASS ທັງໝົດ (test ເກົ່າ 11 + ໃໝ່ 6). ຖ້າ `scheduler` ບໍ່ມີ field `every`: print `console.log(scheduler)` ແລ້ວປັບ matcher ໃຫ້ກົງກັບຮູບແບບທີ່ BullMQ ຄືນ (ຕ້ອງຢືນຢັນຄ່າ 60000 ms ຢູ່ໃນນັ້ນ), ຢ່າລົບ assertion ນີ້.

- [ ] **Step 5: Lint + commit**

Run: `pnpm --filter @oca/worker lint`
Expected: ບໍ່ມີ error.

```bash
git add apps/worker
git commit -m "feat(worker): schedule expire-reservations every minute

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ອັບເດດເອກະສານ

**Files:** `docs/DATABASE.md`, `docs/DEPLOYMENT-NOTES.md`, `docs/ROADMAP.md`, `README.md`

- [ ] **Step 1: `docs/DATABASE.md`**

ໃນສ່ວນ "ວົງຈອນຄຳສັ່ງຊື້" ຕໍ່ຈາກ bullet `Worker ຊອກຄຳສັ່ງຊື້ທີ່ໝົດເວລາ...` ເພີ່ມ:

```md
* ເວລາຈອງມາຈາກ `StoreSetting.reservationMinutes` (ຄ່າເລີ່ມຕົ້ນ 30 ນາທີ, ກວມ 1–10080; CHECK ໃນ migration `20261005000000_inventory`). ບິນໜຶ່ງ override ໄດ້ຕອນສ້າງ.
* ເລກບິນມາຈາກ sequence `"Order_number_seq"` ຮູບແບບ `SO-000001`. Rollback ເຮັດໃຫ້ເລກຂາດໄດ້.
```

ໃນສ່ວນ "ການປ້ອງກັນຂາຍເກີນ" ຕໍ່ທ້າຍ (ຫຼັງ paragraph ກ່ຽວກັບ CHECK) ເພີ່ມ:

```md
ການປ່ຽນ `StockLevel` ທັງໝົດຕ້ອງຜ່ານ `packages/database/src/inventory/stock-engine.ts` ເທົ່ານັ້ນ. ການຈອງ/ປ່ອຍ/ຕັດຫຼາຍລາຍການຮຽງຕາມ `(variantId, warehouseId)` ກ່ອນ UPDATE ເພື່ອກັນ deadlock; `transfer` ເຮັດຕາມລຳດັບ `warehouseId`. Invariant ທີ່ test ກວດ: `onHand = Σ(RECEIVE+RETURN+TRANSFER_IN+ADJUST) − Σ(SHIP+TRANSFER_OUT)` ແລະ `reserved = Σ RESERVE − Σ RELEASE − Σ SHIP` ຕໍ່ (variant, ສາງ).
```

ໃນສ່ວນ "ຍັງບໍ່ທັນມີ" ບໍ່ຕ້ອງແກ້.

- [ ] **Step 2: `docs/DEPLOYMENT-NOTES.md`**

ເພີ່ມກ່ອນຫົວຂໍ້ "## ພອດຂອງ Postgres / Redis ໃນ Docker":

```md
## 9. ຄືນສະຕ໋ອກຂອງບິນທີ່ໝົດເວລາຈອງ
- worker ມີ job `expire-reservations` ໃນ queue `inventory` ຣັນທຸກ 60 ວິນາທີ: ບິນ `PENDING_PAYMENT` ທີ່ເກີນ `reservedUntil` ຖືກປ່ຽນເປັນ `EXPIRED` ແລະ ຄືນສະຕ໋ອກທີ່ຈອງ. **ຕ້ອງມີ worker ຢ່າງໜ້ອຍ 1 ໂຕຣັນຢູ່** ບໍ່ດັ່ງນັ້ນສະຕ໋ອກຈະຄ້າງຈອງ (ບິນທີ່ໝົດເວລາຍັງກົດ "ຊຳລະ" ບໍ່ໄດ້ ເພາະ API ກວດ `reservedUntil` ເອງ).
- ຫຼາຍ worker ພ້ອມກັນໄດ້ (scheduler upsert; ການຄືນສະຕ໋ອກມີ guard ໃນ SQL ຈຶ່ງບໍ່ຄືນຊ້ຳ).
- Migration `20261005000000_inventory` ເພີ່ມ `StoreSetting.reservationMinutes` ແລະ sequence ເລກບິນ. **ກວດ migration ນີ້ເທິງ Postgres 16 ກ່ອນ deploy** (ຄືກັບຂໍ້ 6). ຫຼັງ deploy ຕ້ອງຣັນ `pnpm db:seed` ເພື່ອສ້າງແຖວ `StoreSetting` ແລະ ສາງ default `MAIN` (ຕັ້ງຊື່ຮ້ານດ້ວຍ `SEED_STORE_NAME`); ຮັນຊ້ຳໄດ້ປອດໄພ.
```

- [ ] **Step 3: `docs/ROADMAP.md`**

ໃນຕາຕະລາງ Phase 1 ແທນແຖວ `| 1 | 7. Inventory | ສິນຄ້າ, variants, ຕັດສະຕ໋ອກແບບ atomic, ຄຳສັ່ງຊື້ |` ດ້ວຍ:

```md
| 1 | 7. Inventory | ສິນຄ້າ, variants, ຕັດສະຕ໋ອກແບບ atomic, ຄຳສັ່ງຊື້ — **API + worker ສຳເລັດ (1a-api)**, ໜ້າ admin ຢູ່ລະຫວ່າງເຮັດ (1a-ui) |
```

- [ ] **Step 4: `README.md`**

ໃນບັນທັດ `> ໝາຍເຫດ:` ທ້າຍສ່ວນ Getting Started ເພີ່ມປະໂຫຍກທ້າຍ: ` ໂມດູນ Inventory (Phase 1): API ສິນຄ້າ/ສາງ/ສະຕ໋ອກ/ຄຳສັ່ງຊື້ ແລະ job ຄືນສະຕ໋ອກທີ່ໝົດເວລາຈອງ ພ້ອມໃຊ້; ໜ້າ admin ກຳລັງເຮັດ.`

- [ ] **Step 5: Commit**

```bash
git add docs README.md
git commit -m "docs: document inventory engine, reservation expiry and rollout notes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ກວດທັງລະບົບ + Smoke test ຈິງ

- [ ] **Step 1: Lint + build + test ທັງ repo**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: ຜ່ານທັງໝົດ. ບັນທຶກຈຳນວນ test ຂອງແຕ່ລະ package ໄວ້ໃນລາຍງານ.

- [ ] **Step 2: ເປີດ infra ຂອງໂປຣເຈັກ (ແຍກຈາກ Postgres/Redis ຂອງຜູ້ໃຊ້)**

ເຄື່ອງນີ້ບໍ່ມີ Docker: ໃຊ້ວິທີໃນ memory `dev-database-isolation` (embedded-postgres ພອດ 5433, redis-memory-server ພອດ 6380) ຫຼື `pnpm infra:local` ຖ້າພອດ 5432/6379 ວ່າງ ແລະຜູ້ໃຊ້ອະນຸຍາດ. ຢືນຢັນ `.env` ຊີ້ `DATABASE_URL`/`REDIS_URL` ໄປຫາ infra ຂອງໂປຣເຈັກ.

Run:
```bash
pnpm db:deploy
pnpm db:seed
```
Expected: migration `20261005000000_inventory` ຖືກ apply; seed ພິມ `Seed ok: owner ..., store "OCA Store"`; ຮັນ seed ຊ້ຳແລ້ວບໍ່ error.

- [ ] **Step 3: ເປີດ api ແລະ worker**

Run (terminal ແຍກ, ຫຼື `run_in_background`): `pnpm --filter @oca/api dev` ແລະ `pnpm --filter @oca/worker dev`
Expected: api ຟັງ `:3001`; worker log ບໍ່ມີ error.

- [ ] **Step 4: ເດີນເສັ້ນທາງຫຼັກດ້ວຍ curl**

```bash
API=http://localhost:3001
TOKEN=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"$SEED_OWNER_EMAIL\",\"password\":\"$SEED_OWNER_PASSWORD\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
H="Authorization: Bearer $TOKEN"; J='content-type: application/json'

# ສິນຄ້າ ACTIVE ທີ່ມີ 1 variant
PRODUCT=$(curl -s -X POST $API/products -H "$H" -H "$J" \
  -d '{"name":"Smoke Cup","status":"ACTIVE","variants":[{"sku":"SMOKE-1","price":"25000","costPrice":"10000"}]}')
VARIANT=$(echo "$PRODUCT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).variants[0].id')
WH=$(curl -s $API/warehouses -H "$H" | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(w=>w.isDefault).id')

# ຮັບເຂົ້າ 5 ຊິ້ນ
curl -s -X POST $API/stock/receive -H "$H" -H "$J" -d "{\"variantId\":\"$VARIANT\",\"warehouseId\":\"$WH\",\"quantity\":5}"

# ສ້າງບິນ 2 ຊິ້ນ ແລ້ວຈອງບໍ່ພໍ (ຂໍ 4 ຊິ້ນຕໍ່)
curl -s -X POST $API/orders -H "$H" -H "$J" -d "{\"items\":[{\"variantId\":\"$VARIANT\",\"quantity\":2}],\"reservationMinutes\":1}"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/orders -H "$H" -H "$J" -d "{\"items\":[{\"variantId\":\"$VARIANT\",\"quantity\":4}]}"
```
Expected: ສິນຄ້າສ້າງໄດ້ (201); ບິນທຳອິດ `PENDING_PAYMENT`, `SO-000001`; ບິນທີສອງ HTTP `409` ພ້ອມ `shortages`; `GET /stock` ສະແດງ `onHand 5, reserved 2, available 3`.

- [ ] **Step 5: ກວດການໝົດເວລາ**

ລໍຖ້າ ~2 ນາທີ (reservationMinutes=1 + ຮອບ worker 60 ວິນາທີ) ແລ້ວ:

```bash
curl -s "$API/stock?q=SMOKE" -H "$H"
curl -s "$API/orders?status=EXPIRED" -H "$H"
```
Expected: `reserved` ກັບເປັນ `0`; ບິນ `SO-000001` ເປັນ `EXPIRED`; `GET /stock/movements?type=RELEASE` ມີແຖວ `RELEASE` ຜູກ `orderNumber` ນັ້ນ; worker log ມີ `Expired 1 reservation(s)`.

- [ ] **Step 6: ວົງຈອນເຕັມຜ່ານ API**

ສ້າງບິນໃໝ່ແລ້ວ `pay → pack → ship → complete` (ໃຊ້ `POST $API/orders/<id>/pay` ແລະອື່ນໆ). Expected: ແຕ່ລະຂັ້ນຕອບ `200` ພ້ອມ status ໃໝ່; ຫຼັງ `ship` `GET /stock` ສະແດງ `onHand` ລົດ ແລະ `reserved` 0. ປິດ api/worker ແລະ infra ທີ່ເປີດເອງ ເມື່ອຈົບ.

- [ ] **Step 7: ອັບເດດ memory ແລະລາຍງານ**

ອັບເດດ `phase1-progress.md`: 1a-api ສຳເລັດທັງ 1a-1/2a/2b/3 (ພ້ອມຈຳນວນ test), ຄ້າງ: ກວດ migration ກັບ Postgres 16, ແລະ **1a-ui** ເປັນ sub-project ຕໍ່ໄປ (ຂຽນ plan ໃໝ່ຈາກ spec §10).
