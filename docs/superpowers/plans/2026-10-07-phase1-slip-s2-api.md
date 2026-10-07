# Slip Verification S2 — API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**ຕ້ອງເຮັດ S1 (`2026-10-07-phase1-slip-s1-foundation.md`) ໃຫ້ຄົບກ່ອນ.**

**Goal:** API ຂອງ Slip Verification: ອັບໂຫຼດ/ຜູກສະລິບຈາກແຊັດ, ລາຍການ/ລາຍລະອຽດ/ຮູບ, ແກ້ຄ່າ, retry, ປະຕິເສດ, ແລະ ຢືນຢັນ (ເອີ້ນ `pay` ໃນ transaction ດຽວກັນ).

**Architecture:** ໂມດູນ `payments` (ມີ stub ຢູ່) ໄດ້ `SlipsController` + `SlipsService`. ການອ່ານ AI ແລ່ນໃນ worker ຜ່ານຄິວ `slips` (API ເປັນຝ່າຍ enqueue ເທົ່ານັ້ນ). ຮູບຢູ່ໃນ `StorageService`. ຢືນຢັນ = claim ສະລິບແບບ conditional UPDATE + `OrdersService.payWithin(tx)` ໃນ transaction ດຽວ. Spec: `docs/superpowers/specs/2026-10-07-phase1-slip-verification-design.md`.

**Tech Stack:** NestJS 11, Prisma 7, BullMQ (ສະເພາະ enqueue), multer (ຜ່ານ `@nestjs/platform-express`), vitest + supertest (e2e ກັບ `oca_test`).

**ກົດຂອງໂປຣເຈັກ** (ຄືກັບ S1): ຫ້າມແຕະ Postgres 5432/Redis 6379 ຂອງຜູ້ໃຊ້; test ຢູ່ `oca_test`; build `@oca/shared`/`@oca/database`/`@oca/ai-engine` ກ່ອນ test api; ເຫັນ RED ກ່ອນ implement ແລະ ລາຍງານ; comment ເປັນລາວ; commit ລົງທ້າຍ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; ຢ່າ `git add` ໄຟລ໌ admin ທີ່ຜູ້ໃຊ້ແກ້ຄ້າງ.

**ຂໍ້ຄວນລະວັງສຳຄັນ**
- e2e **ຫ້າມ** enqueue ເຂົ້າ Redis ຈິງ (ອາດຖືກ worker dev ຂອງຜູ້ໃຊ້ຫຍິບໄປປະມວນຜົນ): ທຸກ e2e override `SLIP_QUEUE` ດ້ວຍ fake.
- ສະຖານະສິດ: `CHAT_ADMIN` ມີ `orders:write` + `inbox:write` (ອັບໂຫຼດ/ຜູກໄດ້) ແຕ່ **ບໍ່ມີ** `payments:write` (ແກ້/retry/reject/confirm ບໍ່ໄດ້). `ACCOUNTANT`/`WAREHOUSE` ມີ `orders:read`.
- ຮູບໃຫຍ່ເກີນຂີດຈຳກັດ multer ຕອບ 413 (ຂໍ້ຄວາມຈາກ Nest, code `BAD_REQUEST`) ບໍ່ແມ່ນ `SLIP_FILE_INVALID`: ຂໍ້ຈຳກັດທີ່ຍອມຮັບ (UI ກວດຂະໜາດກ່ອນ).

## File map

| ໄຟລ໌ | ໜ້າທີ່ |
|---|---|
| `packages/database/src/slips/queue.ts` (ໃໝ່) | ຊື່ຄິວ/ຊື່ job/ຮູບ data/ option ຂອງ job ອ່ານສະລິບ (API ແລະ worker ໃຊ້ຮ່ວມ) |
| `apps/api/src/config/env.ts` (ແກ້) | `SLIP_STORAGE_DIR`, `QUEUE_PREFIX` |
| `apps/api/src/modules/payments/slip.providers.ts` (ໃໝ່) | tokens + `SlipQueue` + `BullSlipQueue` |
| `apps/api/src/modules/payments/slip-image.ts` (ໃໝ່) | `detectImageMime`, `sha256Hex`, `fetchImageBytes` |
| `apps/api/src/modules/payments/slips.mapper.ts` (ໃໝ່) | `SlipDto`, `toSlipDto` |
| `apps/api/src/modules/payments/slips.service.ts` (ໃໝ່) | logic ທັງໝົດ |
| `apps/api/src/modules/payments/slips.controller.ts` (ໃໝ່) | routes + ສິດ |
| `apps/api/src/modules/payments/payments.module.ts` (ແກ້) | wiring |
| `apps/api/src/modules/orders/orders.service.ts` (ແກ້) | ແຍກ `applyTransition` + ເພີ່ມ `payWithin` |
| `apps/api/test/helpers.ts` (ແກ້) | `createTestApp(overrides, configure?)` |
| `apps/api/test/slips.e2e.test.ts` (ໃໝ່) | e2e ຂອງ slips |
| `apps/api/test/orders-pay-within.test.ts` (ໃໝ່) | test `payWithin` |
| `docs/DEPLOYMENT-NOTES.md` (ແກ້) | ໝາຍເຫດ volume ຮ່ວມ + env |

---

### Task 1: ຄ່າຄົງທີ່ຂອງຄິວໃນ `@oca/database`

**Files:**
- Create: `packages/database/src/slips/queue.ts`, `packages/database/src/slips/queue.test.ts`
- Modify: `packages/database/src/slips/index.ts`

- [ ] **Step 1: test ແດງ** — `packages/database/src/slips/queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SLIP_JOB_READ, SLIP_QUEUE_NAME, SLIP_READ_ATTEMPTS, SLIP_READ_JOB_OPTIONS } from "./queue";

describe("slip queue constants", () => {
  it("ຊື່ຄິວ/job ຄົງທີ່ (API ແລະ worker ຕ້ອງຕົງກັນ)", () => {
    expect(SLIP_QUEUE_NAME).toBe("slips");
    expect(SLIP_JOB_READ).toBe("read-slip");
  });
  it("job ລອງ 3 ຄັ້ງ ແບບ exponential ແລະ ລຶບເມື່ອສຳເລັດ", () => {
    expect(SLIP_READ_ATTEMPTS).toBe(3);
    expect(SLIP_READ_JOB_OPTIONS).toMatchObject({ attempts: 3, backoff: { type: "exponential" }, removeOnComplete: true });
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/database test -- queue` → **FAIL**.

- [ ] **Step 3: implement** — `packages/database/src/slips/queue.ts`:

```ts
/** ຄິວ BullMQ ຂອງການອ່ານສະລິບ: API enqueue, worker ປະມວນຜົນ. ຊື່/option ຢູ່ບ່ອນດຽວເພື່ອບໍ່ໃຫ້ສອງຝ່າຍຂັດກັນ. */
export const SLIP_QUEUE_NAME = "slips";
export const SLIP_JOB_READ = "read-slip";

export interface SlipReadJobData {
  slipId: string;
}

export const SLIP_READ_ATTEMPTS = 3;

export const SLIP_READ_JOB_OPTIONS = {
  attempts: SLIP_READ_ATTEMPTS,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: 100,
};
```

ແລະ `packages/database/src/slips/index.ts` ເພີ່ມ `export * from "./queue";`.

- [ ] **Step 4:** `pnpm --filter @oca/database test -- queue` → PASS; `pnpm --filter @oca/database build`.

- [ ] **Step 5: commit** — `git add packages/database && git commit -m "feat(database): slip read queue constants"`.

---

### Task 2: API env, dependencies, providers, test helper

**Files:**
- Modify: `apps/api/package.json` (ຜ່ານ pnpm), `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`
- Create: `apps/api/src/modules/payments/slip.providers.ts`, `apps/api/src/modules/payments/slip.providers.test.ts`
- Modify: `apps/api/test/helpers.ts`

- [ ] **Step 1: dependencies**

```bash
pnpm --filter @oca/api add bullmq @oca/ai-engine@workspace:*
pnpm --filter @oca/api add -D @types/multer
```

ກວດ `apps/api/package.json` ວ່າ `@oca/ai-engine` ເປັນ `workspace:*`. `pnpm --filter @oca/ai-engine build`.

- [ ] **Step 2: test env ແດງ** — ເພີ່ມໃນ `apps/api/src/config/env.test.ts` ພາຍໃນ `describe("parseEnv", ...)`:

```ts
  it("SLIP_STORAGE_DIR ແລະ QUEUE_PREFIX ມີຄ່າເລີ່ມຕົ້ນ ແລະ ອ່ານຄ່າທີ່ຕັ້ງ", () => {
    const defaults = parseEnv(base);
    expect(defaults.SLIP_STORAGE_DIR).toBe("../../.data/slips");
    expect(defaults.QUEUE_PREFIX).toBe("oca");
    const set = parseEnv({ ...base, SLIP_STORAGE_DIR: "/data/slips", QUEUE_PREFIX: "prod" });
    expect(set.SLIP_STORAGE_DIR).toBe("/data/slips");
    expect(set.QUEUE_PREFIX).toBe("prod");
  });
```

`pnpm --filter @oca/api test -- config/env` → **FAIL**. ແລ້ວໃນ `env.ts` ໃນ `z.object({...})` ຫຼັງ `FACEBOOK_GRAPH_BASE_URL`:

```ts
    // ຕ້ອງຊີ້ບ່ອນດຽວກັບ worker. relative ຖືກຕີຈາກ cwd (apps/api ແລະ apps/worker) ຈຶ່ງໃຊ້ ../../ ໃຫ້ຊີ້ root ຂອງ repo ຄືກັນ
    SLIP_STORAGE_DIR: z.string().min(1).default("../../.data/slips"),
    // prefix ຄິວ BullMQ ຕ້ອງຄືກັບ worker
    QUEUE_PREFIX: z.string().min(1).default("oca"),
```

→ PASS.

- [ ] **Step 3: test providers ແດງ** — `apps/api/src/modules/payments/slip.providers.test.ts`:

```ts
import { SLIP_JOB_READ, SLIP_READ_JOB_OPTIONS } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { BullSlipQueue } from "./slip.providers";

const env = { REDIS_URL: "redis://x", QUEUE_PREFIX: "t" };

describe("BullSlipQueue", () => {
  it("ບໍ່ສ້າງ queue ຈົນກວ່າຈະ enqueue ຄັ້ງທຳອິດ (ບໍ່ເຊື່ອມ Redis ຕອນເປີດແອັບ)", () => {
    const factory = vi.fn();
    new BullSlipQueue(env, factory);
    expect(factory).not.toHaveBeenCalled();
  });

  it("enqueueRead ເພີ່ມ job ຊື່ + data + option ທີ່ຖືກ ແລະ ໃຊ້ queue ດຽວຄືນ", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const factory = vi.fn().mockReturnValue({ add, close: vi.fn() });
    const queue = new BullSlipQueue(env, factory);
    await queue.enqueueRead("s1");
    await queue.enqueueRead("s2");
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(env);
    expect(add).toHaveBeenNthCalledWith(1, SLIP_JOB_READ, { slipId: "s1" }, SLIP_READ_JOB_OPTIONS);
    expect(add).toHaveBeenNthCalledWith(2, SLIP_JOB_READ, { slipId: "s2" }, SLIP_READ_JOB_OPTIONS);
  });

  it("onModuleDestroy ປິດ queue ທີ່ສ້າງແລ້ວ ແລະ ບໍ່ເປັນຫຍັງຖ້າຍັງບໍ່ສ້າງ", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const queue = new BullSlipQueue(env, () => ({ add: vi.fn().mockResolvedValue(undefined), close }));
    await queue.onModuleDestroy();
    expect(close).not.toHaveBeenCalled();
    await queue.enqueueRead("s1");
    await queue.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
```

`pnpm --filter @oca/api test -- slip.providers` → **FAIL**.

- [ ] **Step 4: implement** — `apps/api/src/modules/payments/slip.providers.ts`:

```ts
import { Logger, type OnModuleDestroy } from "@nestjs/common";
import { SLIP_JOB_READ, SLIP_QUEUE_NAME, SLIP_READ_JOB_OPTIONS, type SlipReadJobData } from "@oca/database";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "../../config/env";

export const SLIP_STORAGE = Symbol("SLIP_STORAGE");
export const SLIP_QUEUE = Symbol("SLIP_QUEUE");
export const SLIP_FETCH = Symbol("SLIP_FETCH");

/** ຝ່າຍ API ເປັນຜູ້ enqueue ເທົ່ານັ້ນ; worker ເປັນຜູ້ອ່ານ */
export interface SlipQueue {
  enqueueRead(slipId: string): Promise<void>;
}

type QueueEnv = Pick<Env, "REDIS_URL" | "QUEUE_PREFIX">;

interface QueueHandle {
  add(name: string, data: SlipReadJobData, options: typeof SLIP_READ_JOB_OPTIONS): Promise<unknown>;
  close(): Promise<unknown>;
}

const logger = new Logger("SlipQueue");

function createBullQueue(env: QueueEnv): QueueHandle {
  // ຈຳກັດ retry ເພື່ອບໍ່ໃຫ້ request ຄ້າງເມື່ອ Redis ຫາຍ
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
  connection.on("error", (error: Error) => logger.warn(`Redis: ${error.message}`));
  const queue = new Queue(SLIP_QUEUE_NAME, { connection, prefix: env.QUEUE_PREFIX });
  return {
    add: (name, data, options) => queue.add(name, data, options),
    close: async () => {
      await queue.close();
      connection.disconnect();
    },
  };
}

/** ສ້າງ queue ແບບ lazy (ຕອນ enqueue ຄັ້ງທຳອິດ) ເພື່ອບໍ່ເຊື່ອມ Redis ເມື່ອບໍ່ມີການອັບໂຫຼດສະລິບ */
export class BullSlipQueue implements SlipQueue, OnModuleDestroy {
  private handle: QueueHandle | undefined;

  constructor(
    private readonly env: QueueEnv,
    private readonly createQueue: (env: QueueEnv) => QueueHandle = createBullQueue,
  ) {}

  async enqueueRead(slipId: string): Promise<void> {
    this.handle ??= this.createQueue(this.env);
    await this.handle.add(SLIP_JOB_READ, { slipId }, SLIP_READ_JOB_OPTIONS);
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle?.close();
    this.handle = undefined;
  }
}
```

`pnpm --filter @oca/api test -- slip.providers` → PASS.

- [ ] **Step 5: test helper** — `apps/api/test/helpers.ts`: ແກ້ `createTestApp`:

```ts
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
```
(ແທນ import `Test` ເດີມ) ແລະ

```ts
export async function createTestApp(
  overrides: Record<string, string> = {},
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<{ app: INestApplication; db: PrismaClient }> {
  ...
  try {
    const moduleRef = await configure(Test.createTestingModule({ imports: [AppModule] })).compile();
```

(ສ່ວນທີ່ເຫຼືອຄືເກົ່າ.)

- [ ] **Step 6:** `pnpm --filter @oca/api exec tsc --noEmit && pnpm --filter @oca/api lint` ສະອາດ; `pnpm --filter @oca/api test -- health` (ກວດ helper ບໍ່ພັງ) ຜ່ານ.

- [ ] **Step 7: commit** — `git add apps/api pnpm-lock.yaml && git commit -m "feat(api): slip env, queue/storage providers and test helper hook"`.

---

### Task 3: ຍູທິລິຕີຮູບ

**Files:**
- Create: `apps/api/src/modules/payments/slip-image.ts`, `apps/api/src/modules/payments/slip-image.test.ts`

- [ ] **Step 1: test ແດງ** — `slip-image.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SlipImageError, detectImageMime, fetchImageBytes, sha256Hex } from "./slip-image";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

describe("detectImageMime", () => {
  it("ຮູ້ຈັກ png/jpeg/webp ຈາກ magic bytes", () => {
    expect(detectImageMime(PNG)).toBe("image/png");
    expect(detectImageMime(JPEG)).toBe("image/jpeg");
    expect(detectImageMime(WEBP)).toBe("image/webp");
  });
  it("ປະຕິເສດຢ່າງອື່ນ (gif, text, ວ່າງ, ສັ້ນເກີນ, RIFF ທີ່ບໍ່ແມ່ນ WEBP)", () => {
    expect(detectImageMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(detectImageMime(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageMime(new Uint8Array())).toBeNull();
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("ຄ່າຮູ້ຈັກ", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("fetchImageBytes", () => {
  const opts = { allowHttp: false, maxBytes: 100, timeoutMs: 1000 };
  const okResponse = (body: Uint8Array, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers });
  const fetchReturning = (response: Response) => (async () => response) as unknown as typeof fetch;

  it("ດາວໂຫຼດສຳເລັດ", async () => {
    const bytes = await fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl: fetchReturning(okResponse(PNG)) });
    expect(Array.from(bytes)).toEqual(Array.from(PNG));
  });

  it("ໃຊ້ redirect: 'error' ແລະ ສົ່ງ signal ເພື່ອ timeout", async () => {
    let seen: RequestInit | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return okResponse(PNG);
    }) as unknown as typeof fetch;
    await fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl });
    expect(seen?.redirect).toBe("error");
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });

  it("http ຖືກຫ້າມເມື່ອ allowHttp=false ແຕ່ໄດ້ເມື່ອ true; ໂປຣໂຕຄອນອື່ນຫ້າມສະເໝີ", async () => {
    const fetchImpl = fetchReturning(okResponse(PNG));
    await expect(fetchImageBytes("http://cdn.example/x.png", { ...opts, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
    await expect(fetchImageBytes("http://localhost/x.png", { ...opts, allowHttp: true, fetchImpl })).resolves.toBeDefined();
    await expect(fetchImageBytes("file:///etc/passwd", { ...opts, allowHttp: true, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
    await expect(fetchImageBytes("not a url", { ...opts, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
  });

  it("ສະຖານະບໍ່ແມ່ນ 2xx, content-length ເກີນ, ຫຼື body ເກີນຂະໜາດ → SlipImageError", async () => {
    const run = (response: Response) =>
      fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl: fetchReturning(response) });
    await expect(run(new Response("no", { status: 403 }))).rejects.toBeInstanceOf(SlipImageError);
    await expect(run(okResponse(PNG, { "content-length": "101" }))).rejects.toBeInstanceOf(SlipImageError);
    await expect(run(okResponse(new Uint8Array(101)))).rejects.toBeInstanceOf(SlipImageError);
  });

  it("fetch throw (ເຄືອຂ່າຍ/timeout/redirect) → SlipImageError", async () => {
    const fetchImpl = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    await expect(fetchImageBytes("https://cdn.example/x.png", { ...opts, fetchImpl })).rejects.toBeInstanceOf(SlipImageError);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/api test -- slip-image` → **FAIL**.

- [ ] **Step 3: implement** — `slip-image.ts`:

```ts
import { createHash } from "node:crypto";

export class SlipImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlipImageError";
  }
}

/** ກວດຊະນິດຮູບຈາກ magic bytes (ບໍ່ເຊື່ອ Content-Type/ນາມສະກຸນຈາກ client) */
export function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const at = (index: number) => bytes[index];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => at(index) === value)
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    [0x52, 0x49, 0x46, 0x46].every((value, index) => at(index) === value) &&
    [0x57, 0x45, 0x42, 0x50].every((value, index) => at(8 + index) === value)
  ) {
    return "image/webp";
  }
  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface FetchImageOptions {
  fetchImpl: typeof fetch;
  /** dev/simulator ໃຊ້ http ໄດ້; production ຕ້ອງ https */
  allowHttp: boolean;
  maxBytes: number;
  timeoutMs: number;
}

/** ດາວໂຫຼດຮູບຈາກ URL ຂອງ attachment: ບໍ່ຕາມ redirect, ມີ timeout, ຈຳກັດຂະໜາດຕອນອ່ານ stream */
export async function fetchImageBytes(url: string, options: FetchImageOptions): Promise<Uint8Array> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SlipImageError("Invalid image URL");
  }
  const protocolOk = parsed.protocol === "https:" || (options.allowHttp && parsed.protocol === "http:");
  if (!protocolOk) throw new SlipImageError("Image URL must use https");

  let response: Response;
  try {
    response = await options.fetchImpl(parsed.toString(), {
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    throw new SlipImageError(`Image download failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new SlipImageError(`Image download failed with status ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > options.maxBytes) throw new SlipImageError("Image is too large");

  const reader = response.body?.getReader();
  if (!reader) throw new SlipImageError("Image response has no body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxBytes) {
        await reader.cancel();
        throw new SlipImageError("Image is too large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof SlipImageError) throw error;
    throw new SlipImageError(`Image download failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
```

- [ ] **Step 4:** `pnpm --filter @oca/api test -- slip-image` → PASS; lint ສະອາດ.

- [ ] **Step 5: commit** — `git add apps/api && git commit -m "feat(api): slip image detection and safe download helpers"`.

---

### Task 4: `OrdersService.payWithin`

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Create: `apps/api/test/orders-pay-within.test.ts`

- [ ] **Step 1: test ແດງ** — `apps/api/test/orders-pay-within.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrdersService } from "../src/modules/orders/orders.service";
import type { AuthUser } from "../src/common/auth-types";
import { createTestApp, resetDb, seedBasics } from "./helpers";

describe("OrdersService.payWithin", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let orders: OrdersService;
  let actor: AuthUser;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    orders = app.get(OrdersService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    const { ownerUser } = await seedBasics(db);
    actor = { id: ownerUser.id } as AuthUser;
  });

  const makeOrder = (patch: object = {}) =>
    db.order.create({
      data: {
        orderNumber: `SO-${Math.random().toString(36).slice(2, 8)}`,
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "10",
        vatRate: "0",
        vatAmount: "0",
        total: "10",
        reservedUntil: new Date(Date.now() + 3_600_000),
        ...patch,
      },
    });

  it("ຕັ້ງ PAID + paidAt ພາຍໃນ transaction ຂອງຜູ້ເອີ້ນ", async () => {
    const order = await makeOrder();
    await db.$transaction((tx) => orders.payWithin(tx, order.id, actor));
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("PAID");
    expect(after.paidAt).not.toBeNull();
  });

  it("ຜູ້ເອີ້ນ throw ຫຼັງ payWithin → ກັບຄືນ PENDING_PAYMENT (atomic ກັບ transaction ພາຍນອກ)", async () => {
    const order = await makeOrder();
    await expect(
      db.$transaction(async (tx) => {
        await orders.payWithin(tx, order.id, actor);
        throw new Error("outer failure");
      }),
    ).rejects.toThrow("outer failure");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
  });

  it.each([["EXPIRED"], ["PAID"], ["CANCELLED"]])("ບິນ %s → ORDER_INVALID_STATE ແລະ ບໍ່ປ່ຽນຫຍັງ", async (status) => {
    const order = await makeOrder({ status });
    await expect(db.$transaction((tx) => orders.payWithin(tx, order.id, actor))).rejects.toMatchObject({
      response: { code: "ORDER_INVALID_STATE" },
    });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(status);
  });

  it("ໝົດເວລາຈອງ (ຍັງ PENDING_PAYMENT) → RESERVATION_EXPIRED", async () => {
    const order = await makeOrder({ reservedUntil: new Date(Date.now() - 1000) });
    await expect(db.$transaction((tx) => orders.payWithin(tx, order.id, actor))).rejects.toMatchObject({
      response: { code: "RESERVATION_EXPIRED" },
    });
  });

  it("ບໍ່ພົບບິນ → ORDER_NOT_FOUND", async () => {
    await expect(db.$transaction((tx) => orders.payWithin(tx, "nope", actor))).rejects.toMatchObject({
      response: { code: "ORDER_NOT_FOUND" },
    });
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/api test -- orders-pay-within` → **FAIL** (`payWithin` ບໍ່ມີ).

- [ ] **Step 3: refactor** — ໃນ `orders.service.ts` ແທນທີ່ method `pay`, `transition` ແລະ `failTransition` (ອ່ານໄຟລ໌ກ່ອນ; ຕົວອື່ນ `pack/ship/complete/cancel/requireDetail` ບໍ່ແກ້):

```ts
  /** ກົດຂອງ "pay": ໃຊ້ຮ່ວມກັນລະຫວ່າງ pay() ແລະ payWithin() */
  private payRules() {
    return {
      from: ["PENDING_PAYMENT"] as OrderStatus[],
      to: "PAID" as OrderStatus,
      data: { paidAt: new Date() } satisfies Prisma.OrderUpdateManyMutationInput,
      // ຕ້ອງຍັງບໍ່ໝົດເວລາຈອງ: guard ຢູ່ໃນ WHERE ເພື່ອແຂ່ງກັບ worker expire ໄດ້ຢ່າງປອດໄພ
      // reservedUntil = null (ບໍ່ມີກຳນົດ) ຈ່າຍໄດ້ສະເໝີ
      extraWhere: { OR: [{ reservedUntil: null }, { reservedUntil: { gt: new Date() } }] } satisfies Prisma.OrderWhereInput,
      stock: null,
    };
  }

  pay(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "pay", { ...this.payRules(), actor, ip });
  }

  /**
   * ຢືນຢັນຊຳລະພາຍໃນ transaction ຂອງຜູ້ເອີ້ນ (Slip confirm ໃຊ້). throw apiError ເມື່ອເປັນບໍ່ໄດ້ ເພື່ອໃຫ້ຜູ້ເອີ້ນ rollback.
   * ຜູ້ເອີ້ນບັນທຶກ audit ເອງຫຼັງ commit; ບໍ່ຄືນ detail ເພາະ transaction ຍັງບໍ່ commit.
   */
  async payWithin(tx: Prisma.TransactionClient, id: string, actor: AuthUser): Promise<void> {
    const changed = await this.applyTransition(tx, id, { ...this.payRules(), actor });
    if (!changed) await this.failTransition(id, "pay", tx);
  }
```

ແລະ ແທນ `transition` ເດີມ:

```ts
  /**
   * UPDATE ... WHERE id AND status IN (from) [AND extraWhere]: ກະທົບ 0 ແຖວ = ບໍ່ມີບິນ ຫຼື ສະຖານະບໍ່ຖືກ ຫຼື ແພ້ການແຂ່ງ (ຄືນ false).
   * ເມື່ອຜ່ານ ເຮັດການຕັດ/ປ່ອຍສະຕ໋ອກໃນ transaction ດຽວກັນ (ຜິດ → throw ໃຫ້ຜູ້ເອີ້ນ rollback ທັງສະຖານະ).
   */
  private async applyTransition(
    tx: Prisma.TransactionClient,
    id: string,
    options: {
      from: OrderStatus[];
      to: OrderStatus;
      data: Prisma.OrderUpdateManyMutationInput;
      extraWhere?: Prisma.OrderWhereInput;
      stock: "ship" | "release" | null;
      reason?: string;
      actor: AuthUser;
    },
  ): Promise<boolean> {
    const { count } = await tx.order.updateMany({
      where: { id, status: { in: options.from }, ...options.extraWhere },
      data: { status: options.to, ...options.data },
    });
    if (count === 0) return false;

    if (options.stock) {
      const items = await tx.orderItem.findMany({
        where: { orderId: id },
        select: { variantId: true, warehouseId: true, quantity: true },
      });
      const ctx = { orderId: id, actorId: options.actor.id };
      if (options.stock === "ship") await shipMany(tx, items, ctx);
      else await releaseMany(tx, items, ctx);
    }
    if (options.reason) {
      const current = await tx.order.findUniqueOrThrow({ where: { id }, select: { note: true } });
      await tx.order.update({
        where: { id },
        data: { note: [current.note, `Cancelled: ${options.reason}`].filter(Boolean).join("\n") },
      });
    }
    return true;
  }

  private async transition(
    id: string,
    action: "pay" | "pack" | "ship" | "complete" | "cancel",
    options: {
      from: OrderStatus[];
      to: OrderStatus;
      data: Prisma.OrderUpdateManyMutationInput;
      extraWhere?: Prisma.OrderWhereInput;
      stock: "ship" | "release" | null;
      reason?: string;
      actor: AuthUser;
      ip: string | undefined;
    },
  ): Promise<OrderDetailDto> {
    const changed = await this.prisma.$transaction((tx) => this.applyTransition(tx, id, options));

    if (!changed) await this.failTransition(id, action);

    await this.audit.record({
      userId: options.actor.id,
      action: `order.${action}`,
      entity: "Order",
      entityId: id,
      after: { status: options.to, ...(options.reason ? { reason: options.reason } : {}) },
      ip: options.ip,
    });
    return toOrderDetail(await this.requireDetail(id));
  }

  /** `reader` ເປັນ tx ເມື່ອເອີ້ນຈາກ payWithin (ອ່ານໃນ snapshot ດຽວກັນ); ຄ່າເລີ່ມຕົ້ນ = prisma */
  private async failTransition(
    id: string,
    action: string,
    reader: { order: Prisma.TransactionClient["order"] } = this.prisma,
  ): Promise<never> {
    const order = await reader.order.findUnique({ where: { id }, select: { status: true, reservedUntil: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
    if (
      action === "pay" &&
      order.status === "PENDING_PAYMENT" &&
      order.reservedUntil !== null &&
      order.reservedUntil.getTime() <= Date.now()
    ) {
      throw apiError("RESERVATION_EXPIRED", "Reservation expired; the order can no longer be paid");
    }
    throw apiError("ORDER_INVALID_STATE", `Order is ${order.status}; cannot ${action}`, { status: order.status });
  }
```

ໝາຍເຫດ: `payRules()` ຄຳນວນ `new Date()` ທຸກຄັ້ງທີ່ເອີ້ນ (ຄືເດີມ). ຖ້າ TypeScript ບໍ່ພໍໃຈ `satisfies` ກັບ `extraWhere` ໃຫ້ເປີ່ຍນເປັນ type annotation ໂດຍກົງ.

- [ ] **Step 4:** `pnpm --filter @oca/api test -- orders-pay-within` → PASS; **regression** `pnpm --filter @oca/api test -- orders.e2e permissions.e2e expire-reservations` ຕ້ອງຜ່ານທັງໝົດ (ພຶດຕິກຳເດີມບໍ່ປ່ຽນ). `pnpm --filter @oca/api lint`.

- [ ] **Step 5: commit** — `git add apps/api && git commit -m "refactor(api): extract applyTransition and add OrdersService.payWithin"`.

---

### Task 5: Slips — upload, list, get, image + wiring + e2e

**Files:**
- Create: `apps/api/src/modules/payments/slips.mapper.ts`, `slips.service.ts`, `slips.controller.ts`
- Modify: `apps/api/src/modules/payments/payments.module.ts`
- Create: `apps/api/test/slips.e2e.test.ts`

- [ ] **Step 1: test ແດງ** — `apps/api/test/slips.e2e.test.ts` (ຈະຂະຫຍາຍໃນ Task 6-8):

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SLIP_QUEUE } from "../src/modules/payments/slip.providers";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

export const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const GIF = Buffer.from("474946383961000000000000", "hex");

describe("slips (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let dir: string;
  const enqueueRead = vi.fn(async (_slipId: string) => {});
  const server = () => app.getHttpServer();
  const as = (name: string) => bearerFor(app, `${name.toLowerCase()}@role.test`);

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "oca-slips-"));
    ({ app, db } = await createTestApp({ SLIP_STORAGE_DIR: dir }, (builder) =>
      builder.overrideProvider(SLIP_QUEUE).useValue({ enqueueRead }),
    ));
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    enqueueRead.mockClear();
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

  describe("ອັບໂຫຼດ", () => {
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
      expect(await db.auditLog.count({ where: { action: "slip.create", entityId: res.body.id } })).toBe(1);
    });

    it("ຊະນິດຮູບຖືກກວດຈາກ magic bytes ບໍ່ແມ່ນຊື່ໄຟລ໌/Content-Type: gif ປອມເປັນ .png → 422 SLIP_FILE_INVALID", async () => {
      const order = await makeOrder();
      const res = await upload(order.id, await as("OWNER"), GIF, "slip.png").expect(422);
      expect(res.body.code).toBe("SLIP_FILE_INVALID");
      expect(await db.paymentSlip.count()).toBe(0);
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

    it("GET /slips/:id/image: bytes ເດີມ + header ປອດໄພ; ຕ້ອງ login", async () => {
      const order = await makeOrder();
      const owner = await as("OWNER");
      const created = await upload(order.id, owner).expect(201);
      const res = await request(server())
        .get(`/slips/${created.body.id}/image`)
        .set(owner)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["cache-control"]).toContain("no-store");
      await request(server()).get(`/slips/${created.body.id}/image`).expect(401);
    });
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/api test -- slips.e2e` → **FAIL** (route 404 / module ບໍ່ມີ).

- [ ] **Step 3: mapper** — `slips.mapper.ts`:

```ts
import type { Prisma } from "@oca/database";
import { moneyOrNull } from "../../common/money";

export const slipInclude = {
  reviewedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.PaymentSlipInclude;

export type SlipRow = Prisma.PaymentSlipGetPayload<{ include: typeof slipInclude }>;

export interface SlipValuesDto {
  amount: string | null;
  currency: string | null;
  paidAt: Date | null;
  destAccount: string | null;
  refNo: string | null;
}

export interface SlipDto {
  id: string;
  orderId: string | null;
  conversationId: string | null;
  messageId: string | null;
  attachmentIndex: number | null;
  source: string;
  status: string;
  imageMime: string;
  imageBytes: number;
  readerName: string | null;
  readerVersion: string | null;
  /** ຄ່າທີ່ເຄື່ອງອ່ານ */
  read: SlipValuesDto;
  /** ຄ່າທີ່ແອດມິນແກ້/ຢືນຢັນ */
  confirmed: SlipValuesDto;
  flags: string[];
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
}

/** ບໍ່ສົ່ງ imageKey (ພາຍໃນ) ແລະ readRaw (ບໍ່ເຊື່ອຖື) ອອກໄປ */
export function toSlipDto(row: SlipRow): SlipDto {
  return {
    id: row.id,
    orderId: row.orderId,
    conversationId: row.conversationId,
    messageId: row.messageId,
    attachmentIndex: row.attachmentIndex,
    source: row.source,
    status: row.status,
    imageMime: row.imageMime,
    imageBytes: row.imageBytes,
    readerName: row.readerName,
    readerVersion: row.readerVersion,
    read: {
      amount: moneyOrNull(row.readAmount),
      currency: row.readCurrency,
      paidAt: row.readPaidAt,
      destAccount: row.readDestAccount,
      refNo: row.readRefNo,
    },
    confirmed: {
      amount: moneyOrNull(row.confirmedAmount),
      currency: row.confirmedCurrency,
      paidAt: row.confirmedPaidAt,
      destAccount: row.confirmedDestAccount,
      refNo: row.confirmedRefNo,
    },
    flags: row.flags,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
  };
}
```

- [ ] **Step 4: service (ສ່ວນ upload/list/get/image)** — `slips.service.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { type StorageService, StorageNotFoundError, newStorageKey } from "@oca/ai-engine";
import { SLIP_MAX_BYTES } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { apiError } from "../../common/api-error";
import { ENV, type Env } from "../../config/env";
import { PRISMA } from "../../prisma/prisma.module";
import { SLIP_QUEUE, SLIP_STORAGE, type SlipQueue } from "./slip.providers";
import { detectImageMime, sha256Hex } from "./slip-image";
import { type SlipDto, type SlipRow, slipInclude, toSlipDto } from "./slips.mapper";

export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

interface CreateSlipInput {
  bytes: Uint8Array;
  mime: string;
  source: "CHAT" | "UPLOAD";
  orderId: string;
  conversationId?: string;
  messageId?: string;
  attachmentIndex?: number;
  actor: AuthUser;
  ip: string | undefined;
}

@Injectable()
export class SlipsService {
  private readonly logger = new Logger(SlipsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    @Inject(SLIP_STORAGE) private readonly storage: StorageService,
    @Inject(SLIP_QUEUE) private readonly queue: SlipQueue,
  ) {}

  async upload(orderId: string, file: UploadedImage | undefined, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    await this.requireOrder(orderId);
    const { bytes, mime } = this.validateImage(file?.buffer);
    return this.createSlip({ bytes, mime, source: "UPLOAD", orderId, actor, ip });
  }

  async listForOrder(orderId: string): Promise<SlipDto[]> {
    await this.requireOrder(orderId);
    const rows = await this.prisma.paymentSlip.findMany({
      where: { orderId },
      include: slipInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toSlipDto);
  }

  async get(id: string): Promise<SlipDto> {
    return toSlipDto(await this.requireRow(id));
  }

  async readImage(id: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const row = await this.prisma.paymentSlip.findUnique({ where: { id }, select: { imageKey: true, imageMime: true } });
    if (!row) throw apiError("SLIP_NOT_FOUND", "Slip not found");
    try {
      const stored = await this.storage.get(row.imageKey);
      return { bytes: stored.bytes, mime: row.imageMime };
    } catch (error) {
      if (error instanceof StorageNotFoundError) throw apiError("SLIP_NOT_FOUND", "Slip image not found");
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------
  protected validateImage(buffer: Uint8Array | undefined): { bytes: Uint8Array; mime: string } {
    if (!buffer || buffer.length === 0) throw apiError("SLIP_FILE_INVALID", "An image file is required");
    if (buffer.length > SLIP_MAX_BYTES) throw apiError("SLIP_FILE_INVALID", "Image is too large");
    const mime = detectImageMime(buffer);
    if (!mime) throw apiError("SLIP_FILE_INVALID", "Image must be JPEG, PNG or WebP");
    return { bytes: buffer, mime };
  }

  protected async requireOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
  }

  protected async requireRow(id: string): Promise<SlipRow> {
    const row = await this.prisma.paymentSlip.findUnique({ where: { id }, include: slipInclude });
    if (!row) throw apiError("SLIP_NOT_FOUND", "Slip not found");
    return row;
  }

  /** ເກັບຮູບ → ສ້າງແຖວ → audit → enqueue (enqueue ລົ້ມ = ຍັງຖືວ່າສຳເລັດ; ສະລິບຄ້າງ PENDING_READ ໃຫ້ retry) */
  protected async createSlip(input: CreateSlipInput): Promise<SlipDto> {
    const key = newStorageKey("slips");
    await this.storage.put(key, input.bytes, input.mime);
    const row = await this.prisma.paymentSlip.create({
      data: {
        source: input.source,
        orderId: input.orderId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        attachmentIndex: input.attachmentIndex,
        imageKey: key,
        imageMime: input.mime,
        imageBytes: input.bytes.length,
        imageSha256: sha256Hex(input.bytes),
      },
      include: slipInclude,
    });
    await this.audit.record({
      userId: input.actor.id,
      action: "slip.create",
      entity: "PaymentSlip",
      entityId: row.id,
      after: { orderId: input.orderId, source: input.source },
      ip: input.ip,
    });
    try {
      await this.queue.enqueueRead(row.id);
    } catch (error) {
      this.logger.warn(`Failed to enqueue slip ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return toSlipDto(row);
  }
}
```

(`env` ຖືກ inject ໄວ້ແລ້ວ ເພື່ອໃຊ້ໃນ Task 6 ສຳລັບ `allowHttp`. ຖ້າ lint ບອກ unused ໃຫ້ຮັກສາ — Task 6 ໃຊ້ມັນ; ຫຼືເພີ່ມ `fetchImpl` ໃນ Task 6.)

- [ ] **Step 5: controller (ສ່ວນ Task 5)** — `slips.controller.ts`:

```ts
import { Controller, Get, Inject, Param, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SLIP_MAX_BYTES } from "@oca/shared";
import type { Request, Response } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { type UploadedImage, SlipsService } from "./slips.service";

/**
 * ເບິ່ງ = orders:read; ອັບໂຫຼດ/ຜູກຈາກແຊັດ = orders:write (+inbox:write ສຳລັບແຊັດ);
 * ແກ້ຄ່າ/retry/ປະຕິເສດ/ຢືນຢັນ = payments:write (ຢືນຢັນເອີ້ນ pay ທີ່ຕ້ອງການສິດດຽວກັນ).
 */
@Controller()
export class SlipsController {
  constructor(@Inject(SlipsService) private readonly slips: SlipsService) {}

  @Post("orders/:id/slips")
  @RequirePermissions("orders:write")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: SLIP_MAX_BYTES, files: 1 } }))
  upload(
    @Param("id") id: string,
    @UploadedFile() file: UploadedImage | undefined,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.slips.upload(id, file, actor, req.ip);
  }

  @Get("orders/:id/slips")
  @RequirePermissions("orders:read")
  listForOrder(@Param("id") id: string) {
    return this.slips.listForOrder(id);
  }

  @Get("slips/:id")
  @RequirePermissions("orders:read")
  get(@Param("id") id: string) {
    return this.slips.get(id);
  }

  /** ຮູບຜ່ານ API ເພື່ອກວດສິດ (ບໍ່ເປີດ public) */
  @Get("slips/:id/image")
  @RequirePermissions("orders:read")
  async image(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const { bytes, mime } = await this.slips.readImage(id);
    res.set({
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    res.end(Buffer.from(bytes));
  }
}
```

- [ ] **Step 6: module** — `payments.module.ts` ຂຽນທັບ:

```ts
import { Module } from "@nestjs/common";
import { LocalDiskStorage } from "@oca/ai-engine";
import { ENV, type Env } from "../../config/env";
import { OrdersModule } from "../orders/orders.module";
import { BullSlipQueue, SLIP_FETCH, SLIP_QUEUE, SLIP_STORAGE } from "./slip.providers";
import { SlipsController } from "./slips.controller";
import { SlipsService } from "./slips.service";

/** ໂມດູນ 9 (Slip Verification): ຮັບສະລິບ, ໃຫ້ແອດມິນກວດ/ຢືນຢັນ (ການອ່ານດ້ວຍ AI ຢູ່ worker) */
@Module({
  imports: [OrdersModule],
  controllers: [SlipsController],
  providers: [
    SlipsService,
    { provide: SLIP_STORAGE, inject: [ENV], useFactory: (env: Env) => new LocalDiskStorage(env.SLIP_STORAGE_DIR) },
    { provide: SLIP_QUEUE, inject: [ENV], useFactory: (env: Env) => new BullSlipQueue(env) },
    { provide: SLIP_FETCH, useFactory: () => globalThis.fetch.bind(globalThis) },
  ],
})
export class PaymentsModule {}
```

- [ ] **Step 7:** `pnpm --filter @oca/api test -- slips.e2e` → PASS. ແກ້ implementation ຖ້າ test ແດງ (ເຊັ່ນ 413 ຕ້ອງມາຈາກ multer: ຖ້າໄດ້ 400/500 ໃຫ້ກວດ `limits`). ແລ້ວ `pnpm --filter @oca/api lint && pnpm --filter @oca/api exec tsc --noEmit`; `pnpm --filter @oca/api test -- permissions.e2e modules` (sweep ຈະລວມ route ໃໝ່; ຕ້ອງຜ່ານ).

- [ ] **Step 8: commit** — `git add apps/api && git commit -m "feat(api): slip upload, list, detail and image endpoints"`.

---

### Task 6: ຜູກຮູບຈາກແຊັດ

**Files:**
- Modify: `slips.service.ts`, `slips.controller.ts`, `payments.module.ts` (ໃຊ້ `SLIP_FETCH` ຢູ່ແລ້ວ)
- Modify: `apps/api/test/slips.e2e.test.ts`

- [ ] **Step 1: test ແດງ** — ເພີ່ມ `describe("ຜູກຈາກແຊັດ", ...)` ໃນ `slips.e2e.test.ts` ພາຍໃນ `describe("slips (e2e)")`. ຕ້ອງ override `SLIP_FETCH` ດ້ວຍ fake: ແກ້ `beforeAll` ເປັນ:

```ts
  const fetchImpl = vi.fn<typeof fetch>();
  ...
    ({ app, db } = await createTestApp({ SLIP_STORAGE_DIR: dir }, (builder) =>
      builder.overrideProvider(SLIP_QUEUE).useValue({ enqueueRead }).overrideProvider(SLIP_FETCH).useValue(fetchImpl),
    ));
```

ແລະ import `SLIP_FETCH` ຈາກ `slip.providers`. ໃນ `beforeEach` ເພີ່ມ `fetchImpl.mockReset();`. ແລ້ວ:

```ts
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

    it("404: ເຄສ/ຂໍ້ຄວາມບໍ່ກົງ → CONVERSATION_NOT_FOUND; ບິນບໍ່ແມ່ນຂອງເຄສນີ້ → ORDER_NOT_FOUND", async () => {
      const { conversation, message, order } = await seedChat();
      const other = await seedChat();
      const owner = await as("OWNER");
      const wrongConv = await link(other.conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(404);
      expect(wrongConv.body.code).toBe("CONVERSATION_NOT_FOUND");
      const wrongOrder = await link(conversation.id, message.id, { orderId: other.order.id, attachmentIndex: 0 }, owner).expect(404);
      expect(wrongOrder.body.code).toBe("ORDER_NOT_FOUND");
    });

    it("attachment ບໍ່ມີ (ລຳດັບເກີນ)/ບໍ່ແມ່ນຮູບ/ບໍ່ມີ url → 422 SLIP_FILE_INVALID", async () => {
      const owner = await as("OWNER");
      for (const attachments of [[], [{ type: "file", url: "https://x/a" }], [{ type: "image", url: null }]]) {
        const { conversation, message, order } = await seedChat(attachments);
        const res = await link(conversation.id, message.id, { orderId: order.id, attachmentIndex: 0 }, owner).expect(422);
        expect(res.body.code).toBe("SLIP_FILE_INVALID");
      }
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
```

- [ ] **Step 2:** `pnpm --filter @oca/api test -- slips.e2e` → ກໍລະນີໃໝ່ **FAIL**.

- [ ] **Step 3: service** — ເພີ່ມ import `isUniqueViolation` (`../../common/prisma-errors`), `LinkChatSlipInput` ຈາກ `@oca/shared`, `SlipImageError`, `fetchImageBytes` ຈາກ `./slip-image`, `SLIP_FETCH`. ເພີ່ມ constructor param `@Inject(SLIP_FETCH) private readonly fetchImpl: typeof fetch` ແລະ methods:

```ts
  /** ຜູກຮູບ attachment ໃນແຊັດກັບບິນຂອງເຄສນັ້ນ: ດາວໂຫຼດຮູບຕອນນີ້ (ລິ້ງ Meta ໝົດອາຍຸ) */
  async linkFromChat(
    conversationId: string,
    messageId: string,
    input: LinkChatSlipInput,
    actor: AuthUser,
    ip: string | undefined,
  ): Promise<SlipDto> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, attachments: true },
    });
    if (!message) throw apiError("CONVERSATION_NOT_FOUND", "Message not found in this conversation");
    // ບິນຕ້ອງເປັນຂອງເຄສນີ້ (id ອ້າງອີງບໍ່ກົງ = 404 ຕາມກົດຂອງໂປຣເຈັກ)
    const order = await this.prisma.order.findFirst({ where: { id: input.orderId, conversationId }, select: { id: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found for this conversation");

    const attachments = Array.isArray(message.attachments) ? (message.attachments as { type?: unknown; url?: unknown }[]) : [];
    const attachment = attachments[input.attachmentIndex];
    if (!attachment || attachment.type !== "image" || typeof attachment.url !== "string" || attachment.url === "") {
      throw apiError("SLIP_FILE_INVALID", "The attachment is not a downloadable image");
    }

    const existing = await this.prisma.paymentSlip.findUnique({
      where: { messageId_attachmentIndex: { messageId, attachmentIndex: input.attachmentIndex } },
      select: { id: true },
    });
    if (existing) throw apiError("DUPLICATE_VALUE", "This image is already linked as a slip");

    let bytes: Uint8Array;
    try {
      bytes = await fetchImageBytes(attachment.url, {
        fetchImpl: this.fetchImpl,
        allowHttp: this.env.NODE_ENV !== "production",
        maxBytes: SLIP_MAX_BYTES,
        timeoutMs: 10_000,
      });
    } catch (error) {
      if (error instanceof SlipImageError) throw apiError("SLIP_FILE_INVALID", error.message);
      throw error;
    }
    const { mime } = this.validateImage(bytes);
    try {
      return await this.createSlip({
        bytes,
        mime,
        source: "CHAT",
        orderId: input.orderId,
        conversationId,
        messageId,
        attachmentIndex: input.attachmentIndex,
        actor,
        ip,
      });
    } catch (error) {
      // ແຂ່ງກັນຜູກພ້ອມກັນ: unique (messageId, attachmentIndex) ເປັນດ່ານສຸດທ້າຍ
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "This image is already linked as a slip");
      throw error;
    }
  }

  async listForConversation(conversationId: string): Promise<SlipDto[]> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
    if (!conversation) throw apiError("CONVERSATION_NOT_FOUND", "Conversation not found");
    const rows = await this.prisma.paymentSlip.findMany({
      where: { conversationId },
      include: slipInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toSlipDto);
  }
```

- [ ] **Step 4: controller** — ເພີ່ມ import `Body`, `linkChatSlipSchema`, `type LinkChatSlipInput`, `ZodValidationPipe` (`../../common/zod-validation.pipe`) ແລະ routes:

```ts
  @Post("conversations/:id/messages/:mid/slips")
  @RequirePermissions("orders:write", "inbox:write")
  linkFromChat(
    @Param("id") conversationId: string,
    @Param("mid") messageId: string,
    @Body(new ZodValidationPipe(linkChatSlipSchema)) body: LinkChatSlipInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.slips.linkFromChat(conversationId, messageId, body, actor, req.ip);
  }

  @Get("conversations/:id/slips")
  @RequirePermissions("orders:read")
  listForConversation(@Param("id") conversationId: string) {
    return this.slips.listForConversation(conversationId);
  }
```

(`@Post(...)` ຕ້ອງເພີ່ມ `@HttpCode` ບໍ່ຈຳເປັນ — ຄືນ 201.)

- [ ] **Step 5:** `pnpm --filter @oca/api test -- slips.e2e permissions.e2e` → PASS; lint + tsc ສະອາດ.

- [ ] **Step 6: commit** — `git add apps/api && git commit -m "feat(api): link chat image attachment as a payment slip"`.

---

### Task 7: ແກ້ຄ່າ / retry / ປະຕິເສດ

**Files:**
- Modify: `slips.service.ts`, `slips.controller.ts`, `apps/api/test/slips.e2e.test.ts`

- [ ] **Step 1: test ແດງ** — ເພີ່ມໃນ `slips.e2e.test.ts`. **ວາງ `seedSlip` ໄວ້ລະດັບ `describe("slips (e2e)")` ນອກສຸດ (ຖັດຈາກ `makeOrder`)** ເພື່ອ Task 8 ໃຊ້ຮ່ວມ; ໂຄດດ້ານລຸ່ມສະແດງມັນຢູ່ໃນ describe ຍ່ອຍເພື່ອຄວາມອ່ານງ່າຍ ໃຫ້ຍ້າຍອອກມາ:

```ts
  describe("ແກ້ຄ່າ / retry / ປະຕິເສດ", () => {
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
    const patchSlip = (id: string, body: object, headers: { Authorization: string }) =>
      request(server()).patch(`/slips/${id}`).set(headers).send(body);

    it("PATCH: ບັນທຶກ confirmed*, ຄິດ flag ໃໝ່, audit; ຮັບຍອດທີ່ມີຈຸດຂັ້ນ", async () => {
      const { slip } = await seedSlip({ readAmount: "5" });
      expect((await request(server()).get(`/slips/${slip.id}`).set(await as("OWNER"))).body.flags).toEqual([]);
      const res = await patchSlip(slip.id, { confirmedAmount: "100,000", confirmedRefNo: " ABC " }, await as("ACCOUNTANT")).expect(403);
      expect(res.body.code).toBe("FORBIDDEN");
      const ok = await patchSlip(slip.id, { confirmedAmount: "100,000", confirmedRefNo: " ABC " }, await as("OWNER")).expect(200);
      expect(ok.body.confirmed).toMatchObject({ amount: "100000.00", refNo: "ABC" });
      expect(ok.body.flags).toEqual([]);
      const wrong = await patchSlip(slip.id, { confirmedAmount: "1" }, await as("OWNER")).expect(200);
      expect(wrong.body.flags).toEqual(["AMOUNT_MISMATCH"]);
      expect(await db.auditLog.count({ where: { action: "slip.update", entityId: slip.id } })).toBe(2);
    });

    it("PATCH orderId: ຜູກ/ຍ້າຍບິນ (ຕ້ອງມີບິນ) ແລະ ຄິດ flag ກັບບິນໃໝ່; null ລ້າງຄ່າ", async () => {
      const { slip } = await seedSlip();
      const other = await makeOrder({ total: "999", subtotal: "999" });
      const owner = await as("OWNER");
      const moved = await patchSlip(slip.id, { orderId: other.id }, owner).expect(200);
      expect(moved.body.orderId).toBe(other.id);
      expect(moved.body.flags).toContain("AMOUNT_MISMATCH");
      expect((await patchSlip(slip.id, { orderId: "nope" }, owner).expect(404)).body.code).toBe("ORDER_NOT_FOUND");
      const cleared = await patchSlip(slip.id, { confirmedRefNo: null }, owner).expect(200);
      expect(cleared.body.confirmed.refNo).toBeNull();
    });

    it("PATCH: body ວ່າງ/ຜິດ → 400; ສະລິບບໍ່ມີ → 404; CONFIRMED/REJECTED ແກ້ບໍ່ໄດ້ → 409 SLIP_ALREADY_REVIEWED", async () => {
      const { slip } = await seedSlip();
      const owner = await as("OWNER");
      await patchSlip(slip.id, {}, owner).expect(400);
      await patchSlip(slip.id, { confirmedAmount: "abc" }, owner).expect(400);
      expect((await patchSlip("nope", { confirmedRefNo: "x" }, owner).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
      for (const status of ["CONFIRMED", "REJECTED"] as const) {
        await db.paymentSlip.update({ where: { id: slip.id }, data: { status } });
        expect((await patchSlip(slip.id, { confirmedRefNo: "x" }, owner).expect(409)).body.code).toBe("SLIP_ALREADY_REVIEWED");
      }
    });

    it("retry: ຕັ້ງ PENDING_READ ແລະ enqueue; ສະຖານະທີ່ review ແລ້ວ → 409; enqueue ລົ້ມ → ສະແດງ error", async () => {
      const { slip } = await seedSlip({ status: "READ_FAILED" });
      const owner = await as("OWNER");
      await request(server()).post(`/slips/${slip.id}/retry`).set(await as("CHAT_ADMIN")).expect(403);
      const res = await request(server()).post(`/slips/${slip.id}/retry`).set(owner).expect(200);
      expect(res.body.status).toBe("PENDING_READ");
      expect(enqueueRead).toHaveBeenCalledWith(slip.id);
      await db.paymentSlip.update({ where: { id: slip.id }, data: { status: "CONFIRMED" } });
      expect((await request(server()).post(`/slips/${slip.id}/retry`).set(owner).expect(409)).body.code).toBe("SLIP_ALREADY_REVIEWED");
      expect((await request(server()).post("/slips/nope/retry").set(owner).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
      await db.paymentSlip.update({ where: { id: slip.id }, data: { status: "READ" } });
      enqueueRead.mockRejectedValueOnce(new Error("redis down"));
      await request(server()).post(`/slips/${slip.id}/retry`).set(owner).expect(500);
    });

    it("reject: ຕ້ອງມີເຫດຜົນ, ບັນທຶກຜູ້ກວດ+ເວລາ, ບໍ່ແຕະບິນ; ຊ້ຳ → 409; ສິດ payments:write", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      const reject = (body: object, headers = owner) => request(server()).post(`/slips/${slip.id}/reject`).set(headers).send(body);
      await reject({ reason: "  " }).expect(400);
      await reject({ reason: "ຍອດບໍ່ຕົງ" }, await as("CHAT_ADMIN")).expect(403);
      const res = await reject({ reason: " ຍອດບໍ່ຕົງ " }).expect(200);
      expect(res.body).toMatchObject({ status: "REJECTED", rejectReason: "ຍອດບໍ່ຕົງ" });
      expect(res.body.reviewedBy).toMatchObject({ name: "OWNER" });
      expect(res.body.reviewedAt).not.toBeNull();
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
      expect((await reject({ reason: "again" }).expect(409)).body.code).toBe("SLIP_ALREADY_REVIEWED");
      expect(await db.auditLog.count({ where: { action: "slip.reject", entityId: slip.id } })).toBe(1);
      expect((await request(server()).post("/slips/nope/reject").set(owner).send({ reason: "x" }).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
    });
  });
```

ໝາຍເຫດ test: ໃນ test ທຳອິດ ກ່ອນ PATCH ບໍ່ໄດ້ evaluate (flags ວ່າງຕາມ seed) ຈຶ່ງ assert `flags: []`; ຕ້ອງບໍ່ຕິດ side-effect.

- [ ] **Step 2:** `pnpm --filter @oca/api test -- slips.e2e` → ກໍລະນີໃໝ່ **FAIL**.

- [ ] **Step 3: service** — import `evaluateSlip` ຈາກ `@oca/database`, `PatchSlipInput`, `RejectSlipInput` ຈາກ `@oca/shared`. ເພີ່ມ:

```ts
const OPEN_STATUSES = ["PENDING_READ", "READ", "READ_FAILED"] as const;
```
(ເທິງ class) ແລະ methods:

```ts
  /** ແກ້ຄ່າທີ່ແອດມິນຢືນຢັນ ແລະ/ຫຼື ຜູກ/ຍ້າຍບິນ; ຄິດ flag ໃໝ່ສະເໝີ */
  async patch(id: string, input: PatchSlipInput, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    await this.requireRow(id);
    if (input.orderId) await this.requireOrder(input.orderId);
    const { count } = await this.prisma.paymentSlip.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: {
        orderId: input.orderId,
        confirmedAmount: input.confirmedAmount,
        confirmedCurrency: input.confirmedCurrency,
        confirmedPaidAt: input.confirmedPaidAt,
        confirmedRefNo: input.confirmedRefNo,
        confirmedDestAccount: input.confirmedDestAccount,
      },
    });
    if (count === 0) throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    await evaluateSlip(this.prisma, id);
    await this.audit.record({
      userId: actor.id,
      action: "slip.update",
      entity: "PaymentSlip",
      entityId: id,
      after: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
      ip,
    });
    return toSlipDto(await this.requireRow(id));
  }

  async retry(id: string, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    const { count } = await this.prisma.paymentSlip.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: { status: "PENDING_READ" },
    });
    if (count === 0) {
      await this.requireRow(id);
      throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    }
    // ບໍ່ກືນ error ຄືຕອນສ້າງ: retry ມີໄວ້ເພື່ອ enqueue ຈຶ່ງຕ້ອງໃຫ້ແອດມິນເຫັນເມື່ອລົ້ມ
    await this.queue.enqueueRead(id);
    await this.audit.record({ userId: actor.id, action: "slip.retry", entity: "PaymentSlip", entityId: id, ip });
    return toSlipDto(await this.requireRow(id));
  }

  async reject(id: string, input: RejectSlipInput, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    const { count } = await this.prisma.paymentSlip.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: { status: "REJECTED", rejectReason: input.reason, reviewedByUserId: actor.id, reviewedAt: new Date() },
    });
    if (count === 0) {
      await this.requireRow(id);
      throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    }
    await this.audit.record({
      userId: actor.id,
      action: "slip.reject",
      entity: "PaymentSlip",
      entityId: id,
      after: { reason: input.reason },
      ip,
    });
    return toSlipDto(await this.requireRow(id));
  }
```
ເພີ່ມ `type Prisma` ໃນ import ຈາກ `@oca/database`.

ເຫດຜົນ `patch` ເອີ້ນ `requireRow` ກ່ອນ: ເພື່ອ 404 `SLIP_NOT_FOUND` ກ່ອນກວດບິນ.

- [ ] **Step 4: controller** — ເພີ່ມ import `Patch`, `HttpCode`, `patchSlipSchema`, `rejectSlipSchema`, `type PatchSlipInput`, `type RejectSlipInput` ແລະ:

```ts
  @Patch("slips/:id")
  @RequirePermissions("payments:write")
  patch(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(patchSlipSchema)) body: PatchSlipInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.slips.patch(id, body, actor, req.ip);
  }

  @Post("slips/:id/retry")
  @HttpCode(200)
  @RequirePermissions("payments:write")
  retry(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.slips.retry(id, actor, req.ip);
  }

  @Post("slips/:id/reject")
  @HttpCode(200)
  @RequirePermissions("payments:write")
  reject(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectSlipSchema)) body: RejectSlipInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.slips.reject(id, body, actor, req.ip);
  }
```

- [ ] **Step 5:** `pnpm --filter @oca/api test -- slips.e2e permissions.e2e` → PASS; lint + tsc.

- [ ] **Step 6: commit** — `git add apps/api && git commit -m "feat(api): edit, retry and reject payment slips"`.

---

### Task 8: ຢືນຢັນ

**Files:**
- Modify: `slips.service.ts`, `slips.controller.ts`, `apps/api/test/slips.e2e.test.ts`

- [ ] **Step 1: test ແດງ** — ເພີ່ມໃນ `slips.e2e.test.ts` (ໃຊ້ `seedSlip` ຈາກ Task 7: ຍ້າຍ `seedSlip` ອອກມາເປັນ function ລະດັບ `describe("slips (e2e)")` ເພື່ອໃຊ້ຮ່ວມ ຖ້າຍັງຢູ່ໃນ describe ຍ່ອຍ):

```ts
  describe("ຢືນຢັນ", () => {
    const confirm = (id: string, headers: { Authorization: string }) =>
      request(server()).post(`/slips/${id}/confirm`).set(headers).send({});

    it("200: ສະລິບ CONFIRMED + ຄ່າ confirmed* ເຕີມຈາກຄ່າທີ່ອ່ານ + ບິນ PAID + ຜູ້ກວດ + audit ທັງ slip.confirm ແລະ order.pay", async () => {
      const { order, slip } = await seedSlip({ readPaidAt: new Date("2026-10-07T09:00:00.000Z"), readDestAccount: "010-12" });
      const res = await confirm(slip.id, await as("OWNER")).expect(200);
      expect(res.body).toMatchObject({
        status: "CONFIRMED",
        confirmed: { amount: "100000.00", currency: "LAK", refNo: "R1", destAccount: "010-12" },
      });
      expect(res.body.reviewedBy).toMatchObject({ name: "OWNER" });
      const paid = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(paid.status).toBe("PAID");
      expect(paid.paidAt).not.toBeNull();
      expect(await db.auditLog.count({ where: { action: "slip.confirm", entityId: slip.id } })).toBe(1);
      expect(await db.auditLog.count({ where: { action: "order.pay", entityId: order.id } })).toBe(1);
    });

    it("ໃຊ້ຄ່າທີ່ແອດມິນແກ້ (confirmed*) ກ່ອນຄ່າທີ່ອ່ານ", async () => {
      const { slip } = await seedSlip({ readAmount: "5", confirmedAmount: "100000" });
      const res = await confirm(slip.id, await as("OWNER")).expect(200);
      expect(res.body.confirmed.amount).toBe("100000.00");
    });

    it("ສິດ: CHAT_ADMIN (ບໍ່ມີ payments:write) → 403 ແລະ ບໍ່ປ່ຽນຫຍັງ", async () => {
      const { order, slip } = await seedSlip();
      await confirm(slip.id, await as("CHAT_ADMIN")).expect(403);
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    });

    it("ຍັງບໍ່ຜູກບິນ → 409 SLIP_NOT_LINKED; ບໍ່ມີຍອດ → 422 SLIP_AMOUNT_REQUIRED; ຍັງ PENDING_READ → 409 CONFLICT", async () => {
      const owner = await as("OWNER");
      const unlinked = await seedSlip({ orderId: null });
      expect((await confirm(unlinked.slip.id, owner).expect(409)).body.code).toBe("SLIP_NOT_LINKED");
      const noAmount = await seedSlip({ readAmount: null });
      expect((await confirm(noAmount.slip.id, owner).expect(422)).body.code).toBe("SLIP_AMOUNT_REQUIRED");
      const pending = await seedSlip({ status: "PENDING_READ" });
      expect((await confirm(pending.slip.id, owner).expect(409)).body.code).toBe("CONFLICT");
      expect((await confirm("nope", owner).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
    });

    it("READ_FAILED ຢືນຢັນໄດ້ ຖ້າແອດມິນຕື່ມຍອດມື", async () => {
      const { slip } = await seedSlip({ status: "READ_FAILED", readAmount: null, readRefNo: null });
      const owner = await as("OWNER");
      await confirm(slip.id, owner).expect(422);
      await request(server()).patch(`/slips/${slip.id}`).set(owner).send({ confirmedAmount: "100000" }).expect(200);
      await confirm(slip.id, owner).expect(200);
    });

    it("ຢືນຢັນຊ້ຳ → 409 SLIP_ALREADY_REVIEWED; ບິນຖືກ pay ຄັ້ງດຽວ", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      await confirm(slip.id, owner).expect(200);
      expect((await confirm(slip.id, owner).expect(409)).body.code).toBe("SLIP_ALREADY_REVIEWED");
      expect(await db.auditLog.count({ where: { action: "order.pay", entityId: order.id } })).toBe(1);
    });

    it("ບິນ EXPIRED/CANCELLED/PAID ແລ້ວ → 409 ORDER_INVALID_STATE ແລະ ສະລິບ rollback (ຍັງ READ, ບໍ່ມີ confirmed*)", async () => {
      const owner = await as("OWNER");
      for (const status of ["EXPIRED", "CANCELLED", "PAID"]) {
        const { slip } = await seedSlip({}, { status });
        const res = await confirm(slip.id, owner).expect(409);
        expect(res.body.code, status).toBe("ORDER_INVALID_STATE");
        const after = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
        expect(after.status).toBe("READ");
        expect(after.confirmedAmount).toBeNull();
        expect(after.reviewedByUserId).toBeNull();
      }
    });

    it("ໝົດເວລາຈອງແຕ່ worker ຍັງບໍ່ໄດ້ expire → 409 RESERVATION_EXPIRED ແລະ rollback", async () => {
      const { order, slip } = await seedSlip({}, { reservedUntil: new Date(Date.now() - 1000) });
      const res = await confirm(slip.id, await as("OWNER")).expect(409);
      expect(res.body.code).toBe("RESERVATION_EXPIRED");
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("READ");
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    });

    it("ຢືນຢັນພ້ອມກັນ 2 ຄັ້ງ → ສຳເລັດຄັ້ງດຽວ ອີກຄັ້ງ 409", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      const results = await Promise.all([confirm(slip.id, owner), confirm(slip.id, owner)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await db.auditLog.count({ where: { action: "order.pay", entityId: order.id } })).toBe(1);
    });

    it("ສະລິບອື່ນຂອງບິນດຽວກັນບໍ່ຖືກປ່ຽນ (ບໍ່ auto-reject)", async () => {
      const { order, slip } = await seedSlip();
      const other = await db.paymentSlip.create({
        data: { source: "UPLOAD", orderId: order.id, imageKey: "slips/o", imageMime: "image/png", imageBytes: 1, imageSha256: "f".repeat(64), status: "READ" },
      });
      await confirm(slip.id, await as("OWNER")).expect(200);
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("READ");
    });
  });
```

- [ ] **Step 2:** `pnpm --filter @oca/api test -- slips.e2e` → ກໍລະນີ confirm **FAIL**.

- [ ] **Step 3: service** — import `OrdersService` (`../orders/orders.service`) ແລະ inject `@Inject(OrdersService) private readonly orders: OrdersService` ໃນ constructor. ເພີ່ມ method:

```ts
  /**
   * ຢືນຢັນ: claim ສະລິບ (conditional UPDATE ກັນແຂ່ງ) + ເອີ້ນ pay ໃນ transaction ດຽວ.
   * pay ລົ້ມ (ບິນບໍ່ຢູ່ PENDING_PAYMENT / ໝົດເວລາຈອງ) → throw → rollback ທັງສະລິບ ແລະ ບິນ.
   */
  async confirm(id: string, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    const slip = await this.requireRow(id);
    if (slip.status === "CONFIRMED" || slip.status === "REJECTED") {
      throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    }
    if (slip.status === "PENDING_READ") throw apiError("CONFLICT", "The slip is still being read");
    if (!slip.orderId) throw apiError("SLIP_NOT_LINKED", "Link the slip to an order before confirming");
    const orderId = slip.orderId;

    // ຄ່າສຸດທ້າຍ = ທີ່ແອດມິນແກ້ ກ່ອນ ບໍ່ດັ່ງນັ້ນທີ່ເຄື່ອງອ່ານ; ເກັບຄືນໃສ່ confirmed* ໃຫ້ຄົບ (ເປັນ label ຂອງຂັ້ນ 2)
    const amount = slip.confirmedAmount ?? slip.readAmount;
    if (amount === null) throw apiError("SLIP_AMOUNT_REQUIRED", "Enter the slip amount before confirming");

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.paymentSlip.updateMany({
        // orderId ຢູ່ໃນ where: ຖ້າມີຄົນຍ້າຍບິນລະຫວ່າງອ່ານ ແລະ claim ຈະບໍ່ຢືນຢັນຜິດບິນ
        where: { id, orderId, status: { in: ["READ", "READ_FAILED"] } },
        data: {
          status: "CONFIRMED",
          confirmedAmount: amount,
          confirmedCurrency: slip.confirmedCurrency ?? slip.readCurrency,
          confirmedPaidAt: slip.confirmedPaidAt ?? slip.readPaidAt,
          confirmedRefNo: slip.confirmedRefNo ?? slip.readRefNo,
          confirmedDestAccount: slip.confirmedDestAccount ?? slip.readDestAccount,
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
        },
      });
      if (count === 0) throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
      await this.orders.payWithin(tx, orderId, actor);
    });

    await this.audit.record({
      userId: actor.id,
      action: "slip.confirm",
      entity: "PaymentSlip",
      entityId: id,
      after: { orderId, amount: amount.toFixed(2) },
      ip,
    });
    await this.audit.record({
      userId: actor.id,
      action: "order.pay",
      entity: "Order",
      entityId: orderId,
      after: { status: "PAID", slipId: id },
      ip,
    });
    return toSlipDto(await this.requireRow(id));
  }
```

- [ ] **Step 4: controller** — ເພີ່ມ:

```ts
  @Post("slips/:id/confirm")
  @HttpCode(200)
  @RequirePermissions("payments:write")
  confirm(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.slips.confirm(id, actor, req.ip);
  }
```

- [ ] **Step 5:** `pnpm --filter @oca/api test -- slips.e2e` → PASS ທັງໝົດ. ຖ້າ test ພ້ອມກັນ (`Promise.all`) ບໍ່ໄດ້ `[200, 409]` ໃຫ້ກວດວ່າ claim ໃຊ້ `updateMany` ໃນ transaction ແທ້ (ແຖວ lock ຈົນ commit) ແລະ ບໍ່ແກ້ test ເພື່ອໃຫ້ຜ່ານ.

- [ ] **Step 6: mutation check** (ລາຍງານຜົນ): (a) ລຶບ `await this.orders.payWithin(...)` → test "ບິນເປັນ PAID" ຕ້ອງແດງ; (b) ຍ້າຍ `payWithin` ອອກນອກ transaction (ຫຼັງ `$transaction`) → test rollback ("ບິນ EXPIRED...") ຕ້ອງແດງ; (c) ເອົາ `status: { in: [...] }` ອອກຈາກ claim `where` → test ຢືນຢັນພ້ອມກັນ/ຊ້ຳຕ້ອງແດງ. ຄືນຄ່າເດີມ.

- [ ] **Step 7: commit** — `git add apps/api && git commit -m "feat(api): confirm slip and mark the order paid atomically"`.

---

### Task 9: ກວດລວມ + ເອກະສານ

- [ ] **Step 1:** `pnpm --filter @oca/api test` ທັງໝົດ (ລວມ `permissions.e2e` sweep ທີ່ຕອນນີ້ຄຸມ route ໃໝ່) → ຜ່ານ; `pnpm lint && pnpm build` ຜ່ານ. ລາຍງານຈຳນວນ test.

- [ ] **Step 2: DEPLOYMENT-NOTES** — ອ່ານ `docs/DEPLOYMENT-NOTES.md` ແລ້ວເພີ່ມຫົວຂໍ້ໃໝ່ທ້າຍໄຟລ໌ (ຕາມເລກຫົວຂໍ້ຖັດໄປ ແລະ ຮູບແບບເດີມ):

```md
## ສະລິບໂອນເງິນ (Slip Verification)

- ຮູບສະລິບເກັບເປັນໄຟລ໌ໃນ `SLIP_STORAGE_DIR`. **API ແລະ worker ຕ້ອງຊີ້ໄປໂຟເດີດຽວກັນ** (ຢູ່ເຄື່ອງດຽວກັນ ຫຼື volume ຮ່ວມ). ໃນ production ໃຫ້ໃຊ້ path ແບບ absolute ແລະ ສຳຮອງໂຟເດີນີ້ (ເປັນຂໍ້ມູນການເງິນ + ຂໍ້ມູນ train).
- ຄິວ BullMQ `slips` ໃຊ້ `QUEUE_PREFIX` ດຽວກັນທັງ API ແລະ worker. ຖ້າ worker ບໍ່ແລ່ນ ສະລິບຈະຄ້າງ `PENDING_READ` (ແອດມິນຍັງຕື່ມຄ່າມືແລ້ວ confirm ໄດ້ ຫຼັງຈາກກົດ retry/ປະຕິເສດ — ເບິ່ງ UI).
- `SLIP_READER=fake` (ຄ່າເລີ່ມຕົ້ນ) ບໍ່ໃຊ້ AI: ສະລິບອອກມາ "ອ່ານແລ້ວ" ດ້ວຍຜົນວ່າງ ແລະ ແອດມິນຕື່ມຍອດເອງ. reader ຈິງມາໃນຂັ້ນ 2.
- ລິ້ງຮູບຈາກ Meta ອາດໝົດອາຍຸ: ປຸ່ມ "ໃຊ້ເປັນສະລິບ" ໃນ Inbox ດາວໂຫຼດຮູບຕອນກົດ; ຖ້າລົ້ມ ໃຫ້ອັບໂຫຼດຮູບເອງໃນໜ້າບິນ.
- reverse proxy ຕ້ອງອະນຸຍາດ body ≥ 8MB ໃຫ້ `POST /orders/:id/slips`.
```

(ປັບປະໂຫຍກ "ຫຼັງຈາກກົດ retry/ປະຕິເສດ" ໃຫ້ກົງກັບພຶດຕິກຳຈິງ: confirm ຕ້ອງການ status `READ`/`READ_FAILED` ບໍ່ແມ່ນ `PENDING_READ`.)

- [ ] **Step 3: commit** — `git add docs apps/api && git commit -m "docs: deployment notes for slip storage and queue"`.

---

## Self-review (ເຮັດແລ້ວ)
- Spec §3 flow → Task 5-8; §5 ບິນໝົດເວລາ (ບໍ່ປັບເອງ; ຜູກໃໝ່ = PATCH orderId; ປະຕິເສດ) → Task 7+8; §7 routes ທັງໝົດ + `GET /conversations/:id/slips` (ເພີ່ມເພື່ອ UI); §10 ຄວາມປອດໄພ (magic bytes, no redirect, https, ຮູບຜ່ານ API) → Task 3+5.
- ຊື່ທີ່ S3/S4 ໃຊ້ຕໍ່: `SlipDto` (`read`, `confirmed`, `flags`, `reviewedBy`, ...), routes ຂ້າງເທິງ, `SLIP_QUEUE_NAME`/`SLIP_JOB_READ`/`SlipReadJobData`/`SLIP_READ_ATTEMPTS` ຈາກ `@oca/database`.
- ບໍ່ມີ placeholder. ຂໍ້ຈຳກັດທີ່ຍອມຮັບ: 413 ບໍ່ມີ code `SLIP_FILE_INVALID`; enqueue ລົ້ມຕອນສ້າງຖືກກືນ (retry ໄດ້).
