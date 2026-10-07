# Slip Verification S3 — Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**ຕ້ອງເຮັດ S1 ແລະ S2 ໃຫ້ຄົບກ່ອນ** (ໃຊ້ `SLIP_QUEUE_NAME`/`SLIP_JOB_READ`/`SLIP_READ_ATTEMPTS` ຈາກ S2 Task 1, `evaluateSlip` ຈາກ S1, `SlipReader`/`StorageService` ຈາກ S1).

**Goal:** worker ດຶງ job `read-slip` ຈາກຄິວ `slips`, ອ່ານຮູບຈາກ storage, ເອີ້ນ `SlipReader`, ບັນທຶກຜົນ (ປັບໃຫ້ເປັນຄ່າມາດຕະຖານ) ແລະ ຄິດ flag; ລົ້ມຄົບຈຳນວນຄັ້ງ → `READ_FAILED`.

**Architecture:** logic ທີ່ແຕະ DB (`storeSlipReadResult`, `markSlipReadFailed`) ຢູ່ໃນ `@oca/database` ເພື່ອທົດສອບກັບ Postgres ຈິງ (ຄືກັບ `runExpireReservations`). worker ມີແຕ່ຕົວປະສານ: ອ່ານ storage → reader → store ແລະ BullMQ `Worker` ໃນ Nest provider. ຜູ້ຕັດສິນວ່າເປັນຄັ້ງສຸດທ້າຍ = `job.attemptsMade + 1 >= attempts` ໃນ processor ເອງ (ບໍ່ອີງ event `failed`).

**Tech Stack:** NestJS 11, BullMQ, Prisma 7, vitest (unit ດ້ວຍ stub; integration ກັບ Redis ຈິງ ໂດຍໃຊ້ prefix ສຸ່ມ ຄືກັບ `inventory.worker.test.ts`).

**ກົດຂອງໂປຣເຈັກ** (ຄືກັບ S1/S2). ຫ້າມແຕະ Redis 6379 ຂອງຜູ້ໃຊ້ — integration test ໃຊ້ `REDIS_URL` ຈາກ `.env` ກັບ prefix ສຸ່ມ `oca-test-<uuid>` ແລະ `obliterate` ຕອນຈົບ (ຮູບແບບທີ່ມີຢູ່).

## File map

| ໄຟລ໌ | ໜ້າທີ່ |
|---|---|
| `packages/database/src/slips/read-result.ts` (ໃໝ່) | `storeSlipReadResult`, `markSlipReadFailed` |
| `packages/database/src/slips/index.ts` (ແກ້) | export |
| `apps/api/test/slip-read-result.test.ts` (ໃໝ່) | test ກັບ Postgres ຈິງ |
| `apps/worker/package.json` (ແກ້) | deps `@oca/ai-engine`, `@oca/shared` |
| `apps/worker/src/config/env.ts` (+test) (ແກ້) | `SLIP_STORAGE_DIR`, `SLIP_READER`, `SLIP_FAKE_RESULT` |
| `apps/worker/src/processors/read-slip.processor.ts` (+test) (ໃໝ່) | ຕົວປະສານອ່ານ 1 ສະລິບ |
| `apps/worker/src/processors/slip.worker.ts` (ໃໝ່) | BullMQ Worker + tokens |
| `apps/worker/src/worker.module.ts` (ແກ້) | wiring |
| `apps/worker/test/slip.worker.test.ts` (ໃໝ່) | integration ກັບ Redis ຈິງ |

---

### Task 1: `@oca/database` — storeSlipReadResult / markSlipReadFailed

**Files:**
- Create: `packages/database/src/slips/read-result.ts`
- Modify: `packages/database/src/slips/index.ts`
- Create: `apps/api/test/slip-read-result.test.ts`

- [ ] **Step 1: test ແດງ** — `apps/api/test/slip-read-result.test.ts`:

```ts
import { type PrismaClient, createPrismaClient, markSlipReadFailed, storeSlipReadResult } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

describe("storeSlipReadResult / markSlipReadFailed (Postgres ຈິງ)", () => {
  let db: PrismaClient;
  const now = new Date("2026-10-07T10:00:00.000Z");
  const reader = { name: "fake", version: "1" };

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
  });

  const makeOrder = () =>
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
        createdAt: new Date("2026-10-07T08:00:00.000Z"),
        reservedUntil: new Date("2026-10-07T11:00:00.000Z"),
      },
    });
  const makeSlip = (patch: object = {}) =>
    db.paymentSlip.create({
      data: {
        source: "UPLOAD",
        imageKey: "slips/k",
        imageMime: "image/png",
        imageBytes: 1,
        imageSha256: Math.random().toString(16).slice(2).padEnd(64, "0"),
        ...patch,
      },
    });

  it("ບັນທຶກຜົນທີ່ປັບເປັນມາດຕະຖານ, ຕັ້ງ READ, ເກັບຊື່ reader, ແລະ ຄິດ flag", async () => {
    const order = await makeOrder();
    const slip = await makeSlip({ orderId: order.id });
    const stored = await storeSlipReadResult(
      db,
      slip.id,
      reader,
      {
        amount: "₭ 100,000",
        currency: " lak ",
        paidAt: "2026-10-07T16:00:00+07:00",
        destAccount: "  010-12-00-0123 ",
        refNo: " REF-1 ",
        raw: { text: "hello" },
      },
      { now },
    );
    expect(stored).toBe(true);
    const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(row).toMatchObject({
      status: "READ",
      readerName: "fake",
      readerVersion: "1",
      readCurrency: "LAK",
      readDestAccount: "010-12-00-0123",
      readRefNo: "REF-1",
    });
    expect(row.readAmount?.toFixed(2)).toBe("100000.00");
    expect(row.readPaidAt?.toISOString()).toBe("2026-10-07T09:00:00.000Z");
    expect(row.readRaw).toEqual({ value: { text: "hello" } });
    expect(row.flags).toEqual([]);
  });

  it("ຄ່າທີ່ແປງບໍ່ໄດ້ → null (ບໍ່ throw): ຍອດບໍ່ແມ່ນຕົວເລກ, ສະກຸນບໍ່ຮູ້ຈັກ, ວັນທີຜິດ, ຂໍ້ຄວາມວ່າງ → UNREADABLE_FIELDS", async () => {
    const slip = await makeSlip();
    await storeSlipReadResult(
      db,
      slip.id,
      reader,
      { amount: "abc", currency: "EUR", paidAt: "yesterday-ish", destAccount: "   ", refNo: "", raw: null },
      { now },
    );
    const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(row.status).toBe("READ");
    expect([row.readAmount, row.readCurrency, row.readPaidAt, row.readDestAccount, row.readRefNo]).toEqual([null, null, null, null, null]);
    expect(row.flags).toEqual(["UNREADABLE_FIELDS"]);
  });

  it("ຜົນວ່າງຈາກ fake reader (raw ເປັນ {}) ຍັງເປັນ READ ເພື່ອໃຫ້ແອດມິນຕື່ມມື", async () => {
    const slip = await makeSlip();
    expect(await storeSlipReadResult(db, slip.id, reader, { raw: {} }, { now })).toBe(true);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("READ");
  });

  it("raw ໃຫຍ່ເກີນ → ເກັບແຕ່ { truncated: true }; ຂໍ້ຄວາມຍາວຖືກຕັດ 100 ໂຕ", async () => {
    const slip = await makeSlip();
    await storeSlipReadResult(db, slip.id, reader, { refNo: "x".repeat(500), raw: { blob: "y".repeat(30_000) } }, { now });
    const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(row.readRaw).toEqual({ truncated: true });
    expect(row.readRefNo).toHaveLength(100);
  });

  it("ບໍ່ຂຽນທັບຖ້າສະຖານະບໍ່ແມ່ນ PENDING_READ (ແອດມິນປະຕິເສດ/ກວດແລ້ວ ລະຫວ່າງອ່ານ) ແລະ ບໍ່ແຕະ confirmed*", async () => {
    for (const status of ["READ", "READ_FAILED", "CONFIRMED", "REJECTED"] as const) {
      const slip = await makeSlip({ status, confirmedAmount: "5", readRefNo: "OLD" });
      expect(await storeSlipReadResult(db, slip.id, reader, { amount: "100", refNo: "NEW", raw: {} }, { now }), status).toBe(false);
      const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
      expect(row.status).toBe(status);
      expect(row.readRefNo).toBe("OLD");
      expect(row.confirmedAmount?.toFixed(2)).toBe("5.00");
    }
  });

  it("ບໍ່ພົບສະລິບ → false (ບໍ່ throw)", async () => {
    expect(await storeSlipReadResult(db, "nope", reader, { raw: {} }, { now })).toBe(false);
  });

  it("markSlipReadFailed: PENDING_READ → READ_FAILED; ສະຖານະອື່ນບໍ່ແຕະ", async () => {
    const pending = await makeSlip();
    expect(await markSlipReadFailed(db, pending.id)).toBe(true);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("READ_FAILED");
    expect(await markSlipReadFailed(db, pending.id)).toBe(false);
    const confirmed = await makeSlip({ status: "CONFIRMED" });
    expect(await markSlipReadFailed(db, confirmed.id)).toBe(false);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: confirmed.id } })).status).toBe("CONFIRMED");
    expect(await markSlipReadFailed(db, "nope")).toBe(false);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/database build && pnpm --filter @oca/api test -- slip-read-result` → **FAIL** (ຟັງຊັນບໍ່ມີ).

- [ ] **Step 3: implement** — `packages/database/src/slips/read-result.ts`:

```ts
import { normalizeSlipAmount } from "@oca/shared";
import type { PrismaClient } from "../generated/client";
import { evaluateSlip } from "./evaluate-slip";

/** ຮູບຜົນອ່ານ (ກົງກັບ SlipReadResult ຂອງ @oca/ai-engine ແຕ່ບໍ່ import ເພື່ອບໍ່ໃຫ້ database ຜູກກັບ ai-engine) */
export interface SlipReadOutput {
  amount?: string;
  currency?: string;
  /** ISO 8601 */
  paidAt?: string;
  destAccount?: string;
  refNo?: string;
  raw: unknown;
}

export interface StoreSlipReadOptions {
  /** ສຳລັບ test */
  now?: Date;
}

const CURRENCIES = ["LAK", "THB", "USD"] as const;
type SlipCurrency = (typeof CURRENCIES)[number];
const TEXT_MAX = 100;
const RAW_MAX_CHARS = 20_000;

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, TEXT_MAX);
}

function cleanCurrency(value: unknown): SlipCurrency | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (CURRENCIES as readonly string[]).includes(upper) ? (upper as SlipCurrency) : null;
}

function cleanDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ຜົນດິບຂອງ reader ບໍ່ເຊື່ອຖື: ຫໍ່ເປັນ { value } (ກັນ JSON null) ແລະ ຈຳກັດຂະໜາດ */
function boundedRaw(raw: unknown): { value: unknown } | { truncated: true } {
  let text: string;
  try {
    text = JSON.stringify(raw ?? null) ?? "null";
  } catch {
    return { truncated: true };
  }
  if (text.length > RAW_MAX_CHARS) return { truncated: true };
  return { value: JSON.parse(text) as unknown };
}

/**
 * ບັນທຶກຜົນທີ່ເຄື່ອງອ່ານໄດ້ ລົງສະລິບທີ່ຍັງ PENDING_READ ເທົ່ານັ້ນ (conditional UPDATE: ຖ້າແອດມິນປະຕິເສດ/ກວດແລ້ວລະຫວ່າງອ່ານ
 * ຈະບໍ່ຂຽນທັບ) ແລ້ວຄິດ flag. ຄືນ false ເມື່ອຂ້າມ. ຄ່າທີ່ແປງບໍ່ໄດ້ = null (ບໍ່ throw): ແອດມິນຕື່ມມືໄດ້.
 */
export async function storeSlipReadResult(
  db: PrismaClient,
  slipId: string,
  reader: { name: string; version: string },
  result: SlipReadOutput,
  options: StoreSlipReadOptions = {},
): Promise<boolean> {
  const { count } = await db.paymentSlip.updateMany({
    where: { id: slipId, status: "PENDING_READ" },
    data: {
      status: "READ",
      readerName: reader.name,
      readerVersion: reader.version,
      readAmount: normalizeSlipAmount(result.amount),
      readCurrency: cleanCurrency(result.currency),
      readPaidAt: cleanDate(result.paidAt),
      readDestAccount: cleanText(result.destAccount),
      readRefNo: cleanText(result.refNo),
      readRaw: boundedRaw(result.raw) as object,
    },
  });
  if (count === 0) return false;
  await evaluateSlip(db, slipId, options);
  return true;
}

/** job ລົ້ມຄົບຈຳນວນຄັ້ງ: PENDING_READ → READ_FAILED (ແອດມິນ retry ຫຼື ຕື່ມມືໄດ້). ຄືນ false ເມື່ອບໍ່ແຕະ. */
export async function markSlipReadFailed(db: PrismaClient, slipId: string): Promise<boolean> {
  const { count } = await db.paymentSlip.updateMany({
    where: { id: slipId, status: "PENDING_READ" },
    data: { status: "READ_FAILED" },
  });
  return count > 0;
}
```

ໝາຍເຫດ: `normalizeSlipAmount(result.amount)` ຮັບ `string | undefined | null` ແລ້ວ. `readAmount` ຮັບ string `"100000.00"` ຫຼື `null` (Prisma Decimal input).

- [ ] **Step 4:** ໃນ `packages/database/src/slips/index.ts` ເພີ່ມ `export * from "./read-result";`. `pnpm --filter @oca/database build && pnpm --filter @oca/api test -- slip-read-result` → PASS. `pnpm --filter @oca/database lint`.

- [ ] **Step 5: commit** — `git add packages/database apps/api/test && git commit -m "feat(database): store slip read results and mark read failures"`.

---

### Task 2: worker — env, dependencies, processor

**Files:**
- Modify: `apps/worker/package.json` (ຜ່ານ pnpm), `apps/worker/src/config/env.ts`, `apps/worker/src/config/env.test.ts`
- Create: `apps/worker/src/processors/read-slip.processor.ts`, `apps/worker/src/processors/read-slip.processor.test.ts`

- [ ] **Step 1: dependencies** — `pnpm --filter @oca/worker add @oca/ai-engine@workspace:* @oca/shared@workspace:*`; `pnpm --filter @oca/ai-engine build`.

- [ ] **Step 2: test env ແດງ** — ເບິ່ງ `apps/worker/src/config/env.test.ts` ແລ້ວເພີ່ມ test (ໃຊ້ fixture `base` ຕາມທີ່ມີ; ຖ້າບໍ່ມີ ໃຫ້ໃຊ້ `{ DATABASE_URL: "postgresql://x", REDIS_URL: "redis://x" }`):

```ts
  it("SLIP_*: ຄ່າເລີ່ມຕົ້ນ ແລະ ອ່ານຄ່າທີ່ຕັ້ງ; SLIP_FAKE_RESULT ວ່າງ = ບໍ່ຕັ້ງ", () => {
    const base = { DATABASE_URL: "postgresql://x", REDIS_URL: "redis://x" };
    const defaults = parseEnv(base);
    expect(defaults.SLIP_STORAGE_DIR).toBe("../../.data/slips");
    expect(defaults.SLIP_READER).toBe("fake");
    expect(defaults.SLIP_FAKE_RESULT).toBeUndefined();
    const set = parseEnv({ ...base, SLIP_STORAGE_DIR: "/d", SLIP_READER: "x", SLIP_FAKE_RESULT: "" });
    expect(set.SLIP_STORAGE_DIR).toBe("/d");
    expect(set.SLIP_READER).toBe("x");
    expect(set.SLIP_FAKE_RESULT).toBeUndefined();
  });
```

`pnpm --filter @oca/worker test -- config/env` → **FAIL**. ແລ້ວ `env.ts` ເພີ່ມໃນ `z.object`:

```ts
  // ຕ້ອງຊີ້ບ່ອນດຽວກັບ API (ເບິ່ງ apps/api/src/config/env.ts)
  SLIP_STORAGE_DIR: z.string().min(1).default("../../.data/slips"),
  SLIP_READER: z.string().min(1).default("fake"),
  SLIP_FAKE_RESULT: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
```

→ PASS.

- [ ] **Step 3: test processor ແດງ** — `apps/worker/src/processors/read-slip.processor.test.ts`:

```ts
import { StorageNotFoundError } from "@oca/ai-engine";
import type { PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { type ReadSlipDeps, processReadSlip } from "./read-slip.processor";

const bytes = new Uint8Array([1, 2, 3]);

function makeDeps(overrides: Partial<ReadSlipDeps> = {}, slip: unknown = { imageKey: "slips/k", imageMime: "image/png", status: "PENDING_READ" }) {
  const findUnique = vi.fn().mockResolvedValue(slip);
  const deps: ReadSlipDeps = {
    db: { paymentSlip: { findUnique } } as unknown as PrismaClient,
    storage: { put: vi.fn(), get: vi.fn().mockResolvedValue({ bytes, mime: "image/png" }) },
    reader: { name: "fake", version: "1", read: vi.fn().mockResolvedValue({ amount: "10", raw: { a: 1 } }) },
    store: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  return { deps, findUnique };
}
const job = (attemptsMade = 0, attempts = 3) => ({ slipId: "s1", attemptsMade, attempts });

describe("processReadSlip", () => {
  it("ອ່ານຮູບຈາກ storage → reader → store ດ້ວຍຊື່/ເວີຊັນ reader ແລະ ຄືນ 'read'", async () => {
    const { deps, findUnique } = makeDeps();
    expect(await processReadSlip(deps, job())).toBe("read");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "s1" }, select: { imageKey: true, imageMime: true, status: true } });
    expect(deps.storage.get).toHaveBeenCalledWith("slips/k");
    expect(deps.reader.read).toHaveBeenCalledWith({ bytes, mime: "image/png" });
    expect(deps.store).toHaveBeenCalledWith(deps.db, "s1", { name: "fake", version: "1" }, { amount: "10", raw: { a: 1 } });
  });

  it("store ຄືນ false (ຖືກຂ້າມ) → 'skipped'", async () => {
    const { deps } = makeDeps({ store: vi.fn().mockResolvedValue(false) });
    expect(await processReadSlip(deps, job())).toBe("skipped");
  });

  it.each([[null], [{ imageKey: "k", imageMime: "image/png", status: "READ" }], [{ imageKey: "k", imageMime: "image/png", status: "REJECTED" }]])(
    "ບໍ່ພົບສະລິບ ຫຼື ບໍ່ແມ່ນ PENDING_READ → 'skipped' ໂດຍບໍ່ເອີ້ນ reader",
    async (slip) => {
      const { deps } = makeDeps({}, slip);
      expect(await processReadSlip(deps, job())).toBe("skipped");
      expect(deps.reader.read).not.toHaveBeenCalled();
      expect(deps.store).not.toHaveBeenCalled();
    },
  );

  it("reader throw ຄັ້ງທີ່ຍັງເຫຼືອໂອກາດ → throw ຕໍ່ (ໃຫ້ BullMQ retry) ແລະ ບໍ່ mark failed", async () => {
    const { deps } = makeDeps({ reader: { name: "f", version: "1", read: vi.fn().mockRejectedValue(new Error("boom")) } });
    await expect(processReadSlip(deps, job(0, 3))).rejects.toThrow("boom");
    await expect(processReadSlip(deps, job(1, 3))).rejects.toThrow("boom");
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("reader throw ຄັ້ງສຸດທ້າຍ → mark READ_FAILED ແລ້ວ throw ຕໍ່ (job ຖືກບັນທຶກວ່າລົ້ມ)", async () => {
    const { deps } = makeDeps({ reader: { name: "f", version: "1", read: vi.fn().mockRejectedValue(new Error("boom")) } });
    await expect(processReadSlip(deps, job(2, 3))).rejects.toThrow("boom");
    expect(deps.markFailed).toHaveBeenCalledWith(deps.db, "s1");
  });

  it("attempts ບໍ່ໄດ້ຕັ້ງ (=1) → ຄັ້ງທຳອິດຄືຄັ້ງສຸດທ້າຍ", async () => {
    const { deps } = makeDeps({ reader: { name: "f", version: "1", read: vi.fn().mockRejectedValue(new Error("boom")) } });
    await expect(processReadSlip(deps, { slipId: "s1", attemptsMade: 0, attempts: undefined })).rejects.toThrow("boom");
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
  });

  it("ໄຟລ໌ໃນ storage ຫາຍ → ບໍ່ retry (ບໍ່ມີປະໂຫຍດ): mark failed ທັນທີ ແລະ ຄືນ 'failed' ໂດຍບໍ່ throw", async () => {
    const { deps } = makeDeps({
      storage: { put: vi.fn(), get: vi.fn().mockRejectedValue(new StorageNotFoundError("slips/k")) },
    });
    expect(await processReadSlip(deps, job(0, 3))).toBe("failed");
    expect(deps.markFailed).toHaveBeenCalledWith(deps.db, "s1");
    expect(deps.reader.read).not.toHaveBeenCalled();
  });

  it("store throw (DB ລົ້ມຊົ່ວຄາວ) ນັບເປັນຄວາມລົ້ມເຫຼວຂອງຄັ້ງນັ້ນຄືກັນ", async () => {
    const { deps } = makeDeps({ store: vi.fn().mockRejectedValue(new Error("db down")) });
    await expect(processReadSlip(deps, job(2, 3))).rejects.toThrow("db down");
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4:** `pnpm --filter @oca/worker test -- read-slip` → **FAIL**.

- [ ] **Step 5: implement** — `apps/worker/src/processors/read-slip.processor.ts`:

```ts
import { type SlipReader, type StorageService, StorageNotFoundError } from "@oca/ai-engine";
import { type PrismaClient, type SlipReadOutput, markSlipReadFailed, storeSlipReadResult } from "@oca/database";

export interface ReadSlipDeps {
  db: PrismaClient;
  storage: StorageService;
  reader: SlipReader;
  /** ໃສ່ໄດ້ເພື່ອ test; ຄ່າເລີ່ມຕົ້ນຢູ່ `defaultReadSlipDeps` */
  store: (
    db: PrismaClient,
    slipId: string,
    reader: { name: string; version: string },
    result: SlipReadOutput,
  ) => Promise<boolean>;
  markFailed: (db: PrismaClient, slipId: string) => Promise<boolean>;
}

export const defaultStore: ReadSlipDeps["store"] = (db, slipId, reader, result) =>
  storeSlipReadResult(db, slipId, reader, result);
export const defaultMarkFailed: ReadSlipDeps["markFailed"] = markSlipReadFailed;

export interface ReadSlipJob {
  slipId: string;
  /** ຈຳນວນຄັ້ງທີ່ລອງແລ້ວກ່ອນຄັ້ງນີ້ (BullMQ job.attemptsMade ຕອນກຳລັງປະມວນຜົນ) */
  attemptsMade: number;
  attempts: number | undefined;
}

export type ReadSlipOutcome = "read" | "skipped" | "failed";

/**
 * ອ່ານ 1 ສະລິບ. throw ເມື່ອລົ້ມແລະຍັງມີໂອກາດ retry (ໃຫ້ BullMQ ຈັດການ backoff); ຄັ້ງສຸດທ້າຍ → mark READ_FAILED ກ່ອນ throw.
 * ຂ້າມ (ບໍ່ throw) ເມື່ອສະລິບຫາຍ ຫຼື ບໍ່ແມ່ນ PENDING_READ (ແອດມິນປະຕິເສດ/ກວດແລ້ວ ຫຼື job ຊ້ຳ).
 */
export async function processReadSlip(deps: ReadSlipDeps, job: ReadSlipJob): Promise<ReadSlipOutcome> {
  const slip = await deps.db.paymentSlip.findUnique({
    where: { id: job.slipId },
    select: { imageKey: true, imageMime: true, status: true },
  });
  if (!slip || slip.status !== "PENDING_READ") return "skipped";

  try {
    const { bytes } = await deps.storage.get(slip.imageKey);
    const result = await deps.reader.read({ bytes, mime: slip.imageMime });
    const stored = await deps.store(deps.db, job.slipId, { name: deps.reader.name, version: deps.reader.version }, result);
    return stored ? "read" : "skipped";
  } catch (error) {
    // ໄຟລ໌ຫາຍ: retry ບໍ່ຊ່ວຍ
    if (error instanceof StorageNotFoundError) {
      await deps.markFailed(deps.db, job.slipId);
      return "failed";
    }
    const isLastAttempt = job.attemptsMade + 1 >= (job.attempts ?? 1);
    if (isLastAttempt) await deps.markFailed(deps.db, job.slipId);
    throw error;
  }
}
```

- [ ] **Step 6:** `pnpm --filter @oca/worker test -- read-slip config/env && pnpm --filter @oca/worker lint && pnpm --filter @oca/worker exec tsc --noEmit` → ຜ່ານ. (ຖ້າ `SlipReadOutput` ບໍ່ຖືກ export ຈາກ `@oca/database` ໃຫ້ກວດ `packages/database/src/slips/index.ts` ແລະ build ໃໝ່.)

- [ ] **Step 7: mutation check** (ລາຍງານ): ປ່ຽນ `job.attemptsMade + 1 >= ...` ເປັນ `job.attemptsMade >= ...` → test "ຄັ້ງສຸດທ້າຍ" ຕ້ອງແດງ; ລຶບການກວດ `status !== "PENDING_READ"` → test skipped ຕ້ອງແດງ. ຄືນຄ່າເດີມ.

- [ ] **Step 8: commit** — `git add apps/worker pnpm-lock.yaml && git commit -m "feat(worker): slip read processor and env"`.

---

### Task 3: worker — BullMQ Worker + wiring + integration test

**Files:**
- Create: `apps/worker/src/processors/slip.worker.ts`
- Modify: `apps/worker/src/worker.module.ts`
- Create: `apps/worker/test/slip.worker.test.ts`

- [ ] **Step 1: test ແດງ** — `apps/worker/test/slip.worker.test.ts` (ຮູບແບບດຽວກັບ `inventory.worker.test.ts`; ອ່ານໄຟລ໌ນັ້ນກ່ອນເພື່ອ copy ການ setup/teardown ທີ່ຖືກຕ້ອງ):

```ts
import { randomUUID } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SLIP_JOB_READ, SLIP_QUEUE_NAME, SLIP_READ_JOB_OPTIONS } from "@oca/database";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PRISMA } from "../src/prisma/prisma.module";
import { SLIP_READER, SLIP_STORAGE } from "../src/processors/slip.worker";
import { WorkerModule } from "../src/worker.module";

describe("SlipWorker (integration, Redis ຈິງ, prisma/storage/reader stub)", () => {
  const prefix = `oca-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL as string;

  // prisma stub ຂະໜາດນ້ອຍ: ພຽງພໍສຳລັບ processReadSlip + storeSlipReadResult + evaluateSlip
  const slipRow = {
    id: "s1",
    imageKey: "slips/k",
    imageMime: "image/png",
    imageSha256: "a".repeat(64),
    status: "PENDING_READ",
    order: null,
    readAmount: { toFixed: () => "100.00" },
    readCurrency: "LAK",
    readPaidAt: null,
    readDestAccount: null,
    readRefNo: "R1",
    confirmedAmount: null,
    confirmedCurrency: null,
    confirmedPaidAt: null,
    confirmedRefNo: null,
    confirmedDestAccount: null,
  };
  const updateMany = vi.fn();
  const paymentSlip = {
    findUnique: vi.fn(),
    updateMany,
    update: vi.fn().mockResolvedValue({}),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  const read = vi.fn();
  const get = vi.fn();

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
      .useValue({ paymentSlip, storeSetting: { findUnique: vi.fn().mockResolvedValue(null) }, order: { findMany: vi.fn().mockResolvedValue([]) }, $disconnect: async () => undefined })
      .overrideProvider(SLIP_STORAGE)
      .useValue({ put: vi.fn(), get })
      .overrideProvider(SLIP_READER)
      .useValue({ name: "fake", version: "1", read })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    producer = new Redis(redisUrl, { maxRetriesPerRequest: null });
    eventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(SLIP_QUEUE_NAME, { connection: producer, prefix });
    events = new QueueEvents(SLIP_QUEUE_NAME, { connection: eventsConnection, prefix });
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

  beforeEach(() => {
    vi.clearAllMocks();
    paymentSlip.findUnique.mockImplementation(async (args: { include?: unknown }) => (args.include ? slipRow : slipRow));
    paymentSlip.update.mockResolvedValue({});
    paymentSlip.findFirst.mockResolvedValue(null);
    updateMany.mockResolvedValue({ count: 1 });
    get.mockResolvedValue({ bytes: new Uint8Array([1]), mime: "image/png" });
  });

  it("ປະມວນຜົນ job read-slip: ອ່ານຮູບ, ເອີ້ນ reader, ບັນທຶກ READ", async () => {
    read.mockResolvedValue({ amount: "100", refNo: "R1", raw: {} });
    const job = await queue.add(SLIP_JOB_READ, { slipId: "s1" }, SLIP_READ_JOB_OPTIONS);
    await job.waitUntilFinished(events, 10_000);
    expect(get).toHaveBeenCalledWith("slips/k");
    expect(read).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1", status: "PENDING_READ" }, data: expect.objectContaining({ status: "READ", readerName: "fake" }) }),
    );
  });

  it("reader ລົ້ມ ແລະ ບໍ່ມີໂອກາດ retry (attempts: 1) → job ລົ້ມ ແລະ ສະລິບເປັນ READ_FAILED", async () => {
    read.mockRejectedValue(new Error("model down"));
    const job = await queue.add(SLIP_JOB_READ, { slipId: "s1" }, { attempts: 1, removeOnFail: false });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow("model down");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1", status: "PENDING_READ" }, data: { status: "READ_FAILED" } }),
    );
  });

  it("job ທີ່ data ຜິດ (ບໍ່ມີ slipId) → ລົ້ມ ໂດຍບໍ່ແຕະ DB", async () => {
    const job = await queue.add(SLIP_JOB_READ, {} as never, { attempts: 1, removeOnFail: false });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow("slipId");
    expect(paymentSlip.findUnique).not.toHaveBeenCalled();
  });

  it("job ຊື່ທີ່ບໍ່ຮູ້ຈັກ → ລົ້ມ", async () => {
    const job = await queue.add("nope", { slipId: "s1" }, { attempts: 1, removeOnFail: false });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow("Unknown job");
  });
});
```

ໝາຍເຫດ: stub `findUnique` ໃນ `beforeEach` ຄືນ `slipRow` ທັງສອງ shape (processor ໃຊ້ `select`; evaluate ໃຊ້ `include`) ເພາະ `slipRow` ມີທຸກ field ທີ່ທັງສອງຕ້ອງການ. ຖ້າ `evaluateSlip` ໃຊ້ method ອື່ນຂອງ prisma ທີ່ stub ບໍ່ມີ (ເຊັ່ນ `$transaction`) ໃຫ້ເພີ່ມໃນ stub; ຢ່າ mock `evaluateSlip` ເອງ.

- [ ] **Step 2:** `pnpm --filter @oca/worker test -- slip.worker` → **FAIL** (`SLIP_READER` ບໍ່ມີ export).

- [ ] **Step 3: implement** — `apps/worker/src/processors/slip.worker.ts`:

```ts
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { SlipReader, StorageService } from "@oca/ai-engine";
import { type PrismaClient, SLIP_JOB_READ, SLIP_QUEUE_NAME, type SlipReadJobData } from "@oca/database";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { PRISMA } from "../prisma/prisma.module";
import { REDIS } from "../redis/redis.module";
import { defaultMarkFailed, defaultStore, processReadSlip } from "./read-slip.processor";

export const SLIP_STORAGE = Symbol("SLIP_STORAGE");
export const SLIP_READER = Symbol("SLIP_READER");

/** reader ອາດໜັກ (GPU ໃນຂັ້ນ 2): ອ່ານພ້ອມກັນໄດ້ນ້ອຍ */
const SLIP_CONCURRENCY = 2;

@Injectable()
export class SlipWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlipWorker.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(SLIP_STORAGE) private readonly storage: StorageService,
    @Inject(SLIP_READER) private readonly reader: SlipReader,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(SLIP_QUEUE_NAME, (job) => this.process(job), {
      connection: this.redis,
      prefix: this.env.QUEUE_PREFIX,
      concurrency: SLIP_CONCURRENCY,
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
    if (job.name !== SLIP_JOB_READ) throw new Error(`Unknown job: ${job.name}`);
    const { slipId } = job.data as Partial<SlipReadJobData>;
    if (typeof slipId !== "string" || slipId === "") throw new Error("Job data must include slipId");
    const outcome = await processReadSlip(
      { db: this.prisma, storage: this.storage, reader: this.reader, store: defaultStore, markFailed: defaultMarkFailed },
      { slipId, attemptsMade: job.attemptsMade, attempts: job.opts.attempts },
    );
    if (outcome !== "read") this.logger.warn(`Slip ${slipId}: ${outcome}`);
    return outcome;
  }
}
```

- [ ] **Step 4: wiring** — `apps/worker/src/worker.module.ts` ຂຽນທັບ:

```ts
import { Module } from "@nestjs/common";
import { LocalDiskStorage, createSlipReader } from "@oca/ai-engine";
import { AppConfigModule } from "./config/config.module";
import { ENV, type Env } from "./config/env";
import { InventoryWorker } from "./processors/inventory.worker";
import { MaintenanceWorker } from "./processors/maintenance.worker";
import { SLIP_READER, SLIP_STORAGE, SlipWorker } from "./processors/slip.worker";
import { SystemWorker } from "./processors/system.worker";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [AppConfigModule, RedisModule, PrismaModule],
  providers: [
    SystemWorker,
    MaintenanceWorker,
    InventoryWorker,
    SlipWorker,
    { provide: SLIP_STORAGE, inject: [ENV], useFactory: (env: Env) => new LocalDiskStorage(env.SLIP_STORAGE_DIR) },
    {
      provide: SLIP_READER,
      inject: [ENV],
      useFactory: (env: Env) => createSlipReader({ SLIP_READER: env.SLIP_READER, SLIP_FAKE_RESULT: env.SLIP_FAKE_RESULT }),
    },
  ],
})
export class WorkerModule {}
```

(ຖ້າ import ເດີມຂອງໄຟລ໌ເປັນລຳດັບອື່ນ ໃຫ້ຮັກສາ style ເດີມ; ສິ່ງສຳຄັນຄື providers.)

- [ ] **Step 5:** `pnpm --filter @oca/worker test` ທັງໝົດ (ລວມ test ເກົ່າ `inventory/maintenance/system.worker.test.ts` ທີ່ຕອນນີ້ຈະ boot `SlipWorker` ນຳ — ຕ້ອງຍັງຜ່ານ) → PASS; `pnpm --filter @oca/worker lint && pnpm --filter @oca/worker build`. ຖ້າ test ເກົ່າລົ້ມເພາະ `createSlipReader`/storage ສ້າງຕອນ boot ໃຫ້ກວດ env default (ບໍ່ຄວນ throw).

- [ ] **Step 6: commit** — `git add apps/worker && git commit -m "feat(worker): slip reading worker on the slips queue"`.

---

### Task 4: smoke ແຕ່ຕົ້ນຮອດທ້າຍ (ກັບ DB/Redis ແຍກ, ບໍ່ແຕະຂອງຜູ້ໃຊ້)

ເປົ້າໝາຍ: ພິສູດວ່າ API → ຄິວ → worker → DB ເຮັດວຽກຈິງ ກ່ອນເຮັດ UI. **ຫ້າມ** ໃຊ້ DB `oca` ຫຼື Redis 6379 ຂອງຜູ້ໃຊ້ ແລະ ຫ້າມ kill process dev ຂອງຜູ້ໃຊ້ (:3000/:3001/:3002/:3100).

- [ ] **Step 1:** ອ່ານ `docs/DEPLOYMENT-NOTES.md` + memory `dev-database-isolation` ເພື່ອດູວິທີທີ່ເຄີຍສ້າງ DB ແຍກ (`oca_smoke`) + API ພອດ 3012 + worker ແຍກ ໃນ copy ແຍກຂອງ repo (ເຄີຍເຮັດໃນ smoke ຂອງ 1a/2a). ສ້າງ DB ແຍກ `oca_slip_smoke`, ໃຊ້ prefix ຄິວ `oca-slip-smoke` ແລະ `SLIP_STORAGE_DIR` ໃນ scratchpad, `PORT=3013`.

- [ ] **Step 2:** `db:deploy` ໃສ່ DB ແຍກ; seed OWNER; ແລ່ນ API (PORT=3013, `SLIP_READER=fake`, `SLIP_FAKE_RESULT='{"amount":"100000","currency":"LAK","refNo":"SMOKE1"}'`) ແລະ worker (env ດຽວກັນ).

- [ ] **Step 3:** ດ້ວຍ curl: login → ສ້າງບິນ (total 100000) → `POST /orders/:id/slips` ຮູບ PNG ນ້ອຍ → ລໍ ≤ 5 ວິ → `GET /slips/:id` ຕ້ອງ `status: READ`, `read.amount: "100000.00"`, `flags: []` → `POST /slips/:id/confirm` → `GET /orders/:id` ຕ້ອງ `PAID`. ທົດສອບເພີ່ມ: ອັບໂຫຼດຮູບດຽວກັນອີກຄັ້ງ → ສະລິບທີ 2 ຕ້ອງມີ flag `DUPLICATE_IMAGE` ແລະ `DUPLICATE_REF`; ຢຸດ worker ແລ້ວອັບໂຫຼດ → ສະລິບຄ້າງ `PENDING_READ`, ເປີດ worker ຄືນ → ກາຍເປັນ `READ` ເອງ (ຫຼື `retry`); ຕັ້ງ `SLIP_READER` ເປັນຄ່າຜິດ → worker ຕ້ອງ fail ຕອນ boot ດ້ວຍຂໍ້ຄວາມ `Unknown SLIP_READER`.

- [ ] **Step 4:** ຢຸດ process ທີ່ເຮົາເປີດເທົ່ານັ້ນ, ລຶບ DB `oca_slip_smoke` + ໂຟເດີຊົ່ວຄາວ. ລາຍງານຜົນແຕ່ລະຂັ້ນ (ຜ່ານ/ບໍ່ຜ່ານ + ຫຼັກຖານ) ແລະ bug ທີ່ພົບ (ແກ້ດ້ວຍ test ແດງກ່ອນ). ບໍ່ commit ຫຍັງ ເວັ້ນແຕ່ແກ້ bug.

---

## Self-review (ເຮັດແລ້ວ)
- Spec §3 ຂັ້ນ Read (worker, retry ຈຳກັດ, READ_FAILED) → Task 1-3; §6 `createSlipReader` env → Task 2-3; §10 ບໍ່ log ເນື້ອຮູບ/raw (ບໍ່ມີ log ຂອງ raw) ✓.
- ຊື່ສອດຄ່ອງກັບ S1/S2: `evaluateSlip`, `SLIP_QUEUE_NAME`, `SLIP_JOB_READ`, `SLIP_READ_JOB_OPTIONS`, `SlipReadJobData`, `createSlipReader`, `LocalDiskStorage`, `StorageNotFoundError`.
- ບໍ່ມີ placeholder. ຂໍ້ຈຳກັດ: ບໍ່ມີ reader ຈິງ (ຂັ້ນ 2); concurrency 2 ເປັນຄ່າຄົງທີ່.
