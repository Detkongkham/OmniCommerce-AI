# Phase 0-C2: `apps/worker` (NestJS standalone + BullMQ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Worker process (NestJS application context, ບໍ່ມີ HTTP) ທີ່ເຊື່ອມ Redis, ແລ່ນ BullMQ `Worker` ໃຫ້ queue `system` ແລະ ປະມວນຜົນ job `ping` ເພື່ອພິສູດວ່າ pipeline ເຮັດວຽກ; ປິດຢ່າງສຸພາບເມື່ອໄດ້ SIGTERM.

**Architecture:** `WorkerModule` ປະກອບດ້ວຍ `AppConfigModule` (ກວດ env ດ້ວຍ zod), `RedisModule` (ການເຊື່ອມຕໍ່ ioredis ດຽວ, `maxRetriesPerRequest: null` ຕາມທີ່ BullMQ ຕ້ອງການ) ແລະ `SystemWorker` (ສ້າງ BullMQ `Worker`, ສົ່ງ job ຕາມຊື່ໄປຫາ handler). Handler ເປັນ pure function ເພື່ອທົດສອບງ່າຍ. ຍັງບໍ່ມີ queue ຂອງ webhook/posting/OCR (Phase 1+).

**Tech Stack:** NestJS 11 (`createApplicationContext`), BullMQ 5, ioredis 5, zod, Vitest, Redis ຈິງສຳລັບ integration test.

**ອ້າງອີງ spec:** [2026-10-04-phase0-foundation-design.md](../specs/2026-10-04-phase0-foundation-design.md) ສ່ວນ C (`apps/worker`). ແຜນ C-1 (`apps/api`) ສຳເລັດແລ້ວ ແລະ ເປັນແບບຢ່າງຂອງ config/test.

## ຂໍ້ຕົກລົງສຳຄັນ (ອ່ານກ່ອນເລີ່ມ)

* **ທຸກ constructor ໃຊ້ `@Inject(Token)` ຢ່າງຊັດເຈນ** (ເຫດຜົນດຽວກັບ `apps/api`: vitest ບໍ່ emit decorator metadata).
* **`vitest.config.ts` ໃຊ້ `oxc: { decorator: { legacy: true } }`** (vitest 5 ໃຊ້ oxc ບໍ່ແມ່ນ esbuild; ເບິ່ງ commit `4cb2ca7` ຂອງ api).
* **Redis ທີ່ໃຊ້ຕ້ອງເປັນຂອງໂປຣເຈັກ** ຕາມ `REDIS_URL` ໃນ `.env` (ເຄື່ອງນີ້ຄື `redis://localhost:6380`). ຫ້າມໃຊ້ ຫຼື ກວດ Redis ທີ່ພອດ 6379 (ຂອງຜູ້ໃຊ້).
* **Key prefix ຂອງ BullMQ ເປັນ `QUEUE_PREFIX`** (default `oca`). Test ໃຊ້ prefix ສຸ່ມທຸກຄັ້ງ ແລ້ວ `obliterate` ຄືນ ເພື່ອບໍ່ປົນກັບຂໍ້ມູນອື່ນ. Producer (ເຊັ່ນ api ໃນອະນາຄົດ) ຕ້ອງໃຊ້ prefix ດຽວກັນ.

---

## File Structure

```
apps/worker/
├── package.json  tsconfig.json  eslint.config.mjs  vitest.config.ts
├── test/setup.ts  test/system.worker.test.ts
└── src/
    ├── main.ts  worker.module.ts
    ├── config/env.ts (+env.test.ts)  config/config.module.ts
    ├── redis/redis.module.ts
    ├── queues/names.ts
    └── processors/ping.processor.ts (+test)  processors/system.worker.ts
```
(ລຶບ `.gitkeep` ໃນ `src/processors/` ແລະ `src/queues/`.)

---

### Task 1: Scaffold `@oca/worker` ແລະ env (TDD)

**Files:**
- Modify: `apps/worker/package.json`, `.env.example`
- Create: `apps/worker/tsconfig.json`, `apps/worker/eslint.config.mjs`, `apps/worker/vitest.config.ts`, `apps/worker/test/setup.ts`, `apps/worker/src/config/env.ts`, `apps/worker/src/config/env.test.ts`, `apps/worker/src/config/config.module.ts`

- [ ] **Step 1: ແທນ `apps/worker/package.json`**

```json
{
  "name": "@oca/worker",
  "version": "0.0.0",
  "private": true,
  "description": "BullMQ workers: webhooks, scheduler, live CF, slip OCR",
  "main": "./dist/main.js",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node --env-file-if-exists=../../.env dist/main.js",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: ຕິດຕັ້ງ dependency (quote ທຸກ spec)**

```bash
cd /Users/ta/oca
pnpm --filter @oca/worker add "@nestjs/common@^11" "@nestjs/core@^11" "bullmq@^5" "ioredis@^5" reflect-metadata rxjs zod
pnpm --filter @oca/worker add -D "@nestjs/testing@^11" @types/node "@oca/config@workspace:*" "typescript@~5.9" "eslint@^9" vitest tsx
```
Expected: ສຳເລັດ. ບັນທຶກ warning ຂອງ build script ຖ້າມີ.

- [ ] **Step 3: ຂຽນ `apps/worker/tsconfig.json`**

```json
{
  "extends": "@oca/config/tsconfig.nest.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 4: ຂຽນ `apps/worker/eslint.config.mjs`**

```js
import base from "@oca/config/eslint";

export default base;
```

- [ ] **Step 5: ຂຽນ `apps/worker/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { decorator: { legacy: true } },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
```

- [ ] **Step 6: ຂຽນ `apps/worker/test/setup.ts`**

```ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
```
(ບໍ່ຕັ້ງ default ຂອງ `REDIS_URL`: ຖ້າ `.env` ບໍ່ມີ test ຕ້ອງ fail ຢ່າງຊັດເຈນ ແທນທີ່ຈະໄປຕົກໃສ່ Redis ພອດ default.)

- [ ] **Step 7: ຂຽນ test ຂອງ env ທີ່ຈະ fail**

`apps/worker/src/config/env.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("ໃຊ້ຄ່າ default", () => {
    const env = parseEnv({ REDIS_URL: "redis://x" });
    expect(env.QUEUE_PREFIX).toBe("oca");
    expect(env.WORKER_CONCURRENCY).toBe(5);
    expect(env.NODE_ENV).toBe("development");
  });

  it("ແປງຕົວເລກຈາກ string", () => {
    expect(parseEnv({ REDIS_URL: "redis://x", WORKER_CONCURRENCY: "2" }).WORKER_CONCURRENCY).toBe(2);
  });

  it("ປະຕິເສດເມື່ອຂາດ REDIS_URL ຫຼື concurrency ບໍ່ຖືກຕ້ອງ", () => {
    expect(() => parseEnv({})).toThrow();
    expect(() => parseEnv({ REDIS_URL: "redis://x", WORKER_CONCURRENCY: "0" })).toThrow();
  });
});
```

- [ ] **Step 8: Run ເພື່ອເຫັນວ່າ fail**

Run: `cd /Users/ta/oca && pnpm --filter @oca/worker test`
Expected: FAIL, `Cannot find module './env'`.

- [ ] **Step 9: ຂຽນ `apps/worker/src/config/env.ts`**

```ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.string().min(1),
  QUEUE_PREFIX: z.string().min(1).default("oca"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}
```

- [ ] **Step 10: ຂຽນ `apps/worker/src/config/config.module.ts`**

```ts
import { Global, Module } from "@nestjs/common";
import { ENV, parseEnv } from "./env";

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }],
  exports: [ENV],
})
export class AppConfigModule {}
```

- [ ] **Step 11: ເພີ່ມໃນ `.env.example` (ຕໍ່ຈາກບລັອກ `# API (apps/api)`)**

```
# Worker (apps/worker)
QUEUE_PREFIX=oca
WORKER_CONCURRENCY=5
```

- [ ] **Step 12: Run ເພື່ອເຫັນວ່າ pass, build, lint**

Run: `cd /Users/ta/oca && pnpm --filter @oca/worker test && pnpm --filter @oca/worker build && pnpm --filter @oca/worker lint`
Expected: 3 tests PASS; build/lint ສະອາດ.

- [ ] **Step 13: Commit**

```bash
git add apps/worker .env.example pnpm-lock.yaml
git commit -m "feat(worker): scaffold NestJS worker app and env config"
```
(ໃສ່ trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` ໃນທ້າຍ commit message ທຸກ commit.)

---

### Task 2: ຊື່ queue ແລະ handler `ping` (TDD)

**Files:**
- Create: `apps/worker/src/queues/names.ts`, `apps/worker/src/processors/ping.processor.test.ts`, `apps/worker/src/processors/ping.processor.ts`
- Delete: `apps/worker/src/queues/.gitkeep`, `apps/worker/src/processors/.gitkeep` (ຖ້າມີ)

- [ ] **Step 1: ຂຽນ test ທີ່ຈະ fail**

`apps/worker/src/processors/ping.processor.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { handlePing } from "./ping.processor";

describe("handlePing", () => {
  const fixed = () => new Date("2026-10-04T00:00:00.000Z");

  it("ຕອບ pong ພ້ອມ message default", () => {
    expect(handlePing({}, fixed)).toEqual({ pong: true, message: "ping", at: "2026-10-04T00:00:00.000Z" });
  });

  it("ສົ່ງ message ທີ່ໄດ້ຮັບຄືນ", () => {
    expect(handlePing({ message: "hello" }, fixed).message).toBe("hello");
  });
});
```

- [ ] **Step 2: Run ເພື່ອເຫັນວ່າ fail**

Run: `cd /Users/ta/oca && pnpm --filter @oca/worker test`
Expected: FAIL, `Cannot find module './ping.processor'`.

- [ ] **Step 3: ຂຽນ `apps/worker/src/queues/names.ts`**

```ts
export const QUEUE_SYSTEM = "system";

export const JOB_PING = "ping";

export interface PingData {
  message?: string;
}

export interface PingResult {
  pong: true;
  message: string;
  at: string;
}
```

- [ ] **Step 4: ຂຽນ `apps/worker/src/processors/ping.processor.ts`**

```ts
import type { PingData, PingResult } from "../queues/names";

export function handlePing(data: PingData, now: () => Date = () => new Date()): PingResult {
  return { pong: true, message: data.message ?? "ping", at: now().toISOString() };
}
```

- [ ] **Step 5: ລຶບ `.gitkeep` (ຖ້າມີ), Run, build, lint**

Run:
```bash
cd /Users/ta/oca
git rm -q --ignore-unmatch apps/worker/src/queues/.gitkeep apps/worker/src/processors/.gitkeep
mkdir -p apps/worker/src/queues apps/worker/src/processors
pnpm --filter @oca/worker test && pnpm --filter @oca/worker build && pnpm --filter @oca/worker lint
```
(`mkdir -p` ເພື່ອໃຫ້ແນ່ໃຈວ່າໂຟນເດີຍັງຢູ່ ເພາະ `git rm` ລຶບໂຟນເດີທີ່ວ່າງ.) Expected: 5 tests PASS; build/lint ສະອາດ.

- [ ] **Step 6: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): add queue names and ping handler"
```

---

### Task 3: Redis module, `SystemWorker`, `WorkerModule`, `main.ts` + integration test (TDD)

**Files:**
- Create: `apps/worker/test/system.worker.test.ts`, `apps/worker/src/redis/redis.module.ts`, `apps/worker/src/processors/system.worker.ts`, `apps/worker/src/worker.module.ts`, `apps/worker/src/main.ts`

- [ ] **Step 1: ຂຽນ integration test ທີ່ຈະ fail**

`apps/worker/test/system.worker.test.ts`:
```ts
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JOB_PING, QUEUE_SYSTEM } from "../src/queues/names";
import { WorkerModule } from "../src/worker.module";

describe("SystemWorker (integration, Redis ຈິງ)", () => {
  const prefix = `oca-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL as string;
  let app: INestApplicationContext;
  let producer: Redis;
  let eventsConnection: Redis;
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    expect(redisUrl, "REDIS_URL must be set (copy .env.example to .env)").toBeTruthy();
    process.env.QUEUE_PREFIX = prefix;

    app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });

    producer = new Redis(redisUrl, { maxRetriesPerRequest: null });
    eventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_SYSTEM, { connection: producer, prefix });
    events = new QueueEvents(QUEUE_SYSTEM, { connection: eventsConnection, prefix });
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

  it("ປະມວນຜົນ job ping ແລະ ຄືນ pong", async () => {
    const job = await queue.add(JOB_PING, { message: "hello" });
    const result = await job.waitUntilFinished(events, 10_000);
    expect(result).toMatchObject({ pong: true, message: "hello" });
  });

  it("job ທີ່ບໍ່ຮູ້ຈັກ fail ພ້ອມເຫດຜົນ ແລະ worker ຍັງເຮັດວຽກຕໍ່", async () => {
    const bad = await queue.add("nope", {}, { attempts: 1 });
    await expect(bad.waitUntilFinished(events, 10_000)).rejects.toThrow("Unknown job: nope");

    const again = await queue.add(JOB_PING, {});
    await expect(again.waitUntilFinished(events, 10_000)).resolves.toMatchObject({ pong: true, message: "ping" });
  });
});
```

- [ ] **Step 2: Run ເພື່ອເຫັນວ່າ fail**

Run: `cd /Users/ta/oca && pnpm --filter @oca/worker test`
Expected: FAIL, `Cannot find module '../src/worker.module'`; test ອື່ນຍັງຜ່ານ. ຖ້າ Redis ເຊື່ອມບໍ່ໄດ້ ໃຫ້ຢຸດ ແລະ ລາຍງານ BLOCKED (ຢ່າລອງ Redis ພອດອື່ນ).

- [ ] **Step 3: ຂຽນ `apps/worker/src/redis/redis.module.ts`**

```ts
import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";

export const REDIS = Symbol("REDIS");

class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      // BullMQ ຕ້ອງການ maxRetriesPerRequest: null ສຳລັບ Worker
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
```

- [ ] **Step 4: ຂຽນ `apps/worker/src/processors/system.worker.ts`**

```ts
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { JOB_PING, type PingData, QUEUE_SYSTEM } from "../queues/names";
import { REDIS } from "../redis/redis.module";
import { handlePing } from "./ping.processor";

@Injectable()
export class SystemWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemWorker.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(QUEUE_SYSTEM, (job) => this.process(job), {
      connection: this.redis,
      prefix: this.env.QUEUE_PREFIX,
      concurrency: this.env.WORKER_CONCURRENCY,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`Job ${job?.name}#${job?.id} failed: ${error.message}`);
    });
    this.worker.on("error", (error) => {
      this.logger.error(error.message);
    });
    await this.worker.waitUntilReady();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_PING:
        return handlePing(job.data as PingData);
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  }
}
```

- [ ] **Step 5: ຂຽນ `apps/worker/src/worker.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module";
import { SystemWorker } from "./processors/system.worker";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [AppConfigModule, RedisModule],
  providers: [SystemWorker],
})
export class WorkerModule {}
```

- [ ] **Step 6: ຂຽນ `apps/worker/src/main.ts`**

```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log("Worker started");
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Run ເພື່ອເຫັນວ່າ pass, build, lint**

Run: `cd /Users/ta/oca && pnpm --filter @oca/worker test && pnpm --filter @oca/worker build && pnpm --filter @oca/worker lint`
Expected: 7 tests PASS (env 3 + ping 2 + integration 2); build/lint ສະອາດ. ຖ້າເຫັນ error ຕອນປິດ (ເຊັ່ນ "Connection is closed" ຍ້ອນ Redis ຖືກ disconnect ກ່ອນ worker.close) ໃຫ້ລາຍງານ ພ້ອມລຳດັບ hook ທີ່ເຫັນ ແລະ ແກ້ດ້ວຍການໃຫ້ `SystemWorker` ປິດກ່ອນ (ເຊັ່ນ ໃຫ້ `RedisLifecycle` ໃຊ້ `beforeApplicationShutdown`/ຫຼື `quit()` ຫຼັງ worker.close); ຢ່າກືນ error.

- [ ] **Step 8: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): add BullMQ system worker with ping job"
```

---

### Task 4: ກວດທັງ monorepo, smoke test ແລະ ເອກະສານ

**Files:**
- Modify: `README.md`

- [ ] **Step 1: ກວດທັງ monorepo**

Run: `cd /Users/ta/oca && pnpm build && pnpm lint && pnpm test`
Expected: ທັງ 3 ຜ່ານ ລວມ `@oca/worker`.

- [ ] **Step 2: Smoke test ຂອງ process ຈິງ (ໃຊ້ prefix ແຍກ ແລະ Redis ຂອງໂປຣເຈັກຈາກ `.env`)**

Run:
```bash
cd /Users/ta/oca && S=/private/tmp/claude-501/-Users-ta-oca/66d8384f-b5da-4edc-a7ce-254c701b340c/scratchpad
set -a && . ./.env && set +a
(QUEUE_PREFIX=oca-smoke nohup node apps/worker/dist/main.js > $S/worker.log 2>&1 &) ; sleep 4
cat $S/worker.log | tail -3
cd apps/worker && QUEUE_PREFIX=oca-smoke node -e '
const { Queue, QueueEvents } = require("bullmq"); const { Redis } = require("ioredis");
(async () => {
  const mk = () => new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const q = new Queue("system", { connection: mk(), prefix: "oca-smoke" });
  const ev = new QueueEvents("system", { connection: mk(), prefix: "oca-smoke" });
  await ev.waitUntilReady();
  const job = await q.add("ping", { message: "smoke" });
  console.log("result:", await job.waitUntilFinished(ev, 10000));
  await q.obliterate({ force: true });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });'
pkill -TERM -f "apps/worker/dist/main.js"; sleep 2; pgrep -f "apps/worker/dist/main.js" | wc -l
```
Expected: log ມີ `Worker started`; `result: { pong: true, message: 'smoke', at: '...' }`; ຫຼັງ SIGTERM process ຈົບ (ພິມ `0`). ບັນທຶກຜົນຈິງ.

- [ ] **Step 3: ແກ້ໝາຍເຫດທ້າຍ `README.md`**

ແທນບັນທັດ `> ໝາຍເຫດ: ...` ທ້າຍໄຟລ໌ເປັນ:
```markdown
> ໝາຍເຫດ: `packages/database` (Prisma schema + Auth/RBAC + seed), `packages/config`, `packages/shared`, `apps/api` (login, RBAC, staff/roles, `/health`; module ອື່ນເປັນໂຄງເປົ່າ) ແລະ `apps/worker` (BullMQ, queue `system`/`ping`) ພ້ອມໃຊ້. `apps/admin` ແລະ `apps/storefront` ຍັງເປັນໂຄງເປົ່າ (Phase 0 ກຳລັງດຳເນີນ, ເບິ່ງ `docs/superpowers/specs/`). Test ຂອງ api ແລະ worker ໃຊ້ Postgres + Redis ຈິງ (`pnpm infra:up`).
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README status after worker setup"
```

---

## Self-Review

**Spec coverage (ສ່ວນ C, `apps/worker`):** NestJS standalone + BullMQ → Task 3; queue `system.ping` ຕົວຢ່າງ 1 ອັນ → Task 2–3 (queue `system`, job `ping`; spec ຂຽນ `system.ping` ແຕ່ BullMQ ຕ້ອງການຊື່ queue ແລະ ຊື່ job ແຍກກັນ ຈຶ່ງໃຊ້ queue=`system`, job=`ping`); ຍັງບໍ່ມີ queue webhook/posting/OCR → ຕາມ spec.

**Placeholder scan:** ບໍ່ມີ TBD/TODO; ທຸກ step ມີໂຄດ ຫຼື ຄຳສັ່ງ.

**Type consistency:** `ENV`/`Env` (Task 1) ໃຊ້ໃນ `redis.module` ແລະ `system.worker`; `QUEUE_SYSTEM`, `JOB_PING`, `PingData`, `PingResult` (Task 2) ໃຊ້ໃນ handler, worker ແລະ test; `REDIS` (Task 3) ໃຊ້ໃນ worker.

**ຄວາມສ່ຽງທີ່ຮູ້:** (1) ລຳດັບ `onModuleDestroy` ລະຫວ່າງ `SystemWorker` ແລະ `RedisLifecycle`; Step 7 ຂອງ Task 3 ບອກວິທີລາຍງານ/ແກ້. (2) ຊົນິດ `ioredis` ກັບ `bullmq` ຕ້ອງເປັນ major 5 ທັງຄູ່ ບໍ່ດັ່ງນັ້ນ type ຂອງ `connection` ຈະບໍ່ກົງກັນ.

**ແຜນຕໍ່ໄປ:** D (frontend: `packages/ui`, `apps/admin`, `apps/storefront`).
