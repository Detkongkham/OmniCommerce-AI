# CF Engine 4a-1 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ຮັບຄອມເມັ້ນ CF ຈາກ Facebook webhook, ແປງເປັນບິນ (ຈອງສະຕ໋ອກ, merge ບິນ PENDING ຂອງລູກຄ້າດຽວກັນ), ບັນທຶກ ledger, ສົ່ງສະຫຼຸບທາງ Private Reply, ແລະ ມີ API ຈັດການ session/ລະຫັດ/ledger.

**Architecture:** webhook `/webhooks/facebook` (ເດີມ) ກວດ signature ແລ້ວ parse ເຫດການຄອມເມັ້ນ, ກອງຕາມ session ທີ່ LIVE, ໂຍນເຂົ້າ BullMQ queue `cf-comments`; consumer ໃນ API ປະມວນຜົນໃນ transaction ດຽວ (advisory lock ຕໍ່ session) ໂດຍໃຊ້ `OrdersService` ເດີມ (ເພີ່ມ `createCfOrderInTx` + `appendItemsInTx`), ແລ້ວສົ່ງຂໍ້ຄວາມຫຼັງ commit ແຍກຕ່າງຫາກ (ສົ່ງລົ້ມ = ບິນຍັງຢູ່, resend ໄດ້). Spec: `docs/superpowers/specs/2026-10-07-phase1-c-cf-engine-design.md`.

**Tech Stack:** NestJS 11, Prisma (Postgres), BullMQ + ioredis, Zod 4, Vitest + supertest, `@oca/channels` (FacebookAdapter + simulator), `@oca/shared`.

## ການປ່ຽນຈາກ spec (ຕັດສິນໃນ plan ນີ້ ຫຼັງອ່ານໂຄດ)

1. **ສິດ:** ໃຊ້ `live-cf:read` / `live-cf:write` (module `live-cf` ມີໃນ `MODULES` ແລະ role seed ແລ້ວ: OWNER, MANAGER, CHAT_ADMIN) ບໍ່ແມ່ນ `live:*`. ບໍ່ຕ້ອງແກ້ role seed.
2. **Lock:** Postgres advisory lock ຕໍ່ session (`pg_advisory_xact_lock`) ແທນ Redis lock ຕໍ່ຜູ້ຄອມເມັ້ນ, ເພາະ `limit` ຕໍ່ລະຫັດຕ້ອງ atomic ຂ້າມລູກຄ້າຫຼາຍຄົນ. ຄອມເມັ້ນໃນ session ດຽວກັນຖືກ serialize.
3. **limit:** ນັບດ້ວຍຖັນ `LiveSessionItem.claimed` (increment ໃນ transaction ດຽວກັນ) ບໍ່ແມ່ນການ sum ຈາກ ledger JSON.
4. **ຊ່ອງທາງສົ່ງ:** ໃຊ້ Private Reply ຢ່າງດຽວ (ທຸກຄອມເມັ້ນມີສິດ 1 ຄັ້ງ). ເສັ້ນທາງ `sendText` ເມື່ອເຄສໃນໜ້າຕ່າງ 24 ຊມ ຖືກເລື່ອນ (ບໍ່ເສຍໜ້າທີ່; ເພີ່ມພາຍຫຼັງໄດ້).
5. **`ChannelsModule`:** ໃໝ່ (ຫໍ່ `ChannelRegistry` ທີ່ຍັງຢູ່ໄຟລ໌ເດີມ) ເພື່ອໃຫ້ `InboxModule` ແລະ `LiveCfModule` ໃຊ້ຮ່ວມກັນໂດຍບໍ່ມີ circular import.
6. **ຄ່າ env ໃໝ່:** `QUEUE_PREFIX` ໃນ API (ເທົ່າກັບ worker; default `oca`). test ຕັ້ງ prefix ສະເພາະຮອບເພື່ອບໍ່ໃຫ້ API dev ຂອງຜູ້ໃຊ້ມາຍາດ job ຂອງ test.

## File map

**ສ້າງໃໝ່**
- `packages/shared/src/cf-parser.ts` (+ `.test.ts`): `normalizeCfText`, `parseCf`.
- `packages/shared/src/schemas/live-cf.ts` (+ `.test.ts`): ຄ່າຄົງທີ່, zod schemas ຂອງ session/item/ledger.
- `packages/database/prisma/migrations/20261007000000_cf_engine/migration.sql`
- `apps/api/test/cf-migration.test.ts`
- `apps/api/src/modules/channels/channels.module.ts`: export `ChannelRegistry`.
- `apps/api/src/modules/live-cf/live-cf.mapper.ts`: DTO + include.
- `apps/api/src/modules/live-cf/live-sessions.service.ts` / `live-sessions.controller.ts`
- `apps/api/src/modules/live-cf/cf-summary.ts` (+ `.test.ts`): ຂໍ້ຄວາມລາວ (ບໍລິສຸດ).
- `apps/api/src/modules/live-cf/cf-reply.service.ts`: ສົ່ງ/ສົ່ງໃໝ່ Private Reply + ຕອບຄອມເມັ້ນ.
- `apps/api/src/modules/live-cf/cf-processor.service.ts`: logic ປະມວນຜົນຄອມເມັ້ນ.
- `apps/api/src/modules/live-cf/cf-queue.service.ts`: BullMQ queue + worker ໃນ API.
- `apps/api/src/modules/live-cf/cf-ingest.service.ts`: ກອງ + enqueue ຈາກ webhook.
- `apps/api/src/modules/live-cf/cf-comments.controller.ts`: ledger + resend.
- tests: `apps/api/test/orders-append.e2e.test.ts`, `live-sessions.e2e.test.ts`, `cf-engine.e2e.test.ts`.

**ແກ້**
- `packages/shared/src/index.ts`, `error-codes.ts` (+ test ຖ້າມີ count)
- `apps/api/src/common/api-error.ts`, `apps/api/src/config/env.ts`
- `apps/admin/src/lib/i18n/dictionary.ts` (ຂໍ້ຄວາມ error ໃໝ່, ບັງຄັບດ້ວຍ test ຂອງ admin)
- `packages/database/prisma/schema.prisma`
- `packages/channels/src/types.ts`, `index.ts`, `facebook/parse.ts`, `facebook/adapter.ts`, `simulator/payloads.ts`, `simulator/fake-graph.ts`, `simulator/cli.ts`
- `apps/api/src/modules/orders/orders.service.ts`
- `apps/api/src/modules/inbox/inbox.module.ts`, `facebook-webhook.controller.ts`
- `apps/api/src/modules/live-cf/live-cf.module.ts`
- `apps/api/test/helpers.ts`, `apps/api/test/setup.ts`
- `docs/DEPLOYMENT-NOTES.md`, `docs/ROADMAP.md`

## ຂໍ້ກຳນົດທົ່ວໄປ (ທຸກ task)

- ຂຽນ test ກ່ອນ ແລະ **ຕ້ອງເຫັນ RED** (ລາຍງານຂໍ້ຄວາມ fail) ກ່ອນຂຽນ implementation.
- ຫຼັງແກ້ `@oca/shared` / `@oca/database` / `@oca/channels` ຕ້ອງ `pnpm --filter <pkg> build` ກ່ອນ test ຂອງ api.
- ຢ່າແຕະ Postgres 5432 ຫຼື Redis 6379 ຂອງຜູ້ໃຊ້, ຢ່າ kill process ທີ່ແລ່ນຢູ່ (:3000, :3001, :3002, :3100). test api ໃຊ້ DB `oca_test` ຜ່ານ `global-setup` ເທົ່ານັ້ນ. ຢ່າແລ່ນ `prisma migrate dev` ໃສ່ DB dev.
- ຄຳອະທິບາຍໃນໂຄດ/commit ເປັນພາສາລາວ ຄືກັບໂຄດເດີມ; ຊື່ identifier ເປັນອັງກິດ.
- ແຕ່ລະ commit ຕ້ອງລົງທ້າຍ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` ແລະ `git add` ສະເພາະໄຟລ໌ຂອງ task (working tree ມີການແກ້ໄຂຂອງຜູ້ໃຊ້ທີ່ຍັງບໍ່ commit: ຫ້າມ `git add -A`).

---

### Task 1: Shared: parser, schemas, error codes (+ admin i18n)

**Files:**
- Create: `packages/shared/src/cf-parser.ts`, `packages/shared/src/cf-parser.test.ts`, `packages/shared/src/schemas/live-cf.ts`, `packages/shared/src/schemas/live-cf.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/error-codes.ts`, `apps/api/src/common/api-error.ts`, `apps/admin/src/lib/i18n/dictionary.ts` (ແຖວ ~158 ແລະ ~809)

- [ ] **Step 1: test ຂອງ parser (RED)** ສ້າງ `packages/shared/src/cf-parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeCfText, parseCf } from "./cf-parser";

describe("normalizeCfText", () => {
  it("ຕົວໃຫຍ່, ຍຸບຊ່ອງວ່າງ, ເລກລາວ → ASCII, full-width → ASCII", () => {
    expect(normalizeCfText("  a1  ")).toBe("A1");
    expect(normalizeCfText("ດຳ   m")).toBe(normalizeCfText("ດຳ M"));
    expect(normalizeCfText("A໑໒")).toBe("A12");
    expect(normalizeCfText("Ａ１")).toBe("A1");
  });
});

describe("parseCf", () => {
  const codes = ["A1", "B02", "ດຳ M"];
  const one = (code: string, quantity = 1) => [{ code: normalizeCfText(code), quantity }];

  it("ລະຫັດດ່ຽວ (ບໍ່ສົນຕົວໃຫຍ່-ນ້ອຍ), ຈຳນວນຕົກລົງ 1", () => {
    expect(parseCf("A1", codes)).toEqual(one("A1"));
    expect(parseCf("a1", codes)).toEqual(one("A1"));
    expect(parseCf("  b02 ", codes)).toEqual(one("B02"));
  });

  it("ມີ CF ນຳໜ້າ", () => {
    expect(parseCf("CF A1", codes)).toEqual(one("A1"));
    expect(parseCf("cf a1 2", codes)).toEqual(one("A1", 2));
    expect(parseCf("CF:A1", codes)).toEqual(one("A1"));
  });

  it("ຈຳນວນ: ຊ່ອງວ່າງ, x, ×, *", () => {
    expect(parseCf("A1 2", codes)).toEqual(one("A1", 2));
    expect(parseCf("A1 x2", codes)).toEqual(one("A1", 2));
    expect(parseCf("A1×2", codes)).toEqual(one("A1", 2));
    expect(parseCf("A1*3", codes)).toEqual(one("A1", 3));
    expect(parseCf("B02 2", codes)).toEqual(one("B02", 2));
  });

  it("ລະຫັດມີຊ່ອງວ່າງ (ດຳ M) ແລະ ເລກລາວ", () => {
    expect(parseCf("ດຳ M 1", codes)).toEqual(one("ດຳ M"));
    expect(parseCf("ດຳ  m", codes)).toEqual(one("ດຳ M"));
    expect(parseCf("A1 ໒", codes)).toEqual(one("A1", 2));
  });

  it("ຫຼາຍລະຫັດ ແລະ ລະຫັດຊ້ຳລວມຈຳນວນ", () => {
    expect(parseCf("A1 B02 2", codes)).toEqual([...one("A1"), ...one("B02", 2)]);
    expect(parseCf("A1 2 B02", codes)).toEqual([...one("A1", 2), ...one("B02")]);
    expect(parseCf("A1, B02", codes)).toEqual([...one("A1"), ...one("B02")]);
    expect(parseCf("A1 A1", codes)).toEqual(one("A1", 2));
  });

  it("full-width", () => {
    expect(parseCf("Ａ１ ２", codes)).toEqual(one("A1", 2));
  });

  it("ລະຫັດຍາວກ່ອນ: ມີທັງ A ແລະ A1", () => {
    expect(parseCf("A1", ["A", "A1"])).toEqual(one("A1"));
    expect(parseCf("A", ["A", "A1"])).toEqual(one("A"));
  });

  it("ລະຫັດທີ່ຂຶ້ນຕົ້ນດ້ວຍ CF ບໍ່ຖືກຕັດ", () => {
    expect(parseCf("CF1", ["CF1"])).toEqual(one("CF1"));
  });

  it("ບໍ່ແມ່ນ CF → null", () => {
    expect(parseCf("A1 ລາຄາເທົ່າໃດ", codes)).toBeNull();
    expect(parseCf("ສະບາຍດີ", codes)).toBeNull();
    expect(parseCf("A12", codes)).toBeNull();
    expect(parseCf("Z9", codes)).toBeNull();
    expect(parseCf("", codes)).toBeNull();
    expect(parseCf("   ", codes)).toBeNull();
    expect(parseCf("CF", codes)).toBeNull();
    expect(parseCf("A1", [])).toBeNull();
  });

  it("ຈຳນວນນອກຊ່ວງ 1..99 → null", () => {
    expect(parseCf("A1 0", codes)).toBeNull();
    expect(parseCf("A1 100", codes)).toBeNull();
    expect(parseCf("A1 99", codes)).toEqual(one("A1", 99));
    expect(parseCf("A1 99 A1", codes)).toBeNull();
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/shared test cf-parser` → ຄາດ FAIL (ບໍ່ພົບ `./cf-parser`).

- [ ] **Step 3: implementation** ສ້າງ `packages/shared/src/cf-parser.ts`:

```ts
export interface CfLine {
  /** ລະຫັດທີ່ normalize ແລ້ວ (ຕົງກັບ LiveSessionItem.code) */
  code: string;
  quantity: number;
}

const LAO_DIGIT_ZERO = 0x0ed0;
const MAX_QUANTITY = 99;
const SEPARATOR = /[\s,;+]/;
const QUANTITY = /^\s*[X×*]?\s*(\d{1,2})(?!\d)/;
const MULTIPLY_THEN_DIGIT = /^[X×*]\d/;
const CF_PREFIX = /^CF(?=[\s:,-])[\s:,-]*/;

/** ຕົວອັກສອນໃຫຍ່, NFKC (full-width → ASCII), ເລກລາວ → ASCII, ຍຸບຊ່ອງວ່າງ. ໃຊ້ທັງຕອນບັນທຶກລະຫັດ ແລະ ຕອນ parse ຄອມເມັ້ນ. */
export function normalizeCfText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[໐-໙]/g, (digit) => String(digit.charCodeAt(0) - LAO_DIGIT_ZERO))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isCodeAt(text: string, position: number, code: string): boolean {
  if (code.length === 0 || !text.startsWith(code, position)) return false;
  const next = text[position + code.length];
  if (next === undefined || SEPARATOR.test(next)) return true;
  // "A1x2" / "A1*2": ຕົວຄູນຕ້ອງຕາມດ້ວຍເລກ
  return MULTIPLY_THEN_DIGIT.test(text.slice(position + code.length));
}

function parseTokens(text: string, sortedCodes: readonly string[]): CfLine[] | null {
  const totals = new Map<string, number>();
  let position = 0;
  for (;;) {
    while (position < text.length && SEPARATOR.test(text.charAt(position))) position += 1;
    if (position >= text.length) break;
    const code = sortedCodes.find((candidate) => isCodeAt(text, position, candidate));
    if (code === undefined) return null;
    position += code.length;
    let quantity = 1;
    const match = QUANTITY.exec(text.slice(position));
    if (match?.[1] !== undefined) {
      quantity = Number(match[1]);
      position += match[0].length;
    }
    if (quantity < 1) return null;
    const total = (totals.get(code) ?? 0) + quantity;
    if (total > MAX_QUANTITY) return null;
    totals.set(code, total);
  }
  return totals.size > 0 ? [...totals].map(([code, quantity]) => ({ code, quantity })) : null;
}

/**
 * ແປງຂໍ້ຄວາມຄອມເມັ້ນເປັນລາຍການ CF ຕາມລະຫັດຂອງ session. ຄອມເມັ້ນຕ້ອງເປັນ CF ທັງຂໍ້ຄວາມ
 * (ມີ "CF" ນຳໜ້າໄດ້); ມີຄຳອື່ນປົນ ຫຼື ຈຳນວນນອກ 1..99 = null (ບໍ່ຈອງ ເພື່ອບໍ່ໃຫ້ຈອງຜິດ).
 */
export function parseCf(message: string, codes: readonly string[]): CfLine[] | null {
  const text = normalizeCfText(message);
  const sorted = codes
    .map(normalizeCfText)
    .filter((code) => code.length > 0)
    .sort((a, b) => b.length - a.length);
  if (text.length === 0 || sorted.length === 0) return null;
  const prefix = CF_PREFIX.exec(text);
  if (prefix) {
    const stripped = parseTokens(text.slice(prefix[0].length), sorted);
    if (stripped) return stripped;
  }
  return parseTokens(text, sorted);
}
```

- [ ] **Step 4:** `pnpm --filter @oca/shared test cf-parser` → ຄາດ PASS ທັງໝົດ. ຖ້າ case ໃດຕົກ ໃຫ້ແກ້ implementation (ບໍ່ແກ້ test ເພື່ອໃຫ້ຜ່ານ ເວັ້ນແຕ່ test ຜິດຈິງ ແລະ ບອກເຫດຜົນ).

- [ ] **Step 5: error codes.** ໃນ `packages/shared/src/error-codes.ts` ເພີ່ມທ້າຍ array ຕໍ່ຈາກ `"CHANNEL_NOT_CONFIGURED",`:

```ts
  // live / CF
  "LIVE_SESSION_NOT_FOUND",
  "LIVE_ITEM_NOT_FOUND",
  "CF_COMMENT_NOT_FOUND",
  "LIVE_SESSION_INVALID_STATE",
  "LIVE_ITEM_IN_USE",
```
ໃນ `apps/api/src/common/api-error.ts` ເພີ່ມໃນ `STATUS_BY_CODE` ຕໍ່ຈາກ `CHANNEL_NOT_CONFIGURED`:

```ts
  LIVE_SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  LIVE_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  CF_COMMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  LIVE_SESSION_INVALID_STATE: HttpStatus.CONFLICT,
  LIVE_ITEM_IN_USE: HttpStatus.CONFLICT,
```
ໃນ `apps/admin/src/lib/i18n/dictionary.ts` ຕໍ່ຈາກແຖວ `"error.CHANNEL_NOT_CONFIGURED": "ຊ່ອງທາງນີ້ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ",` (lo) ເພີ່ມ:

```ts
  "error.LIVE_SESSION_NOT_FOUND": "ບໍ່ພົບ Live/ໂພສນີ້",
  "error.LIVE_ITEM_NOT_FOUND": "ບໍ່ພົບລະຫັດ CF ນີ້",
  "error.CF_COMMENT_NOT_FOUND": "ບໍ່ພົບຄອມເມັ້ນນີ້",
  "error.LIVE_SESSION_INVALID_STATE": "ສະຖານະຂອງ Live/ໂພສບໍ່ອະນຸຍາດໃຫ້ເຮັດແບບນີ້",
  "error.LIVE_ITEM_IN_USE": "ລະຫັດນີ້ມີຄົນ CF ແລ້ວ ແກ້/ລຶບບໍ່ໄດ້",
```
ແລະຕໍ່ຈາກ `"error.CHANNEL_NOT_CONFIGURED": "This channel is not configured",` (en):

```ts
  "error.LIVE_SESSION_NOT_FOUND": "This live/post session was not found",
  "error.LIVE_ITEM_NOT_FOUND": "This CF code was not found",
  "error.CF_COMMENT_NOT_FOUND": "This comment was not found",
  "error.LIVE_SESSION_INVALID_STATE": "The session state does not allow this action",
  "error.LIVE_ITEM_IN_USE": "This code already has CF orders and cannot be changed or removed",
```

- [ ] **Step 6: schemas test (RED)** ສ້າງ `packages/shared/src/schemas/live-cf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cfCommentListQuerySchema,
  createLiveItemSchema,
  createLiveSessionSchema,
  liveSessionListQuerySchema,
  updateLiveItemSchema,
  updateLiveSessionSchema,
} from "./live-cf";

describe("live-cf schemas", () => {
  it("createLiveSession: default publicReplyEnabled=true, externalPostId ບໍ່ບັງຄັບ", () => {
    const parsed = createLiveSessionSchema.parse({ title: " Live ຄືນນີ້ ", kind: "LIVE" });
    expect(parsed).toEqual({ title: "Live ຄືນນີ້", kind: "LIVE", publicReplyEnabled: true });
  });
  it("createLiveSession: kind ຜິດ / ຊື່ວ່າງ / externalPostId ມີຕົວອັກສອນແປກ → ຜິດ", () => {
    expect(createLiveSessionSchema.safeParse({ title: "x", kind: "VIDEO" }).success).toBe(false);
    expect(createLiveSessionSchema.safeParse({ title: " ", kind: "LIVE" }).success).toBe(false);
    expect(createLiveSessionSchema.safeParse({ title: "x", kind: "LIVE", externalPostId: "a b/c" }).success).toBe(false);
    expect(createLiveSessionSchema.safeParse({ title: "x", kind: "LIVE", externalPostId: "123_456" }).success).toBe(true);
  });
  it("updateLiveSession: ຕ້ອງມີຢ່າງໜ້ອຍ 1 field, externalPostId ເປັນ null ໄດ້", () => {
    expect(updateLiveSessionSchema.safeParse({}).success).toBe(false);
    expect(updateLiveSessionSchema.parse({ externalPostId: null })).toEqual({ externalPostId: null });
  });
  it("createLiveItem: normalize ລະຫັດ, limit 1..100000 ຫຼື null", () => {
    expect(createLiveItemSchema.parse({ code: " ດຳ  m ", variantId: "v1" }).code).toBe("ດຳ M");
    expect(createLiveItemSchema.parse({ code: "a1", variantId: "v1", limit: null }).limit).toBeNull();
    expect(createLiveItemSchema.safeParse({ code: "A1", variantId: "v1", limit: 0 }).success).toBe(false);
    expect(createLiveItemSchema.safeParse({ code: "   ", variantId: "v1" }).success).toBe(false);
    expect(createLiveItemSchema.safeParse({ code: "X".repeat(31), variantId: "v1" }).success).toBe(false);
  });
  it("updateLiveItem: ຕ້ອງມີຢ່າງໜ້ອຍ 1 field", () => {
    expect(updateLiveItemSchema.safeParse({}).success).toBe(false);
    expect(updateLiveItemSchema.parse({ limit: 5 })).toEqual({ limit: 5 });
  });
  it("query: default page/pageSize ແລະ coerce", () => {
    expect(liveSessionListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 30 });
    expect(cfCommentListQuerySchema.parse({ outcome: "ORDERED", page: "2" })).toEqual({ page: 2, pageSize: 50, outcome: "ORDERED" });
    expect(cfCommentListQuerySchema.safeParse({ outcome: "NOPE" }).success).toBe(false);
  });
});
```

- [ ] **Step 7:** `pnpm --filter @oca/shared test live-cf` → ຄາດ FAIL (ບໍ່ພົບ `./live-cf`).

- [ ] **Step 8: schemas implementation** ສ້າງ `packages/shared/src/schemas/live-cf.ts`:

```ts
import { z } from "zod";
import { normalizeCfText } from "../cf-parser";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const LIVE_SESSION_KINDS = ["LIVE", "POST"] as const;
export const LIVE_SESSION_STATUSES = ["DRAFT", "LIVE", "ENDED"] as const;
export const CF_OUTCOMES = ["ORDERED", "NO_MATCH", "OUT_OF_STOCK", "LIMIT_REACHED", "ERROR"] as const;
export const CF_REPLY_STATUSES = ["NONE", "SENT", "FAILED"] as const;

export type LiveSessionKind = (typeof LIVE_SESSION_KINDS)[number];
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];
export type CfOutcome = (typeof CF_OUTCOMES)[number];
export type CfReplyStatus = (typeof CF_REPLY_STATUSES)[number];

// ---------------------------------------------------------------------------
// body / query
// ---------------------------------------------------------------------------
const idSchema = z.string().min(1);
const titleSchema = z.string().trim().min(1).max(100);
/** id ຂອງໂພສ/ວິດີໂອ Facebook ຕາມທີ່ webhook ສົ່ງ (ເຊັ່ນ 123_456) */
const externalPostIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{1,200}$/, "id ຂອງໂພສຕ້ອງເປັນຕົວອັກສອນ/ເລກ/_/./- ເທົ່ານັ້ນ");
const limitSchema = z.number().int().min(1).max(100_000).nullable();

/** ລະຫັດ CF: normalize ກ່ອນເກັບ (ຕົວໃຫຍ່, ເລກ ASCII, ຍຸບຊ່ອງວ່າງ) ຍາວ 1..30 */
export const cfCodeSchema = z
  .string()
  .transform(normalizeCfText)
  .pipe(z.string().min(1).max(30));

const requireNonEmpty = (value: Record<string, unknown>) => Object.values(value).some((field) => field !== undefined);
const NON_EMPTY_MESSAGE = "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field";

export const createLiveSessionSchema = z.strictObject({
  title: titleSchema,
  kind: z.enum(LIVE_SESSION_KINDS),
  externalPostId: externalPostIdSchema.nullable().optional(),
  publicReplyEnabled: z.boolean().default(true),
});

export const updateLiveSessionSchema = z
  .strictObject({
    title: titleSchema.optional(),
    externalPostId: externalPostIdSchema.nullable().optional(),
    publicReplyEnabled: z.boolean().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export const createLiveItemSchema = z.strictObject({
  code: cfCodeSchema,
  variantId: idSchema,
  limit: limitSchema.optional(),
});

export const updateLiveItemSchema = z
  .strictObject({
    variantId: idSchema.optional(),
    limit: limitSchema.optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export const liveSessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(LIVE_SESSION_STATUSES).optional(),
});

export const cfCommentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  outcome: z.enum(CF_OUTCOMES).optional(),
});

export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>;
export type UpdateLiveSessionInput = z.infer<typeof updateLiveSessionSchema>;
export type CreateLiveItemInput = z.infer<typeof createLiveItemSchema>;
export type UpdateLiveItemInput = z.infer<typeof updateLiveItemSchema>;
export type LiveSessionListQuery = z.infer<typeof liveSessionListQuerySchema>;
export type CfCommentListQuery = z.infer<typeof cfCommentListQuerySchema>;
```
ໃນ `packages/shared/src/index.ts` ເພີ່ມທ້າຍ:

```ts
export * from "./cf-parser";
export * from "./schemas/live-cf";
```

- [ ] **Step 9:** `pnpm --filter @oca/shared test && pnpm --filter @oca/shared lint && pnpm --filter @oca/shared build` → PASS. ແລ້ວ `pnpm --filter @oca/admin test src/lib/errors.test.ts` (ກວດວ່າທຸກ code ມີຂໍ້ຄວາມ lo+en) ແລະ `pnpm --filter @oca/api exec tsc --noEmit -p tsconfig.json` (STATUS_BY_CODE ຄົບ) → PASS.

- [ ] **Step 10: commit**

```bash
git add packages/shared/src/cf-parser.ts packages/shared/src/cf-parser.test.ts packages/shared/src/schemas/live-cf.ts packages/shared/src/schemas/live-cf.test.ts packages/shared/src/index.ts packages/shared/src/error-codes.ts apps/api/src/common/api-error.ts apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(shared): CF parser, live session schemas and error codes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(ຖ້າ `error-codes.test.ts` ມີການນັບ ຕ້ອງແກ້ ແລະ `git add` ນຳ.)

---

### Task 2: Database: schema + migration + test helpers

**Files:**
- Modify: `packages/database/prisma/schema.prisma`, `apps/api/test/helpers.ts`
- Create: `packages/database/prisma/migrations/20261007000000_cf_engine/migration.sql`, `apps/api/test/cf-migration.test.ts`

- [ ] **Step 1: schema.** ໃນ `schema.prisma`:

(a) ເພີ່ມ enum (ຖັດຈາກ enum Inbox ເດີມ):

```prisma
enum LiveSessionKind {
  LIVE
  POST
}

enum LiveSessionStatus {
  DRAFT
  LIVE
  ENDED
}

enum CfOutcome {
  ORDERED
  NO_MATCH
  OUT_OF_STOCK
  LIMIT_REACHED
  ERROR
}

enum CfReplyStatus {
  NONE
  SENT
  FAILED
}
```

(b) `model StoreSetting`: ເພີ່ມຖັນ ກ່ອນ `updatedAt`:
```prisma
  paymentInstructions String? // ຂໍ້ຄວາມຂໍ້ມູນໂອນເງິນ ໃສ່ໃນສະຫຼຸບບິນ CF
```
(c) `model Customer`: ເພີ່ມ `facebookUserId String? @unique` ແລະ `cfComments`? ບໍ່ຕ້ອງ. ເພີ່ມພຽງ:
```prisma
  facebookUserId String? @unique // ລະຫັດຜູ້ຄອມເມັ້ນ (CF Engine)
```
(d) `model Order`: ເພີ່ມ
```prisma
  liveSessionId  String?
  liveSession    LiveSession? @relation(fields: [liveSessionId], references: [id], onDelete: SetNull)
  cfComments     CfComment[]
```
ແລະ `@@index([liveSessionId, customerId, status])` ໃນ block index ຂອງ Order.
(e) `model User`: ເພີ່ມ `liveSessions LiveSession[]`. `model ProductVariant`: ເພີ່ມ `liveSessionItems LiveSessionItem[]`.
(f) ທ້າຍໄຟລ໌ ເພີ່ມ models:

```prisma
// ---------------------------------------------------------------------------
// Live & Post CF Engine (ໂມດູນ 4)
// ---------------------------------------------------------------------------

// 1 Live ຫຼື 1 ໂພສທີ່ເປີດຮັບ CF. externalPostId = post_id ທີ່ webhook feed ສົ່ງມາ.
// ຫ້າມ 2 session ສະຖານະ LIVE ໃຊ້ externalPostId ດຽວກັນ (partial unique index ໃນ migration)
model LiveSession {
  id                 String            @id @default(cuid())
  title              String
  kind               LiveSessionKind
  status             LiveSessionStatus @default(DRAFT)
  externalPostId     String?
  publicReplyEnabled Boolean           @default(true)
  startedAt          DateTime?
  endedAt            DateTime?
  createdById        String?
  createdBy          User?             @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  items    LiveSessionItem[]
  comments CfComment[]
  orders   Order[]

  @@index([status, externalPostId])
}

// ລະຫັດ CF → variant ຂອງ session. claimed = ຈຳນວນທີ່ CF ແລ້ວ (increment ໃນ transaction ຂອງຄອມເມັ້ນ)
model LiveSessionItem {
  id        String         @id @default(cuid())
  sessionId String
  session   LiveSession    @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  code      String // normalize ແລ້ວ (ຕົວໃຫຍ່, ເລກ ASCII)
  variantId String
  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  limit     Int?
  claimed   Int            @default(0)
  createdAt DateTime       @default(now())

  @@unique([sessionId, code])
  @@index([variantId])
}

// ledger ຂອງທຸກຄອມເມັ້ນທີ່ເຂົ້າ queue (ໃຊ້ກັນຊ້ຳ, ສະແດງໃນໜ້າ admin, ຂໍ້ມູນໜ້າ Host ໃນອະນາຄົດ)
model CfComment {
  id                String        @id @default(cuid())
  externalCommentId String        @unique
  sessionId         String
  session           LiveSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  authorExternalId  String
  authorName        String
  message           String
  outcome           CfOutcome
  lines             Json? // [{ itemId, code, quantity }]
  orderId           String?
  order             Order?        @relation(fields: [orderId], references: [id], onDelete: SetNull)
  replyStatus       CfReplyStatus @default(NONE)
  replyErrorCode    String? // ຄ່າຈາກ MESSAGE_SEND_ERRORS
  createdAt         DateTime      @default(now())

  @@index([sessionId, createdAt])
  @@index([sessionId, authorExternalId])
  @@index([orderId])
}
```

- [ ] **Step 2: migration** ສ້າງ `packages/database/prisma/migrations/20261007000000_cf_engine/migration.sql` (ຂຽນດ້ວຍມື ເພື່ອບໍ່ແຕະ DB dev):

```sql
-- CreateEnum
CREATE TYPE "LiveSessionKind" AS ENUM ('LIVE', 'POST');

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('DRAFT', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "CfOutcome" AS ENUM ('ORDERED', 'NO_MATCH', 'OUT_OF_STOCK', 'LIMIT_REACHED', 'ERROR');

-- CreateEnum
CREATE TYPE "CfReplyStatus" AS ENUM ('NONE', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "facebookUserId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "liveSessionId" TEXT;

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "paymentInstructions" TEXT;

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "LiveSessionKind" NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "externalPostId" TEXT,
    "publicReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "limit" INTEGER,
    "claimed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CfComment" (
    "id" TEXT NOT NULL,
    "externalCommentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorExternalId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "outcome" "CfOutcome" NOT NULL,
    "lines" JSONB,
    "orderId" TEXT,
    "replyStatus" "CfReplyStatus" NOT NULL DEFAULT 'NONE',
    "replyErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CfComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_facebookUserId_key" ON "Customer"("facebookUserId");

-- CreateIndex
CREATE INDEX "Order_liveSessionId_customerId_status_idx" ON "Order"("liveSessionId", "customerId", "status");

-- CreateIndex
CREATE INDEX "LiveSession_status_externalPostId_idx" ON "LiveSession"("status", "externalPostId");

-- CreateIndex
CREATE INDEX "LiveSessionItem_variantId_idx" ON "LiveSessionItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionItem_sessionId_code_key" ON "LiveSessionItem"("sessionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CfComment_externalCommentId_key" ON "CfComment"("externalCommentId");

-- CreateIndex
CREATE INDEX "CfComment_sessionId_createdAt_idx" ON "CfComment"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CfComment_sessionId_authorExternalId_idx" ON "CfComment"("sessionId", "authorExternalId");

-- CreateIndex
CREATE INDEX "CfComment_orderId_idx" ON "CfComment"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionItem" ADD CONSTRAINT "LiveSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionItem" ADD CONSTRAINT "LiveSessionItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CfComment" ADD CONSTRAINT "CfComment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CfComment" ADD CONSTRAINT "CfComment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ບໍ່ຢູ່ໃນ schema.prisma (Prisma ສະແດງ partial index ບໍ່ໄດ້): ຫ້າມ 2 session LIVE ໃຊ້ໂພສດຽວກັນ
CREATE UNIQUE INDEX "LiveSession_externalPostId_live_key" ON "LiveSession"("externalPostId") WHERE "status" = 'LIVE';

-- ດ່ານສຸດທ້າຍ: claimed ບໍ່ລົບ ແລະ ບໍ່ເກີນ limit
ALTER TABLE "LiveSessionItem" ADD CONSTRAINT "LiveSessionItem_claimed_check" CHECK ("claimed" >= 0 AND ("limit" IS NULL OR "claimed" <= "limit"));
```

- [ ] **Step 3:** `pnpm --filter @oca/database exec prisma generate` ແລ້ວ `pnpm --filter @oca/database build`. ກວດ drift ກັບ DB test (ບໍ່ແຕະ dev): ຫຼັງ Step 5 (migration ຖືກ apply ໃສ່ `oca_test` ຜ່ານ global-setup) ແລ່ນ
`DATABASE_URL=<url ຂອງ oca_test> pnpm --filter @oca/database exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (ໃຊ້ flag ຕາມ Prisma ທີ່ຕິດຕັ້ງ; ຖ້າ flag ບໍ່ຕົງ ເບິ່ງ `prisma migrate diff --help`). ຄາດ: ບໍ່ມີ diff ຍົກເວັ້ນ (ອາດ) ການ drop `LiveSession_externalPostId_live_key`. ຖ້າມີ diff ອື່ນ ໃຫ້ແກ້ migration ຈົນກົງ schema. ບັນທຶກຜົນໃນ commit message.

- [ ] **Step 4: helpers.** ໃນ `apps/api/test/helpers.ts`:
(a) `resetDb`: ໃນ string TRUNCATE ເພີ່ມ `"CfComment", "LiveSessionItem", "LiveSession", ` ຕໍ່ຈາກ `'"Message", "Conversation", ' +` (ເພີ່ມເປັນ `'"CfComment", "LiveSessionItem", "LiveSession", "Message", "Conversation", ' +`).
(b) ທ້າຍໄຟລ໌ເພີ່ມ:

```ts
/** Live/ໂພສສຳລັບ test. items = ລະຫັດ→variant (ລະຫັດຕ້ອງ normalize ແລ້ວ: ຕົວໃຫຍ່). */
export async function seedLiveSession(
  db: PrismaClient,
  overrides: Partial<{
    title: string;
    kind: "LIVE" | "POST";
    status: "DRAFT" | "LIVE" | "ENDED";
    externalPostId: string | null;
    publicReplyEnabled: boolean;
    items: { code: string; variantId: string; limit?: number | null }[];
  }> = {},
) {
  return db.liveSession.create({
    data: {
      title: overrides.title ?? "Test Live",
      kind: overrides.kind ?? "LIVE",
      status: overrides.status ?? "LIVE",
      externalPostId: overrides.externalPostId === undefined ? "POST_1" : overrides.externalPostId,
      publicReplyEnabled: overrides.publicReplyEnabled ?? true,
      startedAt: (overrides.status ?? "LIVE") === "DRAFT" ? null : new Date(),
      items: {
        create: (overrides.items ?? []).map((item) => ({
          code: item.code,
          variantId: item.variantId,
          limit: item.limit ?? null,
        })),
      },
    },
    include: { items: true },
  });
}
```

- [ ] **Step 5: test (RED→GREEN)** ສ້າງ `apps/api/test/cf-migration.test.ts`:

```ts
import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedCatalog, seedLiveSession } from "./helpers";

describe("cf engine migration", () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
  });

  it("ລະຫັດຊ້ຳໃນ session ດຽວກັນບໍ່ໄດ້ ແຕ່ຕ່າງ session ໃຊ້ໄດ້", async () => {
    const f = await seedCatalog(db);
    const a = await seedLiveSession(db, { externalPostId: "P1", items: [{ code: "A1", variantId: f.v1.id }] });
    const b = await seedLiveSession(db, { status: "DRAFT", externalPostId: null });
    await expect(
      db.liveSessionItem.create({ data: { sessionId: a.id, code: "A1", variantId: f.v2.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
    await db.liveSessionItem.create({ data: { sessionId: b.id, code: "A1", variantId: f.v2.id } });
  });

  it("ຫ້າມ 2 session LIVE ໃຊ້ externalPostId ດຽວກັນ; DRAFT/ENDED ຊ້ຳໄດ້", async () => {
    await seedLiveSession(db, { status: "LIVE", externalPostId: "P1" });
    await expect(seedLiveSession(db, { status: "LIVE", externalPostId: "P1" })).rejects.toMatchObject({ code: "P2002" });
    await seedLiveSession(db, { status: "DRAFT", externalPostId: "P1" });
    await seedLiveSession(db, { status: "ENDED", externalPostId: "P1" });
    await seedLiveSession(db, { status: "LIVE", externalPostId: "P2" });
  });

  it("claimed ຕ້ອງບໍ່ລົບ ແລະ ບໍ່ເກີນ limit (CHECK)", async () => {
    const f = await seedCatalog(db);
    const s = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id, limit: 2 }] });
    const item = s.items[0];
    if (!item) throw new Error("item missing");
    await db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 2 } });
    await expect(db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 3 } })).rejects.toThrow();
    await expect(db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: -1 } })).rejects.toThrow();
  });

  it("externalCommentId ຊ້ຳບໍ່ໄດ້; ລຶບ session ລຶບ items+comments ແລະ ເຮັດໃຫ້ Order.liveSessionId ເປັນ NULL", async () => {
    const f = await seedCatalog(db);
    const s = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }] });
    const order = await db.order.create({
      data: {
        orderNumber: "SO-T1",
        channel: "FACEBOOK",
        source: "LIVE_CF",
        liveSessionId: s.id,
        currency: "LAK",
        subtotal: "0",
        vatRate: "10",
        vatAmount: "0",
        total: "0",
      },
    });
    const comment = (id: string) =>
      db.cfComment.create({
        data: { externalCommentId: id, sessionId: s.id, authorExternalId: "U1", authorName: "U", message: "A1", outcome: "ORDERED", orderId: order.id },
      });
    await comment("C1");
    await expect(comment("C1")).rejects.toMatchObject({ code: "P2002" });
    await db.liveSession.delete({ where: { id: s.id } });
    expect(await db.liveSessionItem.count()).toBe(0);
    expect(await db.cfComment.count()).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).liveSessionId).toBeNull();
  });

  it("Customer.facebookUserId unique (NULL ຫຼາຍແຖວໄດ້)", async () => {
    await db.customer.create({ data: { name: "A", facebookUserId: "U1" } });
    await expect(db.customer.create({ data: { name: "B", facebookUserId: "U1" } })).rejects.toMatchObject({ code: "P2002" });
    await db.customer.create({ data: { name: "C" } });
    await db.customer.create({ data: { name: "D" } });
  });
});
```
ຖ້າ `db.order.create` ຂາດ field ບັງຄັບ ໃຫ້ເບິ່ງ test `inbox-migration.test.ts` ທີ່ສ້າງ order ແລ້ວປັບຕາມ. ແລ່ນ `pnpm --filter @oca/api test cf-migration` (global-setup apply migration ໃສ່ `oca_test`) → ຄາດ PASS. (RED ຂອງ task ນີ້ = ກ່ອນມີ migration ຄາດ fail ຍ້ອນ table ບໍ່ມີ; ໃຫ້ແລ່ນ test ຫຼັງຂຽນ test ແຕ່ກ່ອນເພີ່ມ migration ເພື່ອເຫັນ RED ກ່ອນ ຖ້າເຮັດໄດ້.)

- [ ] **Step 6:** `pnpm --filter @oca/database test && pnpm --filter @oca/database lint && pnpm --filter @oca/api test` (ທັງໝົດ) → PASS (ເພື່ອໃຫ້ແນ່ໃຈວ່າ schema ໃໝ່ບໍ່ທຳລາຍ test ເດີມ).

- [ ] **Step 7: commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20261007000000_cf_engine apps/api/test/helpers.ts apps/api/test/cf-migration.test.ts
git commit -m "feat(database): live session, CF item and CF comment ledger tables

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Channels: ຄອມເມັ້ນ, Private Reply, simulator

**Files:**
- Modify: `packages/channels/src/types.ts`, `index.ts`, `facebook/parse.ts`, `facebook/adapter.ts`, `simulator/payloads.ts`, `simulator/fake-graph.ts`, ແລະ test ທີ່ມີຢູ່ (`facebook/parse.test.ts`, `facebook/adapter.test.ts`, `simulator/simulator.test.ts`)

- [ ] **Step 1: test parse (RED)** ເພີ່ມທ້າຍ `packages/channels/src/facebook/parse.test.ts` (ໃຊ້ import ເດີມຂອງໄຟລ໌; ເພີ່ມ `parseFacebookComments` ໃນ import):

```ts
describe("parseFacebookComments", () => {
  const change = (value: object, pageId = "PAGE1") => ({
    object: "page",
    entry: [{ id: pageId, time: 1_700_000_000, changes: [{ field: "feed", value }] }],
  });
  const base = {
    item: "comment",
    verb: "add",
    comment_id: "100_200",
    post_id: "100_300",
    from: { id: "U1", name: "ນາງ ກ" },
    message: "A1 2",
    created_time: 1_700_000_000,
  };

  it("ແປງຄອມເມັ້ນໃໝ່", () => {
    expect(parseFacebookComments(change(base))).toEqual([
      {
        channel: "FACEBOOK",
        postId: "100_300",
        commentId: "100_200",
        authorId: "U1",
        authorName: "ນາງ ກ",
        message: "A1 2",
        timestamp: new Date(1_700_000_000_000),
      },
    ]);
  });
  it("ຂ້າມ edited/remove, ປະເພດອື່ນ (reaction, post), ຄອມເມັ້ນຂອງ Page ເອງ, ຂໍ້ຄວາມວ່າງ, field ຂາດ", () => {
    expect(parseFacebookComments(change({ ...base, verb: "edited" }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, verb: "remove" }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, item: "reaction" }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, from: { id: "PAGE1", name: "Shop" } }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, message: "   " }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, comment_id: undefined }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, post_id: undefined }))).toEqual([]);
    expect(parseFacebookComments(change({ ...base, from: undefined }))).toEqual([]);
  });
  it("ບໍ່ມີ name → ຊື່ຊົ່ວຄາວ; message ຍາວເກີນຖືກຕັດ 1000 ຕົວ", () => {
    const [event] = parseFacebookComments(change({ ...base, from: { id: "U1234" }, message: "x".repeat(2000) }));
    expect(event?.authorName).toBe("Facebook 1234");
    expect(event?.message).toHaveLength(1000);
  });
  it("payload ຜິດຮູບແບບ → [] (ບໍ່ throw) ແລະ messaging ບໍ່ຖືກນັບເປັນຄອມເມັ້ນ", () => {
    for (const payload of [null, 1, "x", {}, { object: "user" }, { object: "page", entry: "x" }, { object: "page", entry: [null, { changes: "x" }] }]) {
      expect(parseFacebookComments(payload)).toEqual([]);
    }
    expect(parseFacebookComments({ object: "page", entry: [{ id: "P", messaging: [{}] }] })).toEqual([]);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/channels test parse` → FAIL (ບໍ່ມີ export).

- [ ] **Step 3: implementation parse.** ໃນ `packages/channels/src/types.ts` ເພີ່ມ (ຫຼັງ `InboundEvent`):

```ts
/** ຄອມເມັ້ນໃໝ່ໃນໂພສ/Live (webhook field `feed`) */
export interface CommentEvent {
  channel: ChannelId;
  /** post_id ທີ່ Meta ສົ່ງ (ໃຊ້ຈັບຄູ່ກັບ LiveSession.externalPostId) */
  postId: string;
  commentId: string;
  /** ລະຫັດຜູ້ຄອມເມັ້ນ (ອາດບໍ່ຕົງກັບ PSID ຂອງ Messenger) */
  authorId: string;
  authorName: string;
  message: string;
  timestamp: Date;
}
```
ໃນ `facebook/parse.ts` ປ່ຽນ import ເປັນ `import type { CommentEvent, InboundAttachment, InboundEvent } from "../types";` ແລະ ເພີ່ມທ້າຍໄຟລ໌:

```ts
const COMMENT_MAX_LENGTH = 1000;

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseCommentChange(change: unknown, pageId: string | null): CommentEvent | null {
  if (!isRecord(change) || change.field !== "feed" || !isRecord(change.value)) return null;
  const value = change.value;
  if (value.item !== "comment" || value.verb !== "add") return null;
  const commentId = nonEmptyString(value.comment_id);
  const postId = nonEmptyString(value.post_id);
  const authorId = idOf(value.from);
  if (!commentId || !postId || !authorId) return null;
  // ຄອມເມັ້ນຂອງ Page ເອງ (ເຊັ່ນ ຕອບລູກຄ້າ) ບໍ່ແມ່ນ CF
  if (pageId !== null && authorId === pageId) return null;
  const message = typeof value.message === "string" ? value.message.slice(0, COMMENT_MAX_LENGTH) : "";
  if (message.trim().length === 0) return null;
  const name = isRecord(value.from) ? nonEmptyString(value.from.name) : null;
  // created_time ຂອງ feed ເປັນວິນາທີ (ຕ່າງຈາກ messaging ທີ່ເປັນ ms)
  const seconds = typeof value.created_time === "number" ? value.created_time : null;
  const timestamp = seconds !== null && Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
  return {
    channel: "FACEBOOK",
    postId,
    commentId,
    authorId,
    authorName: name ?? `Facebook ${authorId.slice(-4)}`,
    message,
    timestamp,
  };
}

/** ຄອມເມັ້ນໃໝ່ (verb=add) ຈາກ webhook field `feed`; ປະເພດອື່ນ/ຜິດຮູບແບບ = ຂ້າມ (ບໍ່ throw) */
export function parseFacebookComments(payload: unknown): CommentEvent[] {
  if (!isRecord(payload) || payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const events: CommentEvent[] = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    const pageId = nonEmptyString(entry.id);
    for (const change of entry.changes) {
      const event = parseCommentChange(change, pageId);
      if (event) events.push(event);
    }
  }
  return events;
}
```
ໃນ `index.ts` ປ່ຽນແຖວ parse ເປັນ `export { parseFacebookComments, parseFacebookWebhook } from "./facebook/parse";`.
`pnpm --filter @oca/channels test parse` → PASS.

- [ ] **Step 4: test adapter (RED)** ເບິ່ງ `facebook/adapter.test.ts` ເພື່ອໃຊ້ຮູບແບບ fake `fetch` ເດີມ ແລ້ວເພີ່ມ describe (ປັບຊື່ helper ໃຫ້ຕົງກັບໄຟລ໌; ຕົວຢ່າງຂ້າງລຸ່ມສົມມຸດ `makeAdapter(fetchMock)` ແລະ `jsonResponse(status, body)` ຖ້າບໍ່ມີ ໃຫ້ສ້າງໃນ describe ນີ້):

```ts
describe("FacebookAdapter comments", () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const make = (fetchImpl: typeof fetch, token: string | undefined = "tok") =>
    new FacebookAdapter({ pageAccessToken: token, graphBaseUrl: "http://graph.test/v1", fetch: fetchImpl });

  it("parseComments ໃຊ້ parser ຄອມເມັ້ນ", () => {
    const adapter = make(vi.fn() as unknown as typeof fetch);
    const events = adapter.parseComments({
      object: "page",
      entry: [{ id: "P", changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "c1", post_id: "p1", from: { id: "U1", name: "A" }, message: "A1" } }] }],
    });
    expect(events.map((event) => event.commentId)).toEqual(["c1"]);
  });

  it("sendPrivateReply: POST /<commentId>/private_replies ດ້ວຍ Bearer ແລະ ຄືນ id", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: "m_1", recipient_id: "U1" }));
    const result = await make(fetchMock as unknown as typeof fetch).sendPrivateReply("100_200", "ສະບາຍດີ");
    expect(result).toEqual({ ok: true, externalId: "m_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://graph.test/v1/100_200/private_replies");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual({ message: "ສະບາຍດີ" });
  });

  it("replyToComment: POST /<commentId>/comments", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: "c_9" }));
    const result = await make(fetchMock as unknown as typeof fetch).replyToComment("100_200", "ຮັບແລ້ວ");
    expect(result).toEqual({ ok: true, externalId: "c_9" });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("http://graph.test/v1/100_200/comments");
  });

  it("ບໍ່ມີ token → CHANNEL_NOT_CONFIGURED; commentId ຜິດຮູບແບບ → SEND_REJECTED (ບໍ່ເອີ້ນ fetch)", async () => {
    const fetchMock = vi.fn();
    expect(await make(fetchMock as unknown as typeof fetch, undefined).sendPrivateReply("1_2", "x")).toMatchObject({ ok: false, code: "CHANNEL_NOT_CONFIGURED" });
    expect(await make(fetchMock as unknown as typeof fetch).sendPrivateReply("../x", "x")).toMatchObject({ ok: false, code: "SEND_REJECTED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Graph error: 400 ປະຕິເສດ → SEND_REJECTED; 500 → CHANNEL_UNAVAILABLE; 2xx ບໍ່ມີ id → CHANNEL_UNAVAILABLE", async () => {
    const reply = async (response: Response) =>
      make((async () => response) as unknown as typeof fetch).sendPrivateReply("1_2", "x");
    expect(await reply(jsonResponse(400, { error: { code: 100, message: "(#100) bad" } }))).toMatchObject({ code: "SEND_REJECTED" });
    expect(await reply(jsonResponse(500, { error: { code: 2, message: "boom" } }))).toMatchObject({ code: "CHANNEL_UNAVAILABLE" });
    expect(await reply(jsonResponse(200, {}))).toMatchObject({ ok: false, code: "CHANNEL_UNAVAILABLE" });
  });
});
```
ຖ້າ `vi`/`FacebookAdapter` ຍັງບໍ່ import ໃນໄຟລ໌ ໃຫ້ເພີ່ມ. ແລ່ນ → FAIL.

- [ ] **Step 5: implementation adapter.** ໃນ `facebook/adapter.ts`:
(a) import ເພີ່ມ `CommentEvent` ແລະ `parseFacebookComments`.
(b) ແທນທີ່ເນື້ອໃນ `sendText` ດ້ວຍ helper ຮ່ວມ (ຮັກສາຂໍ້ຄວາມ detail ເດີມທຸກຕົວ) ແລະ ເພີ່ມ 3 method:

```ts
  parseComments(payload: unknown): CommentEvent[] {
    return parseFacebookComments(payload);
  }

  async sendText(threadId: string, text: string): Promise<SendResult> {
    if (this.config.pageAccessToken && !SAFE_THREAD_ID.test(threadId)) {
      return { ok: false, code: "SEND_REJECTED", detail: "Invalid thread id" };
    }
    return this.postGraph(
      "/me/messages",
      { recipient: { id: threadId }, messaging_type: "RESPONSE", message: { text } },
      (body) => (typeof body.message_id === "string" ? body.message_id : undefined),
      "Graph returned 2xx without message_id",
    );
  }

  /** Private Reply: ຂໍ້ຄວາມສ່ວນຕົວ 1 ຄັ້ງຕໍ່ຄອມເມັ້ນ (ພາຍໃນ 7 ວັນ) ເພື່ອເລີ່ມແຊັດກັບຜູ້ຄອມເມັ້ນ */
  async sendPrivateReply(commentId: string, text: string): Promise<SendResult> {
    if (this.config.pageAccessToken && !SAFE_THREAD_ID.test(commentId)) {
      return { ok: false, code: "SEND_REJECTED", detail: "Invalid comment id" };
    }
    return this.postGraph(
      `/${commentId}/private_replies`,
      { message: text },
      (body) => (typeof body.message_id === "string" ? body.message_id : typeof body.id === "string" ? body.id : undefined),
      "Graph returned 2xx without an id",
    );
  }

  /** ຕອບຄອມເມັ້ນສາທາລະນະ */
  async replyToComment(commentId: string, text: string): Promise<SendResult> {
    if (this.config.pageAccessToken && !SAFE_THREAD_ID.test(commentId)) {
      return { ok: false, code: "SEND_REJECTED", detail: "Invalid comment id" };
    }
    return this.postGraph(
      `/${commentId}/comments`,
      { message: text },
      (body) => (typeof body.id === "string" ? body.id : undefined),
      "Graph returned 2xx without an id",
    );
  }

  private async postGraph(
    path: string,
    payload: unknown,
    pickId: (body: Record<string, unknown>) => string | undefined,
    missingIdDetail: string,
  ): Promise<SendResult> {
    const token = this.config.pageAccessToken;
    if (!token) {
      return { ok: false, code: "CHANNEL_NOT_CONFIGURED", detail: "FACEBOOK_PAGE_ACCESS_TOKEN is not set" };
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: errorText(error) };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      // abort/timeout/truncated/non-JSON body: ບໍ່ຮູ້ຜົນ ຈຶ່ງບໍ່ລາຍງານວ່າຖືກປະຕິເສດ
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: errorText(error) };
    }
    if (response.ok) {
      const id = isRecord(body) ? pickId(body) : undefined;
      if (id !== undefined) return { ok: true, externalId: id };
      // 2xx: Meta ອາດສົ່ງແລ້ວ
      return { ok: false, code: "CHANNEL_UNAVAILABLE", detail: missingIdDetail };
    }
    return { ok: false, ...mapGraphFailure(response.status, body) };
  }
```
ລຶບໂຄດ `sendText` ເກົ່າ (ທັງ body) ທີ່ຖືກແທນ. ຮັກສາ `fetchProfile` ເດີມ.
`pnpm --filter @oca/channels test` → PASS (ລວມ test `sendText` ເດີມ ທີ່ຕ້ອງບໍ່ເສຍ).

- [ ] **Step 6: simulator (RED→GREEN).** ເພີ່ມ test ໃນ `simulator/simulator.test.ts` (ຮູບແບບຕາມໄຟລ໌; ຕົວຢ່າງ):

```ts
describe("comments", () => {
  it("commentPayload ຖືກ parse ໂດຍ parseFacebookComments", () => {
    const events = parseFacebookComments(
      commentPayload({ pageId: "P", postId: "P_1", commentId: "P_1_9", fromId: "U1", fromName: "ກ", message: "A1", timestamp: 1_700_000_000_000 }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ postId: "P_1", commentId: "P_1_9", authorId: "U1", message: "A1" });
    expect(events[0]?.timestamp.getTime()).toBe(1_700_000_000_000);
  });
  it("verb ອື່ນຖືກຂ້າມ", () => {
    expect(parseFacebookComments(commentPayload({ pageId: "P", postId: "P_1", commentId: "c", fromId: "U1", fromName: "ກ", message: "A1", verb: "edited" }))).toEqual([]);
  });
  it("fake graph ບັນທຶກ private_replies ແລະ comments; failNext ໃຊ້ກັບທັງສອງ", async () => {
    const graph = await startFakeGraph({ token: "t" });
    try {
      const adapter = new FacebookAdapter({ pageAccessToken: "t", graphBaseUrl: graph.url });
      expect(await adapter.sendPrivateReply("P_1_9", "hi")).toMatchObject({ ok: true });
      expect(await adapter.replyToComment("P_1_9", "ok")).toMatchObject({ ok: true });
      expect(graph.privateReplies).toEqual([{ commentId: "P_1_9", text: "hi", authorization: "Bearer t" }]);
      expect(graph.commentReplies).toEqual([{ commentId: "P_1_9", text: "ok", authorization: "Bearer t" }]);
      graph.failNext({ status: 400, code: 100, message: "(#100) bad" });
      expect(await adapter.sendPrivateReply("P_1_9", "again")).toMatchObject({ ok: false, code: "SEND_REJECTED" });
      graph.reset();
      expect(graph.privateReplies).toEqual([]);
      expect(graph.commentReplies).toEqual([]);
    } finally {
      await graph.close();
    }
  });
});
```
(ເພີ່ມ import `commentPayload`, `parseFacebookComments`, `startFakeGraph`, `FacebookAdapter` ຕາມໄຟລ໌.) ແລ່ນ → FAIL.

`simulator/payloads.ts` ເພີ່ມ:

```ts
/** webhook ຄອມເມັ້ນ (field `feed`). timestamp ເປັນ ms; ໃນ payload ແປງເປັນວິນາທີຄືກັບ Meta */
export function commentPayload(input: {
  pageId: string;
  postId: string;
  commentId: string;
  fromId: string;
  fromName: string;
  message: string;
  verb?: "add" | "edited" | "remove";
  timestamp?: number;
}): object {
  const seconds = Math.floor((input.timestamp ?? Date.now()) / 1000);
  return {
    object: "page",
    entry: [
      {
        id: input.pageId,
        time: seconds,
        changes: [
          {
            field: "feed",
            value: {
              from: { id: input.fromId, name: input.fromName },
              item: "comment",
              comment_id: input.commentId,
              post_id: input.postId,
              parent_id: input.postId,
              verb: input.verb ?? "add",
              message: input.message,
              created_time: seconds,
            },
          },
        ],
      },
    ],
  };
}
```
`simulator/fake-graph.ts`:
- ເພີ່ມ `export interface CommentReply { commentId: string; text: string; authorization: string | undefined }` ແລະໃນ `FakeGraph` ເພີ່ມ `readonly privateReplies: CommentReply[]; readonly commentReplies: CommentReply[];`.
- ໃນ `startFakeGraph` ປະກາດ `const privateReplies: CommentReply[] = []; const commentReplies: CommentReply[] = [];`.
- ໃນ `handle` ກ່ອນ block `if (request.method === "POST" && url.pathname.endsWith("/me/messages"))` ເພີ່ມ:

```ts
    const commentRoute = /^\/(?:v[\d.]+\/)?([^/]+)\/(private_replies|comments)$/.exec(url.pathname);
    if (request.method === "POST" && commentRoute) {
      const failure = failures.shift();
      if (failure) {
        reply(failure.status, {
          error: { message: failure.message, type: "OAuthException", code: failure.code, error_subcode: failure.subcode },
        });
        return;
      }
      const body = await readJson(request);
      if (typeof body?.message !== "string") {
        reply(400, { error: { message: "(#100) Invalid parameter", type: "OAuthException", code: 100 } });
        return;
      }
      const entry = { commentId: decodeURIComponent(commentRoute[1] ?? ""), text: body.message, authorization };
      counter += 1;
      if (commentRoute[2] === "private_replies") {
        privateReplies.push(entry);
        reply(200, { id: `m_sim_pr_${counter}`, recipient_id: "sim" });
      } else {
        commentReplies.push(entry);
        reply(200, { id: `c_sim_${counter}` });
      }
      return;
    }
```
- ໃນ object ທີ່ return: ເພີ່ມ `privateReplies, commentReplies,` ແລະໃນ `reset` ເພີ່ມ `privateReplies.length = 0; commentReplies.length = 0;`.
`pnpm --filter @oca/channels test && pnpm --filter @oca/channels lint && pnpm --filter @oca/channels build` → PASS.

- [ ] **Step 7: commit**

```bash
git add packages/channels/src
git commit -m "feat(channels): parse feed comments, Private Reply and comment reply, simulator support

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: OrdersService: ສ້າງບິນ CF ແລະ ເພີ່ມລາຍການເຂົ້າບິນທີ່ມີແລ້ວ

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Create: `apps/api/test/orders-append.e2e.test.ts`

- [ ] **Step 1: test (RED)** ສ້າງ `apps/api/test/orders-append.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import { InsufficientStockError, type PrismaClient, receive } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrdersService } from "../src/modules/orders/orders.service";
import { createTestApp, expectLedgerMatches, resetDb, seedCatalog } from "./helpers";

describe("OrdersService CF helpers", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let orders: OrdersService;
  let f: Awaited<ReturnType<typeof seedCatalog>>;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    orders = app.get(OrdersService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    f = await seedCatalog(db);
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 5 });
    });
  });

  const session = () =>
    db.liveSession.create({ data: { title: "L", kind: "LIVE", status: "LIVE", externalPostId: "P1" } });
  const customer = () => db.customer.create({ data: { name: "CF Customer", facebookUserId: "U1" } });

  const createCfOrder = async (sessionId: string, customerId: string, items: { variantId: string; quantity: number }[]) =>
    db.$transaction((tx) =>
      orders.createCfOrderInTx(
        tx,
        { customerId, items: items.map((item) => ({ ...item, discount: "0" })), shippingFee: "0" },
        { channel: "FACEBOOK", source: "LIVE_CF", liveSessionId: sessionId },
      ),
    );

  it("createCfOrderInTx: ບິນ LIVE_CF/FACEBOOK ຜູກ session, ຈອງສະຕ໋ອກ, ຍອດຖືກ", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 2 }]);
    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(order).toMatchObject({ channel: "FACEBOOK", source: "LIVE_CF", liveSessionId: s.id, customerId: c.id, status: "PENDING_PAYMENT" });
    expect(order.total.toFixed(2)).toBe("200.00");
    expect(order.items).toHaveLength(1);
    expect(order.reservedUntil).not.toBeNull();
    const level = await db.stockLevel.findFirstOrThrow({ where: { variantId: f.v1.id, warehouseId: f.whA.id } });
    expect(level.reserved).toBe(2);
    await expectLedgerMatches(db);
  });

  it("createCfOrderInTx: ສະຕ໋ອກບໍ່ພໍ → InsufficientStockError ແລະ ບໍ່ມີບິນຄ້າງ", async () => {
    const s = await session();
    const c = await customer();
    await expect(createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 6 }])).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await db.order.count()).toBe(0);
  });

  it("appendItemsInTx: ລວມແຖວເດີມ + ເພີ່ມແຖວໃໝ່, ຄິດຍອດໃໝ່, ຈອງສະເພາະສ່ວນເພີ່ມ, ຕໍ່ເວລາຈອງ", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 2 }]);
    // ເລື່ອນເວລາໝົດໃຫ້ໃກ້ ເພື່ອພິສູດວ່າຖືກຣີເຊັດ
    const soon = new Date(Date.now() + 60_000);
    await db.order.update({ where: { id }, data: { reservedUntil: soon } });

    await db.$transaction((tx) =>
      orders.appendItemsInTx(tx, id, [{ variantId: f.v1.id, quantity: 1 }, { variantId: f.v2.id, quantity: 3 }], null),
    );

    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { sku: "asc" } } } });
    expect(order.items.map((item) => [item.sku, item.quantity, item.lineTotal.toFixed(2)])).toEqual([
      ["SKU-1", 3, "300.00"],
      ["SKU-2", 3, "300.00"],
    ]);
    expect(order.subtotal.toFixed(2)).toBe("600.00");
    expect(order.total.toFixed(2)).toBe("600.00");
    expect(order.reservedUntil?.getTime()).toBeGreaterThan(soon.getTime() + 60_000);
    const levels = await db.stockLevel.findMany({ where: { warehouseId: f.whA.id }, orderBy: { variantId: "asc" } });
    expect(levels.map((level) => level.reserved).sort()).toEqual([3, 3]);
    await expectLedgerMatches(db);
  });

  it("appendItemsInTx: ສະຕ໋ອກບໍ່ພໍ → rollback ທັງໝົດ (ບິນເດີມບໍ່ປ່ຽນ)", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 4 }]);
    await expect(
      db.$transaction((tx) => orders.appendItemsInTx(tx, id, [{ variantId: f.v1.id, quantity: 2 }], null)),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(order.items.map((item) => item.quantity)).toEqual([4]);
    expect(order.total.toFixed(2)).toBe("400.00");
    await expectLedgerMatches(db);
  });

  it("appendItemsInTx: ບິນທີ່ບໍ່ແມ່ນ PENDING_PAYMENT ຫຼື ໝົດເວລາຈອງ → ORDER_INVALID_STATE; ບິນບໍ່ມີ → ORDER_NOT_FOUND", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 1 }]);
    const append = () => db.$transaction((tx) => orders.appendItemsInTx(tx, id, [{ variantId: f.v2.id, quantity: 1 }], null));
    await db.order.update({ where: { id }, data: { status: "PAID" } });
    await expect(append()).rejects.toMatchObject({ response: { code: "ORDER_INVALID_STATE" } });
    await db.order.update({ where: { id }, data: { status: "PENDING_PAYMENT", reservedUntil: new Date(Date.now() - 1000) } });
    await expect(append()).rejects.toMatchObject({ response: { code: "ORDER_INVALID_STATE" } });
    await expect(
      db.$transaction((tx) => orders.appendItemsInTx(tx, "nope", [{ variantId: f.v2.id, quantity: 1 }], null)),
    ).rejects.toMatchObject({ response: { code: "ORDER_NOT_FOUND" } });
  });

  it("appendItemsInTx: variant ບໍ່ພົບ / ປິດຂາຍ → VARIANT_NOT_FOUND / VARIANT_NOT_AVAILABLE; variant ຊ້ຳໃນ additions ບໍ່ໄດ້", async () => {
    const s = await session();
    const c = await customer();
    const id = await createCfOrder(s.id, c.id, [{ variantId: f.v1.id, quantity: 1 }]);
    const append = (items: { variantId: string; quantity: number }[]) =>
      db.$transaction((tx) => orders.appendItemsInTx(tx, id, items, null));
    await expect(append([{ variantId: "nope", quantity: 1 }])).rejects.toMatchObject({ response: { code: "VARIANT_NOT_FOUND" } });
    await db.productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
    await expect(append([{ variantId: f.v2.id, quantity: 1 }])).rejects.toMatchObject({ response: { code: "VARIANT_NOT_AVAILABLE" } });
    await expect(
      append([{ variantId: f.v1.id, quantity: 1 }, { variantId: f.v1.id, quantity: 1 }]),
    ).rejects.toMatchObject({ status: 400 });
  });
});
```
ແລ່ນ `pnpm --filter @oca/api test orders-append` → FAIL (ບໍ່ມີ method). ຖ້າ `response.code` ບໍ່ແມ່ນ shape ຂອງ exception ໃນ repo ໃຫ້ເບິ່ງ test ເດີມທີ່ກວດ code ຂອງ `apiError` (ເຊັ່ນ `orders.e2e.test.ts`) ແລ້ວໃຊ້ວິທີດຽວກັນ.

- [ ] **Step 2: implementation.** ໃນ `orders.service.ts`:

(a) import: ເພີ່ມ `type OrderSource` ໃນ import ຈາກ `@oca/database` (ພ້ອມ `type Prisma, type PrismaClient, releaseMany, reserveMany, shipMany`).

(b) ເພີ່ມ type ເທິງ class:

```ts
/** ແຫຼ່ງທີ່ມາຂອງບິນທີ່ຖືກສ້າງໂດຍລະບົບ (CF Engine); ບິນຈາກແຊັດໃຊ້ conversationId ແທນ */
export interface OrderOrigin {
  channel: SalesChannel;
  source: OrderSource;
  liveSessionId: string;
}
```

(c) ແກ້ `create()`: ແຖວ `orderId = await this.createInTransaction(input, actor, idempotencyKey, idempotencyHash);` → `orderId = await this.createInTransaction(input, actor.id, idempotencyKey, idempotencyHash);`.

(d) ແທນຫົວ `createInTransaction`:

ເກົ່າ:
```ts
  private async createInTransaction(
    input: CreateOrderInput,
    actor: AuthUser,
    idempotencyKey: string | undefined,
    idempotencyHash: string | undefined,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const settings = await ensureStoreSetting(tx);
```
ໃໝ່:
```ts
  /** outerTx = ໃຊ້ transaction ຂອງຜູ້ເອີ້ນ (CF Engine ທີ່ຕ້ອງ atomic ກັບ ledger); ບໍ່ໃສ່ = ເປີດ transaction ເອງ */
  private async createInTransaction(
    input: CreateOrderInput,
    actorId: string | null,
    idempotencyKey: string | undefined,
    idempotencyHash: string | undefined,
    origin?: OrderOrigin,
    outerTx?: Prisma.TransactionClient,
  ): Promise<string> {
    const run = async (tx: Prisma.TransactionClient): Promise<string> => {
      const settings = await ensureStoreSetting(tx);
```
(e) ໃນ body: `channel: conversation?.channel ?? "OFFLINE",` → `channel: conversation?.channel ?? origin?.channel ?? "OFFLINE",`; `source: conversation ? "CHAT" : "MANUAL",` → `source: conversation ? "CHAT" : (origin?.source ?? "MANUAL"),`; ຖັດຈາກ `conversationId: conversation?.id,` ເພີ່ມ `liveSessionId: origin?.liveSessionId,`; `{ orderId: order.id, actorId: actor.id }` → `{ orderId: order.id, actorId }`.

(f) ແທນທ້າຍ method:
ເກົ່າ:
```ts
      return order.id;
    });
  }
```
ໃໝ່:
```ts
      return order.id;
    };
    return outerTx ? run(outerTx) : this.prisma.$transaction(run);
  }

  /**
   * ສ້າງບິນຈາກ CF ໃນ transaction ຂອງຜູ້ເອີ້ນ (ຈອງສະຕ໋ອກໃນນັ້ນ; ບໍ່ພໍ → InsufficientStockError ໃຫ້ຜູ້ເອີ້ນ rollback).
   * ບໍ່ບັນທຶກ audit (ຜູ້ກະທຳແມ່ນລະບົບ; ledger ຂອງ CF ເປັນຫຼັກຖານ).
   */
  createCfOrderInTx(tx: Prisma.TransactionClient, input: CreateOrderInput, origin: OrderOrigin): Promise<string> {
    return this.createInTransaction(input, null, undefined, undefined, origin, tx);
  }
```

(g) ເພີ່ມ method ໃນ class (ກ່ອນ `pay(`):

```ts
  /**
   * ເພີ່ມລາຍການເຂົ້າບິນ PENDING_PAYMENT ທີ່ຍັງບໍ່ໝົດເວລາ (CF ຊ້ຳຂອງລູກຄ້າດຽວກັນ) ໃນ transaction ຂອງຜູ້ເອີ້ນ:
   * ລວມເຂົ້າແຖວເດີມ (variant + ສາງ default) ຫຼື ສ້າງແຖວໃໝ່, ຈອງສະຕ໋ອກສະເພາະສ່ວນທີ່ເພີ່ມ, ຄິດຍອດໃໝ່ທັງບິນ
   * ແລະ ຣີເຊັດ reservedUntil ເປັນເວລາຈອງເລີ່ມຕົ້ນໃໝ່. `additions` ຕ້ອງບໍ່ມີ variant ຊ້ຳ.
   */
  async appendItemsInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    additions: readonly { variantId: string; quantity: number }[],
    actorId: string | null,
  ): Promise<void> {
    const variantIds = additions.map((addition) => addition.variantId);
    if (new Set(variantIds).size !== variantIds.length) throw new BadRequestException("Duplicate variants in additions");

    // lock ແຖວບິນ: ແຂ່ງກັບ pay/cancel/expire ໄດ້ຢ່າງປອດໄພ
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
    if (
      order.status !== "PENDING_PAYMENT" ||
      (order.reservedUntil !== null && order.reservedUntil.getTime() <= Date.now())
    ) {
      throw apiError("ORDER_INVALID_STATE", `Order is ${order.status}; cannot append items`, { status: order.status });
    }

    const settings = await ensureStoreSetting(tx);
    const warehouse = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } });
    if (!warehouse) throw apiError("NO_DEFAULT_WAREHOUSE", "No active default warehouse is configured");
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { name: true, status: true } } },
    });
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    const merged = new Map<string, number>(order.items.map((item) => [item.id, item.quantity]));
    const added: { variant: (typeof variants)[number]; quantity: number }[] = [];
    for (const addition of additions) {
      const variant = variantById.get(addition.variantId);
      if (!variant) throw apiError("VARIANT_NOT_FOUND", `Variant ${addition.variantId} not found`);
      if (!variant.isActive || variant.product.status !== "ACTIVE") {
        throw apiError("VARIANT_NOT_AVAILABLE", `Variant ${variant.sku} is not available for sale`, { sku: variant.sku });
      }
      const existing = order.items.find((item) => item.variantId === variant.id && item.warehouseId === warehouse.id);
      if (existing) merged.set(existing.id, (merged.get(existing.id) ?? existing.quantity) + addition.quantity);
      else added.push({ variant, quantity: addition.quantity });
    }

    let totals: ReturnType<typeof calculateOrderTotals>;
    try {
      totals = calculateOrderTotals({
        lines: [
          ...order.items.map((item) => ({
            unitPrice: item.unitPrice.toFixed(2),
            quantity: merged.get(item.id) ?? item.quantity,
            discount: item.discount.toFixed(2),
          })),
          ...added.map(({ variant, quantity }) => ({ unitPrice: variant.price.toFixed(2), quantity, discount: "0" })),
        ],
        shippingFee: order.shippingFee.toFixed(2),
        vatRate: order.vatRate.toString(),
        pricesIncludeVat: settings.pricesIncludeVat,
      });
    } catch (error) {
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }

    for (const [index, item] of order.items.entries()) {
      await tx.orderItem.update({
        where: { id: item.id },
        data: { quantity: merged.get(item.id) ?? item.quantity, lineTotal: totals.lines[index]?.lineTotal ?? "0.00" },
      });
    }
    if (added.length > 0) {
      await tx.orderItem.createMany({
        data: added.map(({ variant, quantity }, index) => ({
          orderId,
          variantId: variant.id,
          warehouseId: warehouse.id,
          productName: variant.product.name,
          variantName: variant.name,
          sku: variant.sku,
          unitPrice: variant.price,
          unitCost: variant.costPrice,
          quantity,
          discount: 0,
          lineTotal: totals.lines[order.items.length + index]?.lineTotal ?? "0.00",
        })),
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
        reservedUntil: new Date(Date.now() + settings.reservationMinutes * 60_000),
      },
    });
    // ຈອງສະເພາະສ່ວນທີ່ເພີ່ມ (ບໍ່ພໍ → InsufficientStockError → ຜູ້ເອີ້ນ rollback)
    await reserveMany(
      tx,
      additions.map((addition) => ({
        variantId: addition.variantId,
        warehouseId: warehouse.id,
        quantity: addition.quantity,
      })),
      { orderId, actorId },
    );
  }
```
ຖ້າ lint ຕົ່ນເລື່ອງ indentation ຂອງ body ທີ່ຖືກຫໍ່ເປັນ `run` ໃຫ້ເປັນຕາມ formatter ຂອງ repo (ກວດ `package.json` ວ່າມີ format script; ຖ້າບໍ່ມີ ກໍບໍ່ຕ້ອງແກ້ indentation ຂອງ body ເພາະບໍ່ປ່ຽນລະດັບ: `run` ຢູ່ລະດັບດຽວກັບ `return this.prisma.$transaction(async (tx) => {` ເດີມ).

- [ ] **Step 3:** `pnpm --filter @oca/api test orders-append` → PASS; ແລ້ວ `pnpm --filter @oca/api test orders` (test ບິນເດີມ ຕ້ອງຍັງຜ່ານທັງໝົດ: idempotency, chat, ສະຕ໋ອກ) ແລະ `pnpm --filter @oca/api lint`.

- [ ] **Step 4: commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/test/orders-append.e2e.test.ts
git commit -m "feat(api): OrdersService creates CF orders and appends items to a pending order

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API ຂອງ session ແລະ ລະຫັດ CF

**Files:**
- Create: `apps/api/src/modules/channels/channels.module.ts`, `apps/api/src/modules/live-cf/live-cf.mapper.ts`, `live-sessions.service.ts`, `live-sessions.controller.ts`, `apps/api/test/live-sessions.e2e.test.ts`
- Modify: `apps/api/src/modules/live-cf/live-cf.module.ts`

- [ ] **Step 1: test (RED)** ສ້າງ `apps/api/test/live-sessions.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedLiveSession, seedRoleUsers } from "./helpers";

describe("live sessions (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let auth: { Authorization: string };
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
    f = await seedCatalog(db);
    auth = await bearerFor(app, "chat_admin@role.test");
  });

  const create = (body: object = { title: "Live ຄືນນີ້", kind: "LIVE", externalPostId: "P1" }) =>
    request(server()).post("/live-sessions").set(auth).send(body);
  const addItem = (id: string, body: object) => request(server()).post(`/live-sessions/${id}/items`).set(auth).send(body);

  it("ສ້າງ → ອ່ານ → ລາຍການ (DRAFT, ບັນທຶກຜູ້ສ້າງ, ກອງຕາມສະຖານະ)", async () => {
    const res = await create().expect(201);
    expect(res.body).toMatchObject({ title: "Live ຄືນນີ້", kind: "LIVE", status: "DRAFT", externalPostId: "P1", publicReplyEnabled: true, itemCount: 0, commentCount: 0, items: [] });
    const got = await request(server()).get(`/live-sessions/${res.body.id}`).set(auth).expect(200);
    expect(got.body.id).toBe(res.body.id);
    const list = await request(server()).get("/live-sessions").set(auth).expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1 });
    expect(list.body.items[0].id).toBe(res.body.id);
    const none = await request(server()).get("/live-sessions?status=LIVE").set(auth).expect(200);
    expect(none.body.total).toBe(0);
    const creator = await db.liveSession.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(creator.createdById).not.toBeNull();
  });

  it("body ຜິດ → 400; id ບໍ່ພົບ → 404 LIVE_SESSION_NOT_FOUND", async () => {
    await create({ title: "", kind: "LIVE" }).expect(400);
    await create({ title: "x", kind: "OTHER" }).expect(400);
    const res = await request(server()).get("/live-sessions/nope").set(auth).expect(404);
    expect(res.body.code).toBe("LIVE_SESSION_NOT_FOUND");
  });

  it("ແກ້ໄຂ title/externalPostId/publicReplyEnabled; externalPostId ແກ້ບໍ່ໄດ້ເມື່ອ LIVE", async () => {
    const { body } = await create().expect(201);
    const patched = await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ title: "ໃໝ່", publicReplyEnabled: false, externalPostId: "P2" }).expect(200);
    expect(patched.body).toMatchObject({ title: "ໃໝ່", publicReplyEnabled: false, externalPostId: "P2" });
    await addItem(body.id, { code: "a1", variantId: f.v1.id }).expect(201);
    await request(server()).post(`/live-sessions/${body.id}/start`).set(auth).expect(200);
    const res = await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ externalPostId: "P3" }).expect(409);
    expect(res.body.code).toBe("LIVE_SESSION_INVALID_STATE");
    await request(server()).patch(`/live-sessions/${body.id}`).set(auth).send({ title: "ຍັງແກ້ຊື່ໄດ້" }).expect(200);
  });

  it("ລະຫັດ: normalize, ຊ້ຳ → 409 DUPLICATE_VALUE, variant ບໍ່ພົບ → 404, ປິດຂາຍ → 409, ສະແດງ sku", async () => {
    const { body } = await create().expect(201);
    const ok = await addItem(body.id, { code: " ດຳ  m ", variantId: f.v1.id, limit: 5 }).expect(201);
    expect(ok.body).toMatchObject({ code: "ດຳ M", variantId: f.v1.id, sku: "SKU-1", limit: 5, claimed: 0 });
    const dup = await addItem(body.id, { code: "ດຳ M", variantId: f.v2.id }).expect(409);
    expect(dup.body.code).toBe("DUPLICATE_VALUE");
    const missing = await addItem(body.id, { code: "B", variantId: "nope" }).expect(404);
    expect(missing.body.code).toBe("VARIANT_NOT_FOUND");
    await db.productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
    const inactive = await addItem(body.id, { code: "C", variantId: f.v2.id }).expect(409);
    expect(inactive.body.code).toBe("VARIANT_NOT_AVAILABLE");
    const detail = await request(server()).get(`/live-sessions/${body.id}`).set(auth).expect(200);
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.itemCount).toBe(1);
  });

  it("ແກ້/ລຶບລະຫັດ: ໄດ້ເມື່ອ claimed=0; ມີຄົນ CF ແລ້ວ → 409 LIVE_ITEM_IN_USE (limit ຕໍ່າກວ່າ claimed ກໍບໍ່ໄດ້); item ບໍ່ພົບ → 404", async () => {
    const { body } = await create().expect(201);
    const item = (await addItem(body.id, { code: "A1", variantId: f.v1.id }).expect(201)).body;
    const patched = await request(server()).patch(`/live-sessions/${body.id}/items/${item.id}`).set(auth).send({ variantId: f.v2.id, limit: 3 }).expect(200);
    expect(patched.body).toMatchObject({ variantId: f.v2.id, sku: "SKU-2", limit: 3 });
    await db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 2 } });
    const inUse = await request(server()).patch(`/live-sessions/${body.id}/items/${item.id}`).set(auth).send({ variantId: f.v1.id }).expect(409);
    expect(inUse.body.code).toBe("LIVE_ITEM_IN_USE");
    await request(server()).patch(`/live-sessions/${body.id}/items/${item.id}`).set(auth).send({ limit: 1 }).expect(409);
    await request(server()).patch(`/live-sessions/${body.id}/items/${item.id}`).set(auth).send({ limit: 10 }).expect(200);
    await request(server()).delete(`/live-sessions/${body.id}/items/${item.id}`).set(auth).expect(409);
    await db.liveSessionItem.update({ where: { id: item.id }, data: { claimed: 0 } });
    await request(server()).delete(`/live-sessions/${body.id}/items/${item.id}`).set(auth).expect(204);
    const gone = await request(server()).delete(`/live-sessions/${body.id}/items/${item.id}`).set(auth).expect(404);
    expect(gone.body.code).toBe("LIVE_ITEM_NOT_FOUND");
  });

  it("start: ຕ້ອງມີ externalPostId ແລະ ≥1 ລະຫັດ; ສະຖານະຕ້ອງ DRAFT; ໂພສດຽວກັນ LIVE ຊ້ອນບໍ່ໄດ້", async () => {
    const noPost = (await create({ title: "x", kind: "POST" }).expect(201)).body;
    await addItem(noPost.id, { code: "A1", variantId: f.v1.id }).expect(201);
    await request(server()).post(`/live-sessions/${noPost.id}/start`).set(auth).expect(400);

    const noItems = (await create({ title: "y", kind: "LIVE", externalPostId: "P9" }).expect(201)).body;
    await request(server()).post(`/live-sessions/${noItems.id}/start`).set(auth).expect(400);

    const a = (await create().expect(201)).body;
    await addItem(a.id, { code: "A1", variantId: f.v1.id }).expect(201);
    const started = await request(server()).post(`/live-sessions/${a.id}/start`).set(auth).expect(200);
    expect(started.body).toMatchObject({ status: "LIVE" });
    expect(started.body.startedAt).not.toBeNull();
    const again = await request(server()).post(`/live-sessions/${a.id}/start`).set(auth).expect(409);
    expect(again.body.code).toBe("LIVE_SESSION_INVALID_STATE");

    const b = (await create().expect(201)).body; // externalPostId P1 ຊ້ຳກັບ a ທີ່ LIVE
    await addItem(b.id, { code: "A1", variantId: f.v1.id }).expect(201);
    const clash = await request(server()).post(`/live-sessions/${b.id}/start`).set(auth).expect(409);
    expect(clash.body.code).toBe("DUPLICATE_VALUE");
  });

  it("end: LIVE → ENDED (endedAt); ບໍ່ແມ່ນ LIVE → 409; ENDED ເພີ່ມ/ແກ້ລະຫັດບໍ່ໄດ້; ບິນທີ່ຈອງແລ້ວບໍ່ຖືກຍົກເລີກ", async () => {
    const s = await seedLiveSession(db, { items: [{ code: "A1", variantId: f.v1.id }] });
    await request(server()).post(`/live-sessions/${s.id}/end`).set(auth).expect(200).expect((res) => {
      expect(res.body.status).toBe("ENDED");
      expect(res.body.endedAt).not.toBeNull();
    });
    const again = await request(server()).post(`/live-sessions/${s.id}/end`).set(auth).expect(409);
    expect(again.body.code).toBe("LIVE_SESSION_INVALID_STATE");
    const add = await addItem(s.id, { code: "B", variantId: f.v2.id }).expect(409);
    expect(add.body.code).toBe("LIVE_SESSION_INVALID_STATE");
    const draft = (await create().expect(201)).body;
    await request(server()).post(`/live-sessions/${draft.id}/end`).set(auth).expect(409);
  });

  it("ສິດ: CHAT_ADMIN ເຮັດໄດ້; WAREHOUSE/ACCOUNTANT ອ່ານບໍ່ໄດ້ (403); ມີ live-cf:read ຢ່າງດຽວສ້າງບໍ່ໄດ້", async () => {
    for (const email of ["warehouse@role.test", "accountant@role.test"]) {
      const headers = await bearerFor(app, email);
      await request(server()).get("/live-sessions").set(headers).expect(403);
      await request(server()).post("/live-sessions").set(headers).send({ title: "x", kind: "LIVE" }).expect(403);
    }
    const role = await db.role.create({ data: { name: "LIVE_READ", permissions: { create: [{ permission: "live-cf:read" }] } } });
    const user = await db.user.findFirstOrThrow({ where: { email: "chat_admin@role.test" } });
    await db.user.create({ data: { email: "live-read@test.local", name: "r", passwordHash: user.passwordHash, roleId: role.id } });
    const reader = await bearerFor(app, "live-read@test.local");
    await request(server()).get("/live-sessions").set(reader).expect(200);
    await request(server()).post("/live-sessions").set(reader).send({ title: "x", kind: "LIVE" }).expect(403);
  });
});
```

- [ ] **Step 2:** ແລ່ນ → FAIL (404 ທຸກ route).

- [ ] **Step 3: ChannelsModule** ສ້າງ `apps/api/src/modules/channels/channels.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ChannelRegistry } from "../inbox/channel-registry";

/** ຫໍ່ ChannelRegistry ເພື່ອໃຫ້ Inbox ແລະ CF Engine ໃຊ້ຮ່ວມກັນ (ບໍ່ມີ circular import) */
@Module({
  providers: [ChannelRegistry],
  exports: [ChannelRegistry],
})
export class ChannelsModule {}
```
ໃນ `inbox.module.ts`: ເພີ່ມ `imports: [ChannelsModule]` ແລະ **ເອົາ `ChannelRegistry` ອອກຈາກ `providers`** (ຖ້າຄ້າງຈະມີ 2 instance). ເພີ່ມ import `ChannelsModule`.

- [ ] **Step 4: mapper** ສ້າງ `apps/api/src/modules/live-cf/live-cf.mapper.ts`:

```ts
import type { Prisma } from "@oca/database";

export const SESSION_INCLUDE = {
  _count: { select: { items: true, comments: true } },
} as const satisfies Prisma.LiveSessionInclude;

export const SESSION_DETAIL_INCLUDE = {
  ...SESSION_INCLUDE,
  items: {
    orderBy: { createdAt: "asc" },
    include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } },
  },
} as const satisfies Prisma.LiveSessionInclude;

export const ITEM_INCLUDE = {
  variant: { select: { sku: true, name: true, product: { select: { name: true } } } },
} as const satisfies Prisma.LiveSessionItemInclude;

export const COMMENT_INCLUDE = {
  order: { select: { orderNumber: true } },
} as const satisfies Prisma.CfCommentInclude;

type SessionRow = Prisma.LiveSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;
type SessionDetailRow = Prisma.LiveSessionGetPayload<{ include: typeof SESSION_DETAIL_INCLUDE }>;
type ItemRow = Prisma.LiveSessionItemGetPayload<{ include: typeof ITEM_INCLUDE }>;
export type CommentRow = Prisma.CfCommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;

export interface LiveItemDto {
  id: string;
  code: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  limit: number | null;
  claimed: number;
}

export interface LiveSessionDto {
  id: string;
  title: string;
  kind: string;
  status: string;
  externalPostId: string | null;
  publicReplyEnabled: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  itemCount: number;
  commentCount: number;
}

export interface LiveSessionDetailDto extends LiveSessionDto {
  items: LiveItemDto[];
}

export interface CfCommentDto {
  id: string;
  externalCommentId: string;
  authorExternalId: string;
  authorName: string;
  message: string;
  outcome: string;
  lines: unknown;
  orderId: string | null;
  orderNumber: string | null;
  replyStatus: string;
  replyErrorCode: string | null;
  createdAt: Date;
}

export function toItemDto(row: ItemRow): LiveItemDto {
  return {
    id: row.id,
    code: row.code,
    variantId: row.variantId,
    sku: row.variant.sku,
    productName: row.variant.product.name,
    variantName: row.variant.name,
    limit: row.limit,
    claimed: row.claimed,
  };
}

export function toSessionDto(row: SessionRow): LiveSessionDto {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    externalPostId: row.externalPostId,
    publicReplyEnabled: row.publicReplyEnabled,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    itemCount: row._count.items,
    commentCount: row._count.comments,
  };
}

export function toSessionDetailDto(row: SessionDetailRow): LiveSessionDetailDto {
  return { ...toSessionDto(row), items: row.items.map(toItemDto) };
}

export function toCommentDto(row: CommentRow): CfCommentDto {
  return {
    id: row.id,
    externalCommentId: row.externalCommentId,
    authorExternalId: row.authorExternalId,
    authorName: row.authorName,
    message: row.message,
    outcome: row.outcome,
    lines: row.lines,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? null,
    replyStatus: row.replyStatus,
    replyErrorCode: row.replyErrorCode,
    createdAt: row.createdAt,
  };
}
```
(`ProductVariant.name` ມີ ຍ້ອນ `variant.name` ຖືກໃຊ້ໃນ orders.service; ຖ້າ type ເປັນ `string | null` ກໍຕົງ.)

- [ ] **Step 5: service** ສ້າງ `apps/api/src/modules/live-cf/live-sessions.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type {
  CreateLiveItemInput,
  CreateLiveSessionInput,
  LiveSessionListQuery,
  UpdateLiveItemInput,
  UpdateLiveSessionInput,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";
import {
  ITEM_INCLUDE,
  type LiveItemDto,
  type LiveSessionDetailDto,
  type LiveSessionDto,
  SESSION_DETAIL_INCLUDE,
  SESSION_INCLUDE,
  toItemDto,
  toSessionDetailDto,
  toSessionDto,
} from "./live-cf.mapper";
import { CfIngestService } from "./cf-ingest.service";

@Injectable()
export class LiveSessionsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CfIngestService) private readonly ingest: CfIngestService,
  ) {}

  async list(query: LiveSessionListQuery): Promise<Page<LiveSessionDto>> {
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.liveSession.findMany({
        where,
        include: SESSION_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.liveSession.count({ where }),
    ]);
    return toPage(rows.map(toSessionDto), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<LiveSessionDetailDto> {
    const row = await this.prisma.liveSession.findUnique({ where: { id }, include: SESSION_DETAIL_INCLUDE });
    if (!row) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
    return toSessionDetailDto(row);
  }

  async create(input: CreateLiveSessionInput, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const row = await this.prisma.liveSession.create({
      data: {
        title: input.title,
        kind: input.kind,
        externalPostId: input.externalPostId ?? null,
        publicReplyEnabled: input.publicReplyEnabled,
        createdById: actor.id,
      },
      select: { id: true },
    });
    await this.audit.record({ userId: actor.id, action: "live.create", entity: "LiveSession", entityId: row.id, after: { title: input.title, kind: input.kind }, ip });
    return this.get(row.id);
  }

  async update(id: string, input: UpdateLiveSessionInput, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const session = await this.requireSession(id);
    if (input.externalPostId !== undefined && session.status === "LIVE") {
      throw apiError("LIVE_SESSION_INVALID_STATE", "externalPostId cannot be changed while the session is live");
    }
    await this.prisma.liveSession.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.externalPostId !== undefined ? { externalPostId: input.externalPostId } : {}),
        ...(input.publicReplyEnabled !== undefined ? { publicReplyEnabled: input.publicReplyEnabled } : {}),
      },
    });
    await this.audit.record({ userId: actor.id, action: "live.update", entity: "LiveSession", entityId: id, after: { ...input }, ip });
    return this.get(id);
  }

  async start(id: string, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const session = await this.requireSession(id);
    if (session.status !== "DRAFT") {
      throw apiError("LIVE_SESSION_INVALID_STATE", `Session is ${session.status}; only DRAFT sessions can start`, { status: session.status });
    }
    if (!session.externalPostId) throw apiError("BAD_REQUEST", "externalPostId is required to start a session");
    if (session._count.items === 0) throw apiError("BAD_REQUEST", "Add at least one CF code before starting");
    try {
      const { count } = await this.prisma.liveSession.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "LIVE", startedAt: new Date() },
      });
      if (count === 0) throw apiError("LIVE_SESSION_INVALID_STATE", "Session is no longer a draft");
    } catch (error) {
      // partial unique index: ມີ session LIVE ອື່ນໃຊ້ໂພສນີ້ຢູ່
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "Another live session is already using this post", { fields: ["externalPostId"] });
      throw error;
    }
    this.ingest.invalidate(session.externalPostId);
    await this.audit.record({ userId: actor.id, action: "live.start", entity: "LiveSession", entityId: id, ip });
    return this.get(id);
  }

  async end(id: string, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const session = await this.requireSession(id);
    const { count } = await this.prisma.liveSession.updateMany({
      where: { id, status: "LIVE" },
      data: { status: "ENDED", endedAt: new Date() },
    });
    if (count === 0) {
      throw apiError("LIVE_SESSION_INVALID_STATE", `Session is ${session.status}; only LIVE sessions can end`, { status: session.status });
    }
    if (session.externalPostId) this.ingest.invalidate(session.externalPostId);
    await this.audit.record({ userId: actor.id, action: "live.end", entity: "LiveSession", entityId: id, ip });
    return this.get(id);
  }

  async addItem(sessionId: string, input: CreateLiveItemInput): Promise<LiveItemDto> {
    const session = await this.requireSession(sessionId);
    if (session.status === "ENDED") throw apiError("LIVE_SESSION_INVALID_STATE", "Session has ended");
    await this.requireSellableVariant(input.variantId);
    try {
      const row = await this.prisma.liveSessionItem.create({
        data: { sessionId, code: input.code, variantId: input.variantId, limit: input.limit ?? null },
        include: ITEM_INCLUDE,
      });
      return toItemDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "This code already exists in the session", { fields: ["code"] });
      throw error;
    }
  }

  async updateItem(sessionId: string, itemId: string, input: UpdateLiveItemInput): Promise<LiveItemDto> {
    const session = await this.requireSession(sessionId);
    if (session.status === "ENDED") throw apiError("LIVE_SESSION_INVALID_STATE", "Session has ended");
    const item = await this.requireItem(sessionId, itemId);
    if (input.variantId !== undefined && input.variantId !== item.variantId) {
      if (item.claimed > 0) throw apiError("LIVE_ITEM_IN_USE", "This code already has CF orders; its product cannot change");
      await this.requireSellableVariant(input.variantId);
    }
    if (input.limit !== undefined && input.limit !== null && input.limit < item.claimed) {
      throw apiError("LIVE_ITEM_IN_USE", "The limit cannot be lower than the quantity already claimed", { claimed: item.claimed });
    }
    const row = await this.prisma.liveSessionItem.update({
      where: { id: itemId },
      data: {
        ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      },
      include: ITEM_INCLUDE,
    });
    return toItemDto(row);
  }

  async removeItem(sessionId: string, itemId: string): Promise<void> {
    const session = await this.requireSession(sessionId);
    if (session.status === "ENDED") throw apiError("LIVE_SESSION_INVALID_STATE", "Session has ended");
    const item = await this.requireItem(sessionId, itemId);
    if (item.claimed > 0) throw apiError("LIVE_ITEM_IN_USE", "This code already has CF orders and cannot be removed");
    // ເງື່ອນໄຂ claimed=0 ໃນ WHERE: ແຂ່ງກັບ CF ທີ່ເຂົ້າມາພ້ອມກັນໄດ້ຢ່າງປອດໄພ
    const { count } = await this.prisma.liveSessionItem.deleteMany({ where: { id: itemId, claimed: 0 } });
    if (count === 0) throw apiError("LIVE_ITEM_IN_USE", "This code already has CF orders and cannot be removed");
  }

  async requireSession(id: string) {
    const row = await this.prisma.liveSession.findUnique({ where: { id }, include: SESSION_INCLUDE });
    if (!row) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
    return row;
  }

  private async requireItem(sessionId: string, itemId: string) {
    const item = await this.prisma.liveSessionItem.findFirst({ where: { id: itemId, sessionId } });
    if (!item) throw apiError("LIVE_ITEM_NOT_FOUND", "CF code not found");
    return item;
  }

  private async requireSellableVariant(variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { sku: true, isActive: true, product: { select: { status: true } } },
    });
    if (!variant) throw apiError("VARIANT_NOT_FOUND", `Variant ${variantId} not found`);
    if (!variant.isActive || variant.product.status !== "ACTIVE") {
      throw apiError("VARIANT_NOT_AVAILABLE", `Variant ${variant.sku} is not available for sale`, { sku: variant.sku });
    }
  }
}
```
`CfIngestService` ຖືກສ້າງໃນ Task 7; ເພື່ອໃຫ້ task ນີ້ compile ໄດ້ ໃຫ້ສ້າງ **stub ຊົ່ວຄາວ** `cf-ingest.service.ts`:

```ts
import { Injectable } from "@nestjs/common";

/** stub: ຈະເຕີມ logic ໃນ Task 7 */
@Injectable()
export class CfIngestService {
  invalidate(_postId: string): void {}
}
```

- [ ] **Step 6: controller** ສ້າງ `apps/api/src/modules/live-cf/live-sessions.controller.ts`:

```ts
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type CreateLiveItemInput,
  type CreateLiveSessionInput,
  type LiveSessionListQuery,
  type UpdateLiveItemInput,
  type UpdateLiveSessionInput,
  createLiveItemSchema,
  createLiveSessionSchema,
  liveSessionListQuerySchema,
  updateLiveItemSchema,
  updateLiveSessionSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { LiveSessionsService } from "./live-sessions.service";

/** ເບິ່ງ = live-cf:read; ສ້າງ/ແກ້/ເລີ່ມ/ຈົບ/ຈັດການລະຫັດ = live-cf:write */
@Controller("live-sessions")
export class LiveSessionsController {
  constructor(@Inject(LiveSessionsService) private readonly sessions: LiveSessionsService) {}

  @Get()
  @RequirePermissions("live-cf:read")
  list(@Query(new ZodValidationPipe(liveSessionListQuerySchema)) query: LiveSessionListQuery) {
    return this.sessions.list(query);
  }

  @Post()
  @RequirePermissions("live-cf:write")
  create(
    @Body(new ZodValidationPipe(createLiveSessionSchema)) body: CreateLiveSessionInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.sessions.create(body, actor, req.ip);
  }

  @Get(":id")
  @RequirePermissions("live-cf:read")
  get(@Param("id") id: string) {
    return this.sessions.get(id);
  }

  @Patch(":id")
  @RequirePermissions("live-cf:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLiveSessionSchema)) body: UpdateLiveSessionInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.sessions.update(id, body, actor, req.ip);
  }

  @Post(":id/start")
  @HttpCode(200)
  @RequirePermissions("live-cf:write")
  start(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.sessions.start(id, actor, req.ip);
  }

  @Post(":id/end")
  @HttpCode(200)
  @RequirePermissions("live-cf:write")
  end(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.sessions.end(id, actor, req.ip);
  }

  @Post(":id/items")
  @RequirePermissions("live-cf:write")
  addItem(@Param("id") id: string, @Body(new ZodValidationPipe(createLiveItemSchema)) body: CreateLiveItemInput) {
    return this.sessions.addItem(id, body);
  }

  @Patch(":id/items/:itemId")
  @RequirePermissions("live-cf:write")
  updateItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateLiveItemSchema)) body: UpdateLiveItemInput,
  ) {
    return this.sessions.updateItem(id, itemId, body);
  }

  @Delete(":id/items/:itemId")
  @HttpCode(204)
  @RequirePermissions("live-cf:write")
  async removeItem(@Param("id") id: string, @Param("itemId") itemId: string): Promise<void> {
    await this.sessions.removeItem(id, itemId);
  }
}
```
`live-cf.module.ts` (ຍັງບໍ່ເຕັມ; Task 6-8 ຈະເພີ່ມ):

```ts
import { Module } from "@nestjs/common";
import { CfIngestService } from "./cf-ingest.service";
import { LiveSessionsController } from "./live-sessions.controller";
import { LiveSessionsService } from "./live-sessions.service";

/** Live & Post CF Engine: session/ລະຫັດ CF, ledger ຄອມເມັ້ນ, queue ປະມວນຜົນ. */
@Module({
  controllers: [LiveSessionsController],
  providers: [CfIngestService, LiveSessionsService],
  exports: [CfIngestService],
})
export class LiveCfModule {}
```

- [ ] **Step 7:** `pnpm --filter @oca/api test live-sessions` → PASS. ແລ້ວ `pnpm --filter @oca/api test permissions inbox` (sweep ເກັບ route ໃໝ່ອັດຕະໂນມັດ; inbox ຕ້ອງບໍ່ເສຍຍ້ອນຍ້າຍ `ChannelRegistry`) ແລະ `pnpm --filter @oca/api lint`. ຖ້າ test 403 ເລື່ອງ `ACCOUNTANT`/`WAREHOUSE` ຜິດ ໃຫ້ກວດ role seed (ບໍ່ຄວນມີ `live-cf:*`).

- [ ] **Step 8: commit**

```bash
git add apps/api/src/modules/channels apps/api/src/modules/inbox/inbox.module.ts apps/api/src/modules/live-cf apps/api/test/live-sessions.e2e.test.ts
git commit -m "feat(api): live sessions and CF code management API

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ຂໍ້ຄວາມສະຫຼຸບ (ບໍລິສຸດ) ແລະ ບໍລິການສົ່ງຂໍ້ຄວາມ

**Files:**
- Create: `apps/api/src/modules/live-cf/cf-summary.ts`, `cf-summary.test.ts`, `cf-reply.service.ts`

- [ ] **Step 1: test (RED)** ສ້າງ `apps/api/src/modules/live-cf/cf-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PUBLIC_REPLY_ORDERED,
  PUBLIC_REPLY_REJECTED,
  buildOrderedText,
  buildRejectedText,
  formatAmount,
  formatClock,
} from "./cf-summary";

describe("formatAmount", () => {
  it("ຕັດ .00, ໃສ່ຈຸດຄັ່ນພັນ, ຮັກສາທົດສະນິຍົມຈິງ", () => {
    expect(formatAmount("200000.00")).toBe("200,000");
    expect(formatAmount("1234567.50")).toBe("1,234,567.50");
    expect(formatAmount("0.00")).toBe("0");
    expect(formatAmount("999")).toBe("999");
  });
});

describe("formatClock", () => {
  it("ເວລາລາວ (UTC+7) HH:mm; ມື້ອື່ນໃສ່ວັນທີ dd/MM", () => {
    const now = new Date("2026-10-07T07:00:00Z"); // 14:00 ລາວ
    expect(formatClock(new Date("2026-10-07T07:35:00Z"), now)).toBe("14:35");
    expect(formatClock(new Date("2026-10-07T16:30:00Z"), now)).toBe("08/10 23:30");
    expect(formatClock(new Date("2026-10-07T17:30:00Z"), now)).toBe("08/10 00:30");
  });
});

describe("buildOrderedText", () => {
  const base = {
    orderNumber: "SO-000012",
    lines: [
      { name: "ເສື້ອ ດຳ M", quantity: 2, lineTotal: "200000.00" },
      { name: "ໝວກ", quantity: 1, lineTotal: "50000.00" },
    ],
    total: "250000.00",
    currency: "LAK",
    reservedUntil: new Date("2026-10-07T07:35:00Z"),
    paymentInstructions: "BCEL 010-12-00-12345678 ຊື່ ຮ້ານ OCA",
    now: new Date("2026-10-07T07:00:00Z"),
  };
  it("ມີເລກບິນ, ລາຍການ, ຍອດ, ເວລາໂອນ ແລະ ຂໍ້ມູນໂອນ", () => {
    const text = buildOrderedText(base);
    expect(text).toContain("SO-000012");
    expect(text).toContain("ເສື້ອ ດຳ M x2 = 200,000");
    expect(text).toContain("ໝວກ x1 = 50,000");
    expect(text).toContain("250,000 LAK");
    expect(text).toContain("14:35");
    expect(text).toContain("BCEL 010-12-00-12345678 ຊື່ ຮ້ານ OCA");
  });
  it("ບໍ່ມີຂໍ້ມູນໂອນ/ເວລາໝົດ → ບໍ່ຂຽນແຖວນັ້ນ", () => {
    const text = buildOrderedText({ ...base, paymentInstructions: null, reservedUntil: null });
    expect(text).not.toContain("BCEL");
    expect(text).not.toContain("ກະລຸນາໂອນກ່ອນ");
  });
});

describe("buildRejectedText", () => {
  it("ໝົດ / ຄົບຈຳນວນ ລະບຸລະຫັດ", () => {
    expect(buildRejectedText("OUT_OF_STOCK", ["A1", "B02"])).toContain("A1, B02");
    expect(buildRejectedText("OUT_OF_STOCK", ["A1"])).toContain("ໝົດ");
    expect(buildRejectedText("LIMIT_REACHED", ["A1"])).toContain("ຄົບ");
  });
  it("ຂໍ້ຄວາມຄອມເມັ້ນສາທາລະນະເປັນຄ່າຄົງທີ່ທີ່ບໍ່ຮົ່ວຂໍ້ມູນລູກຄ້າ", () => {
    expect(PUBLIC_REPLY_ORDERED).not.toMatch(/SO-|\d{4}/);
    expect(PUBLIC_REPLY_REJECTED.length).toBeGreaterThan(0);
  });
});
```
ແລ່ນ `pnpm --filter @oca/api test cf-summary` → FAIL.

- [ ] **Step 2: implementation** ສ້າງ `cf-summary.ts`:

```ts
const LAO_OFFSET_MS = 7 * 60 * 60 * 1000;

export const PUBLIC_REPLY_ORDERED = "ຮັບ CF ແລ້ວ ກະລຸນາກວດຂໍ້ຄວາມໃນແຊັດ 🙏";
export const PUBLIC_REPLY_REJECTED = "ຂໍໂທດ ຮັບ CF ບໍ່ໄດ້ (ສິນຄ້າໝົດ ຫຼື ຄົບຈຳນວນແລ້ວ) ກະລຸນາກວດຂໍ້ຄວາມໃນແຊັດ";

/** "200000.00" → "200,000"; "1234567.50" → "1,234,567.50" */
export function formatAmount(value: string): string {
  const [integer = "0", fraction = ""] = value.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return /^0*$/.test(fraction) ? grouped : `${grouped}.${fraction}`;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** ເວລາລາວ (UTC+7). ຖ້າບໍ່ແມ່ນມື້ດຽວກັບ `now` ໃສ່ `dd/MM` ນຳໜ້າ */
export function formatClock(date: Date, now: Date = new Date()): string {
  const lao = new Date(date.getTime() + LAO_OFFSET_MS);
  const laoNow = new Date(now.getTime() + LAO_OFFSET_MS);
  const clock = `${pad(lao.getUTCHours())}:${pad(lao.getUTCMinutes())}`;
  const sameDay =
    lao.getUTCFullYear() === laoNow.getUTCFullYear() &&
    lao.getUTCMonth() === laoNow.getUTCMonth() &&
    lao.getUTCDate() === laoNow.getUTCDate();
  return sameDay ? clock : `${pad(lao.getUTCDate())}/${pad(lao.getUTCMonth() + 1)} ${clock}`;
}

export interface OrderedTextInput {
  orderNumber: string;
  lines: { name: string; quantity: number; lineTotal: string }[];
  total: string;
  currency: string;
  reservedUntil: Date | null;
  paymentInstructions: string | null;
  now?: Date;
}

export function buildOrderedText(input: OrderedTextInput): string {
  const rows = input.lines.map((line) => `• ${line.name} x${line.quantity} = ${formatAmount(line.lineTotal)}`);
  const parts = [`✅ ຮັບ CF ແລ້ວ ບິນ ${input.orderNumber}`, ...rows, `ລວມ ${formatAmount(input.total)} ${input.currency}`];
  if (input.reservedUntil) {
    parts.push(`ກະລຸນາໂອນກ່ອນ ${formatClock(input.reservedUntil, input.now)} (ຖ້າບໍ່ໂອນ ລະບົບຈະຄືນສິນຄ້າ)`);
  }
  if (input.paymentInstructions?.trim()) parts.push(input.paymentInstructions.trim());
  return parts.join("\n");
}

export function buildRejectedText(kind: "OUT_OF_STOCK" | "LIMIT_REACHED", codes: string[]): string {
  const list = codes.join(", ");
  return kind === "OUT_OF_STOCK"
    ? `ຂໍໂທດ ລະຫັດ ${list} ໝົດແລ້ວ ຮັບ CF ບໍ່ໄດ້`
    : `ຂໍໂທດ ລະຫັດ ${list} ຄົບຈຳນວນທີ່ເປີດຮັບແລ້ວ`;
}
```
`pnpm --filter @oca/api test cf-summary` → PASS.

- [ ] **Step 3: CfReplyService** (ຕາມຫຼັງຈະຖືກ test ຜ່ານ e2e ຂອງ Task 7/8) ສ້າງ `cf-reply.service.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { PRISMA } from "../../prisma/prisma.module";
import { ChannelRegistry } from "../inbox/channel-registry";
import {
  PUBLIC_REPLY_ORDERED,
  PUBLIC_REPLY_REJECTED,
  buildOrderedText,
  buildRejectedText,
} from "./cf-summary";

interface LedgerLine {
  itemId: string;
  code: string;
  quantity: number;
}

function ledgerLines(value: unknown): LedgerLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    typeof entry === "object" && entry !== null && typeof (entry as LedgerLine).code === "string"
      ? [entry as LedgerLine]
      : [],
  );
}

/** ສົ່ງສະຫຼຸບຫາຜູ້ຄອມເມັ້ນ (Private Reply) ຫຼັງ ledger ຖືກບັນທຶກ. ບໍ່ throw: ລົ້ມ = replyStatus FAILED ໃຫ້ແອດມິນສົ່ງໃໝ່ */
@Injectable()
export class CfReplyService {
  private readonly logger = new Logger(CfReplyService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
  ) {}

  async deliver(ledgerId: string): Promise<void> {
    try {
      await this.deliverOnce(ledgerId);
    } catch (error) {
      this.logger.error(`deliver failed for ${ledgerId} (${error instanceof Error ? error.name : "UnknownError"})`);
      await this.prisma.cfComment
        .updateMany({ where: { id: ledgerId, replyStatus: { not: "SENT" } }, data: { replyStatus: "FAILED", replyErrorCode: "CHANNEL_UNAVAILABLE" } })
        .catch(() => undefined);
    }
  }

  private async deliverOnce(ledgerId: string): Promise<void> {
    const row = await this.prisma.cfComment.findUnique({
      where: { id: ledgerId },
      include: { session: { select: { publicReplyEnabled: true } }, order: { include: { items: { orderBy: { id: "asc" } } } } },
    });
    if (!row || row.replyStatus === "SENT") return;
    if (row.outcome !== "ORDERED" && row.outcome !== "OUT_OF_STOCK" && row.outcome !== "LIMIT_REACHED") return;

    let text: string;
    if (row.outcome === "ORDERED") {
      if (!row.order) return;
      const settings = await this.prisma.storeSetting.findUnique({ where: { id: 1 }, select: { paymentInstructions: true } });
      text = buildOrderedText({
        orderNumber: row.order.orderNumber,
        lines: row.order.items.map((item) => ({
          name: [item.productName, item.variantName].filter(Boolean).join(" "),
          quantity: item.quantity,
          lineTotal: item.lineTotal.toFixed(2),
        })),
        total: row.order.total.toFixed(2),
        currency: row.order.currency,
        reservedUntil: row.order.reservedUntil,
        paymentInstructions: settings?.paymentInstructions ?? null,
      });
    } else {
      text = buildRejectedText(row.outcome, ledgerLines(row.lines).map((line) => line.code));
    }

    const adapter = this.channels.facebook;
    const firstAttempt = row.replyStatus === "NONE";
    const result = await adapter.sendPrivateReply(row.externalCommentId, text);
    await this.prisma.cfComment.update({
      where: { id: ledgerId },
      data: result.ok ? { replyStatus: "SENT", replyErrorCode: null } : { replyStatus: "FAILED", replyErrorCode: result.code },
    });

    // ຕອບຄອມເມັ້ນສາທາລະນະ: ສະເພາະຄັ້ງທຳອິດ (ກັນຊ້ຳເມື່ອ resend) ແລະ ບໍ່ບອກໃຫ້ກວດແຊັດຖ້າຂໍ້ຄວາມສ່ວນຕົວສົ່ງບໍ່ຜ່ານ
    if (firstAttempt && row.session.publicReplyEnabled && (result.ok || row.outcome !== "ORDERED")) {
      const publicText = row.outcome === "ORDERED" ? PUBLIC_REPLY_ORDERED : PUBLIC_REPLY_REJECTED;
      const publicResult = await adapter.replyToComment(row.externalCommentId, publicText);
      if (!publicResult.ok) this.logger.warn(`public reply failed for ${ledgerId}: ${publicResult.code}`);
    }
  }
}
```
(`order.currency` ເປັນ enum string "LAK"... ຕົງກັບ `currency: string`.)

- [ ] **Step 4:** `pnpm --filter @oca/api lint && pnpm --filter @oca/api exec tsc --noEmit -p tsconfig.json` → PASS. (ຍັງບໍ່ລົງທະບຽນ service ໃນ module; Task 7.)

- [ ] **Step 5: commit**

```bash
git add apps/api/src/modules/live-cf/cf-summary.ts apps/api/src/modules/live-cf/cf-summary.test.ts apps/api/src/modules/live-cf/cf-reply.service.ts
git commit -m "feat(api): CF summary text and Private Reply delivery

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Processor, queue, webhook ingest (ຫົວໃຈຂອງ CF)

**Files:**
- Create: `apps/api/src/modules/live-cf/cf-processor.service.ts`, `cf-queue.service.ts`, `apps/api/test/cf-engine.e2e.test.ts`
- Modify: `apps/api/src/modules/live-cf/cf-ingest.service.ts` (ແທນ stub), `live-cf.module.ts`, `apps/api/src/modules/inbox/inbox.module.ts`, `facebook-webhook.controller.ts`, `apps/api/src/config/env.ts`, `apps/api/test/setup.ts`, `apps/api/package.json` (ເພີ່ມ `bullmq`)

- [ ] **Step 1: dependency + env.** `pnpm --filter @oca/api add bullmq@^5.81.5` (ເວີຊັນເທົ່າກັບ worker). ໃນ `config/env.ts` ເພີ່ມໃນ object ຫຼັງ `REDIS_URL`:
```ts
    QUEUE_PREFIX: z.string().min(1).default("oca"),
```
ໃນ `apps/api/test/setup.ts` ຕໍ່ທ້າຍ (ຫຼັງ `LOGIN_RATE_LIMIT`):
```ts
// prefix ສະເພາະຮອບ test: ບໍ່ໃຫ້ API/worker dev ຂອງຜູ້ໃຊ້ (prefix "oca") ມາຍາດ job ຂອງ test
process.env.QUEUE_PREFIX = `oca-test-${process.pid}`;
```
ຖ້າ `env.test.ts` ກວດ default ທັງ object ໃຫ້ເພີ່ມ `QUEUE_PREFIX: "oca"`.

- [ ] **Step 2: test e2e (RED)** ສ້າງ `apps/api/test/cf-engine.e2e.test.ts`. Setup: graph fake + app ຄືກັບ `inbox-webhook.e2e.test.ts` (SECRET, PAGE, token). ຕົວຊ່ວຍ:

```ts
import type { INestApplication } from "@nestjs/common";
import { signBody } from "@oca/channels";
import * as simulator from "@oca/channels/simulator";
import { type PrismaClient, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, expectLedgerMatches, resetDb, seedCatalog, seedLiveSession } from "./helpers";

const SECRET = "app-secret-test";
const PAGE = "PAGE1";
const POST = "PAGE1_POST1";

describe("CF engine (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let graph: simulator.FakeGraph;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let seq = 0;
  const server = () => app.getHttpServer();

  const postWebhook = (payload: object) => {
    const raw = JSON.stringify(payload);
    return request(server()).post("/webhooks/facebook").set("content-type", "application/json").set("x-hub-signature-256", signBody(SECRET, raw)).send(raw);
  };
  const comment = (fromId: string, message: string, overrides: { commentId?: string; postId?: string } = {}) => {
    seq += 1;
    const commentId = overrides.commentId ?? `${POST}_c${seq}`;
    return postWebhook(simulator.commentPayload({ pageId: PAGE, postId: overrides.postId ?? POST, commentId, fromId, fromName: `User ${fromId}`, message })).then((res) => ({ res, commentId }));
  };
  const ledgerOf = (commentId: string) =>
    vi.waitFor(async () => {
      const row = await db.cfComment.findUnique({ where: { externalCommentId: commentId }, include: { order: { include: { items: true } } } });
      expect(row).not.toBeNull();
      return row;
    }, { timeout: 8000, interval: 50 });
  const settled = (commentId: string) =>
    vi.waitFor(async () => {
      const row = await db.cfComment.findUniqueOrThrow({ where: { externalCommentId: commentId }, include: { order: { include: { items: true } } } });
      expect(row.replyStatus).not.toBe("NONE");
      return row;
    }, { timeout: 8000, interval: 50 });

  beforeAll(async () => {
    graph = await simulator.startFakeGraph({ token: "page-token" });
    ({ app, db } = await createTestApp({
      FACEBOOK_APP_SECRET: SECRET,
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "verify-me",
      FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
      FACEBOOK_GRAPH_BASE_URL: graph.url,
    }));
  });
  afterAll(async () => {
    await app.close();
    await graph.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    graph.reset();
    seq = 0;
    f = await seedCatalog(db);
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 5 });
    });
  });
  const liveSession = (items = [{ code: "A1", variantId: "", limit: null as number | null }, { code: "B02", variantId: "", limit: null as number | null }]) =>
    seedLiveSession(db, { externalPostId: POST, items: items.map((item, index) => ({ ...item, variantId: index === 0 ? f.v1.id : f.v2.id })) });
  const reserved = async (variantId: string) => (await db.stockLevel.findFirstOrThrow({ where: { variantId, warehouseId: f.whA.id } })).reserved;
```

ກໍລະນີ (ແຕ່ລະອັນຂຽນເປັນ `it` ເຕັມ):
1. **ເສັ້ນທາງຫຼັກ:** `liveSession()`; `await db.storeSetting.upsert(... paymentInstructions: "BCEL 123")` (ໃຊ້ `db.storeSetting.upsert({where:{id:1}, create:{id:1,name:"S",paymentInstructions:"BCEL 123"}, update:{paymentInstructions:"BCEL 123"}})`); `const {res, commentId} = await comment("U1", "CF A1 2")`; `expect(res.status).toBe(200)`; `row = await settled(commentId)` → `outcome "ORDERED"`, `replyStatus "SENT"`, order: `source LIVE_CF`, `channel FACEBOOK`, `liveSessionId`, items `[{sku SKU-1, quantity 2}]`, `status PENDING_PAYMENT`; customer: `facebookUserId "U1"` name `"User U1"`; `reserved(f.v1.id)` 2; item.claimed 2; `graph.privateReplies` length 1 with `commentId` & text contains order number + "BCEL 123"; `graph.commentReplies` length 1 text `PUBLIC_REPLY_ORDERED` (import from cf-summary or literal contains "ຮັບ CF ແລ້ວ"); `expectLedgerMatches(db)`.
2. **ຄອມເມັ້ນບໍ່ແມ່ນ CF:** "ລາຄາເທົ່າໃດ" → ledger NO_MATCH, ບໍ່ມີ order, ບໍ່ມີ reply (`graph.privateReplies` ວ່າງ — ລໍ ledger ກ່ອນ ແລ້ວ `expect(...).toHaveLength(0)`).
3. **ໂພສບໍ່ແມ່ນ session LIVE:** comment ດ້ວຍ `postId: "OTHER"` → 200, ລໍ ~300ms ແລ້ວ `db.cfComment.count()` = 0; session DRAFT/ENDED ກໍບໍ່ມີ ledger.
4. **commentId ຊ້ຳ:** ສົ່ງ comment ດຽວກັນ 2 ຄັ້ງ (`overrides.commentId`) → ຫຼັງ `settled` ຍັງມີ order 1 ໃບ ແລະ `cfComment.count()` 1, `reserved` 1 ຄັ້ງ.
5. **ສະຕ໋ອກບໍ່ພໍ:** `CF A1 9` (ມີ 5) → outcome OUT_OF_STOCK, replyStatus SENT, ບໍ່ມີ order (`db.order.count()` 0), reserved 0, private reply text ມີ "A1" ແລະ "ໝົດ", public reply `PUBLIC_REPLY_REJECTED`.
6. **all-or-nothing:** `CF A1 2 B02 9` → OUT_OF_STOCK, reserved v1 = 0 (ບໍ່ຈອງ A1).
7. **limit:** session ທີ່ A1 limit 3: U1 `A1 2` ORDERED; U2 `A1 2` → LIMIT_REACHED (claimed ຍັງ 2); U3 `A1` → ORDERED (claimed 3); U4 `A1` → LIMIT_REACHED.
8. **merge:** U1 `A1` ແລ້ວ `B02 2` (ລໍ settled ແຕ່ລະອັນ) → `db.order.count()` 1; items 2 ແຖວ; total 300; ຄັ້ງທີ 2 ledger ຊີ້ `orderId` ດຽວກັນ; `reservedUntil` ຄັ້ງຫຼັງ ≥ ຄັ້ງກ່ອນ; ລະຫັດຊ້ຳ `A1` ອີກ → quantity 2 ໃນແຖວ A1.
9. **ບິນເກົ່າບໍ່ merge:** ຫຼັງ U1 CF ແລ້ວ `db.order.updateMany({status:"PAID"})` (ຫຼື ຕັ້ງ `reservedUntil` ໃນອະດີດ) → CF ຕໍ່ໄປໄດ້ບິນໃໝ່ (count 2).
10. **ແຂ່ງກັນ:** ສະຕ໋ອກ A1 = 1 (ລຸດ: `receive` ຕັ້ງ 5 ໃນ beforeEach ຈຶ່ງໃຊ້ session ທີ່ A1 limit 1 ແທນ) 5 ຄົນ (U1..U5) ຍິງ `A1` ພ້ອມກັນ (`Promise.all`) → ledger ORDERED ຢ່າງຖືກ 1 ອັນ ແລະ LIMIT_REACHED 4 ອັນ; `claimed` = 1.
11. **ສົ່ງ private reply ລົ້ມ:** `graph.failNext({status:400, code:100, message:"(#100) bad"})` ກ່ອນ comment → ledger ORDERED, `replyStatus FAILED`, `replyErrorCode SEND_REJECTED`, ບິນຍັງຢູ່; ບໍ່ມີ public reply (ORDERED + private ລົ້ມ).
12. **publicReplyEnabled=false:** private reply ສົ່ງ ແຕ່ `graph.commentReplies` ວ່າງ.
13. **ລູກຄ້າຄົນເກົ່າ:** U1 CF ໃນ 2 session ຕ່າງກັນ (ໂພສຕ່າງກັນ) → `db.customer.count()` 1.
14. **webhook ສັນຍານ:** payload ຄອມເມັ້ນທີ່ເຊັນຜິດ → 401 ແລະ ບໍ່ມີ ledger (ກວດພຽງນີ້ເພີ່ມ: ໃຊ້ `postWebhook` ແບບ header ຜິດ).
15. **ຄອມເມັ້ນຂອງ Page ເອງ:** `fromId: PAGE` → ບໍ່ມີ ledger.

ແລ່ນ → FAIL.

- [ ] **Step 3: CfProcessorService** ສ້າງ `cf-processor.service.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { InsufficientStockError, type Prisma, type PrismaClient } from "@oca/database";
import { parseCf } from "@oca/shared";
import { PRISMA } from "../../prisma/prisma.module";
import { OrdersService } from "../orders/orders.service";
import { CfReplyService } from "./cf-reply.service";

export interface CfCommentJob {
  sessionId: string;
  commentId: string;
  postId: string;
  authorId: string;
  authorName: string;
  message: string;
}

/** ເກີນ limit ຂອງລະຫັດ: ໂຍນໃນ transaction ເພື່ອ rollback */
class CfLimitReachedError extends Error {
  constructor() {
    super("CF limit reached");
    this.name = "CfLimitReachedError";
  }
}

interface ResolvedLine {
  itemId: string;
  code: string;
  variantId: string;
  quantity: number;
}

type Placed = { duplicate: true } | { duplicate: false; ledgerId: string };

@Injectable()
export class CfProcessorService {
  private readonly logger = new Logger(CfProcessorService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(CfReplyService) private readonly replies: CfReplyService,
  ) {}

  /** ປະມວນຜົນ 1 ຄອມເມັ້ນ. ບໍ່ throw ສຳລັບຄວາມຜິດພາດຂອງທຸລະກິດ (ບັນທຶກເປັນ outcome ໃນ ledger); idempotent ດ້ວຍ externalCommentId */
  async process(job: CfCommentJob): Promise<void> {
    const session = await this.prisma.liveSession.findUnique({ where: { id: job.sessionId }, include: { items: true } });
    // ຈົບ/ຍັງບໍ່ເລີ່ມແລ້ວ: ຂ້າມ (ຄອມເມັ້ນທີ່ເຂົ້າ queue ກ່ອນຈົບ ແຕ່ມາຖືກປະມວນຜົນຫຼັງຈົບ ບໍ່ຈອງ)
    if (!session || session.status !== "LIVE") return;
    if (await this.prisma.cfComment.findUnique({ where: { externalCommentId: job.commentId }, select: { id: true } })) return;

    const parsed = parseCf(job.message, session.items.map((item) => item.code));
    if (!parsed) {
      await this.record(job, { outcome: "NO_MATCH" });
      return;
    }
    const itemByCode = new Map(session.items.map((item) => [item.code, item]));
    const lines: ResolvedLine[] = parsed.flatMap((line) => {
      const item = itemByCode.get(line.code);
      return item ? [{ itemId: item.id, code: item.code, variantId: item.variantId, quantity: line.quantity }] : [];
    });
    if (lines.length !== parsed.length) {
      await this.record(job, { outcome: "ERROR" });
      return;
    }

    let placed: Placed;
    try {
      placed = await this.prisma.$transaction((tx) => this.place(tx, job, session, lines), { timeout: 20_000, maxWait: 15_000 });
    } catch (error) {
      placed = await this.recordFailure(job, lines, error);
    }
    if (!placed.duplicate) await this.replies.deliver(placed.ledgerId);
  }

  private async place(
    tx: Prisma.TransactionClient,
    job: CfCommentJob,
    session: { id: string; title: string; kind: "LIVE" | "POST" },
    lines: ResolvedLine[],
  ): Promise<Placed> {
    // ຄອມເມັ້ນຂອງ session ດຽວກັນເຂົ້າທີລະອັນ: limit ຕໍ່ລະຫັດ ແລະ merge ບິນຕ້ອງ atomic
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cf:${session.id}`}))`;
    if (await tx.cfComment.findUnique({ where: { externalCommentId: job.commentId }, select: { id: true } })) {
      return { duplicate: true };
    }

    const fresh = await tx.liveSessionItem.findMany({ where: { id: { in: lines.map((line) => line.itemId) } } });
    const freshById = new Map(fresh.map((item) => [item.id, item]));
    for (const line of lines) {
      const item = freshById.get(line.itemId);
      if (!item) throw new Error("CF item disappeared");
      if (item.limit !== null && item.claimed + line.quantity > item.limit) throw new CfLimitReachedError();
    }

    await tx.customer.createMany({ data: [{ name: job.authorName, facebookUserId: job.authorId }], skipDuplicates: true });
    const customer = await tx.customer.findUniqueOrThrow({ where: { facebookUserId: job.authorId } });

    // ສອງລະຫັດຊີ້ variant ດຽວກັນ → ລວມຈຳນວນ (ບິນບໍ່ມີແຖວ variant ຊ້ຳ)
    const byVariant = new Map<string, number>();
    for (const line of lines) byVariant.set(line.variantId, (byVariant.get(line.variantId) ?? 0) + line.quantity);
    const additions = [...byVariant].map(([variantId, quantity]) => ({ variantId, quantity }));

    const open = await tx.order.findFirst({
      where: { liveSessionId: session.id, customerId: customer.id, status: "PENDING_PAYMENT", reservedUntil: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    let orderId: string;
    if (open) {
      await this.orders.appendItemsInTx(tx, open.id, additions, null);
      orderId = open.id;
    } else {
      orderId = await this.orders.createCfOrderInTx(
        tx,
        {
          customerId: customer.id,
          items: additions.map((addition) => ({ ...addition, discount: "0" })),
          shippingFee: "0",
          note: `CF ${session.title}`.slice(0, 500),
        },
        { channel: "FACEBOOK", source: session.kind === "LIVE" ? "LIVE_CF" : "POST_CF", liveSessionId: session.id },
      );
    }

    for (const line of lines) {
      await tx.liveSessionItem.update({ where: { id: line.itemId }, data: { claimed: { increment: line.quantity } } });
    }
    const ledger = await tx.cfComment.create({
      data: {
        externalCommentId: job.commentId,
        sessionId: session.id,
        authorExternalId: job.authorId,
        authorName: job.authorName,
        message: job.message,
        outcome: "ORDERED",
        lines: lines.map(({ itemId, code, quantity }) => ({ itemId, code, quantity })),
        orderId,
      },
      select: { id: true },
    });
    return { duplicate: false, ledgerId: ledger.id };
  }

  private async recordFailure(job: CfCommentJob, lines: ResolvedLine[], error: unknown): Promise<Placed> {
    const detail = lines.map(({ itemId, code, quantity }) => ({ itemId, code, quantity }));
    if (error instanceof InsufficientStockError) return this.record(job, { outcome: "OUT_OF_STOCK", lines: detail });
    if (error instanceof CfLimitReachedError) return this.record(job, { outcome: "LIMIT_REACHED", lines: detail });
    // ບັນທຶກສະເພາະຊື່ error (ບໍ່ເອົາ payload/ຄວາມລັບລົງ log); ບໍ່ retry ເພື່ອບໍ່ຈອງຊ້ຳ
    this.logger.error(`CF comment ${job.commentId} failed (${error instanceof Error ? error.name : "UnknownError"})`);
    return this.record(job, { outcome: "ERROR", lines: detail });
  }

  /** ບັນທຶກ ledger ທີ່ບໍ່ມີບິນ. ON CONFLICT DO NOTHING ເພື່ອກັນ job ຊ້ຳ; ຄືນ duplicate ຖ້າມີແລ້ວ */
  private async record(
    job: CfCommentJob,
    data: { outcome: "NO_MATCH" | "OUT_OF_STOCK" | "LIMIT_REACHED" | "ERROR"; lines?: Prisma.InputJsonValue },
  ): Promise<Placed> {
    const sessionId = job.sessionId;
    const { count } = await this.prisma.cfComment.createMany({
      data: [
        {
          externalCommentId: job.commentId,
          sessionId,
          authorExternalId: job.authorId,
          authorName: job.authorName,
          message: job.message,
          outcome: data.outcome,
          lines: data.lines,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return { duplicate: true };
    const row = await this.prisma.cfComment.findUniqueOrThrow({ where: { externalCommentId: job.commentId }, select: { id: true } });
    // NO_MATCH/ERROR ບໍ່ສົ່ງຂໍ້ຄວາມ (deliver ຂ້າມເອງ) ແຕ່ຄືນ id ເພື່ອໃຫ້ flow ດຽວກັນ
    return { duplicate: false, ledgerId: row.id };
  }
}
```
ໝາຍເຫດ: `record` ຂອງ NO_MATCH ຈາກ `process()` ບໍ່ໃຊ້ຜົນຄືນ; ຖືກ. `lines` ເປັນ `undefined` ສຳລັບ NO_MATCH (ຄ່າ default Json null).

- [ ] **Step 4: CfIngestService** (ແທນ stub) `cf-ingest.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { CommentEvent } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import { PRISMA } from "../../prisma/prisma.module";
import { CfQueueService } from "./cf-queue.service";

const CACHE_TTL_MS = 3000;

/** ຈາກ webhook: ກອງຄອມເມັ້ນຂອງໂພສທີ່ມີ session LIVE ແລ້ວໂຍນເຂົ້າ queue (ບໍ່ປະມວນຜົນໃນ request ຂອງ Meta) */
@Injectable()
export class CfIngestService {
  private readonly cache = new Map<string, { sessionId: string | null; expires: number }>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CfQueueService) private readonly queue: CfQueueService,
  ) {}

  /** ຄືນຈຳນວນທີ່ເຂົ້າ queue. queue ລົ້ມ (Redis) = throw → webhook 500 ໃຫ້ Meta ສົ່ງຊ້ຳ (jobId ກັນຊ້ຳ) */
  async enqueue(events: readonly CommentEvent[]): Promise<number> {
    let queued = 0;
    for (const event of events) {
      const sessionId = await this.liveSessionIdFor(event.postId);
      if (!sessionId) continue;
      await this.queue.add({
        sessionId,
        commentId: event.commentId,
        postId: event.postId,
        authorId: event.authorId,
        authorName: event.authorName,
        message: event.message,
      });
      queued += 1;
    }
    return queued;
  }

  /** ເອີ້ນເມື່ອ session start/end ເພື່ອບໍ່ໃຫ້ cache ເກົ່າບັງ session ໃໝ່ */
  invalidate(postId: string): void {
    this.cache.delete(postId);
  }

  private async liveSessionIdFor(postId: string): Promise<string | null> {
    const cached = this.cache.get(postId);
    if (cached && cached.expires > Date.now()) return cached.sessionId;
    const session = await this.prisma.liveSession.findFirst({
      where: { externalPostId: postId, status: "LIVE" },
      select: { id: true },
    });
    this.cache.set(postId, { sessionId: session?.id ?? null, expires: Date.now() + CACHE_TTL_MS });
    return session?.id ?? null;
  }
}
```

- [ ] **Step 5: CfQueueService** `cf-queue.service.ts`:

```ts
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { ENV, type Env } from "../../config/env";
import { type CfCommentJob, CfProcessorService } from "./cf-processor.service";

export const QUEUE_CF_COMMENTS = "cf-comments";
const JOB_COMMENT = "comment";
const CONCURRENCY = 4;
const CLOSE_TIMEOUT_MS = 2000;

/** queue ຄອມເມັ້ນ CF ແລະ consumer ໃນ process ຂອງ API. ບໍ່ block ການ boot ເມື່ອ Redis ຍັງບໍ່ພ້ອມ (bullmq ຈະ reconnect ເອງ) */
@Injectable()
export class CfQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CfQueueService.name);
  private connection: Redis | undefined;
  private queue: Queue<CfCommentJob> | undefined;
  private worker: Worker<CfCommentJob> | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CfProcessorService) private readonly processor: CfProcessorService,
  ) {}

  onModuleInit(): void {
    // Worker ຕ້ອງ maxRetriesPerRequest: null (blocking commands)
    this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on("error", (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    const options = { connection: this.connection, prefix: this.env.QUEUE_PREFIX };
    this.queue = new Queue<CfCommentJob>(QUEUE_CF_COMMENTS, options);
    this.queue.on("error", (error) => this.logger.warn(`queue: ${error.message}`));
    this.worker = new Worker<CfCommentJob>(QUEUE_CF_COMMENTS, (job) => this.processor.process(job.data), {
      ...options,
      concurrency: CONCURRENCY,
    });
    this.worker.on("failed", (job, error) => this.logger.error(`job ${job?.id} failed: ${error.name}`));
    this.worker.on("error", (error) => this.logger.warn(`worker: ${error.message}`));
  }

  async add(job: CfCommentJob): Promise<void> {
    if (!this.queue) throw new Error("CF queue is not initialised");
    await this.queue.add(JOB_COMMENT, job, {
      // bullmq ຫ້າມ ":" ໃນ custom id; commentId ຂອງ Facebook ເປັນ "<ເລກ>_<ເລກ>" ຢູ່ແລ້ວ
      jobId: job.commentId.replaceAll(":", "_"),
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
      attempts: 1,
    });
  }

  async onModuleDestroy(): Promise<void> {
    const closing = Promise.allSettled([this.worker?.close(), this.queue?.close()]);
    await Promise.race([closing, new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS))]);
    this.connection?.disconnect();
  }
}
```
ໝາຍເຫດ: ຖ້າ `worker.close()` ຄ້າງຍ້ອນ job ກຳລັງແລ່ນ ໃຫ້ race ຕັດ; ຖ້າ test ເຕືອນ open handle ໃຫ້ເພີ່ມ `await this.worker?.close(true)` (force).

- [ ] **Step 6: wiring.**
`live-cf.module.ts` ເຕັມ:

```ts
import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { OrdersModule } from "../orders/orders.module";
import { CfIngestService } from "./cf-ingest.service";
import { CfProcessorService } from "./cf-processor.service";
import { CfQueueService } from "./cf-queue.service";
import { CfReplyService } from "./cf-reply.service";
import { LiveSessionsController } from "./live-sessions.controller";
import { LiveSessionsService } from "./live-sessions.service";

/** Live & Post CF Engine: session/ລະຫັດ CF, ledger ຄອມເມັ້ນ, queue ປະມວນຜົນ. */
@Module({
  imports: [ChannelsModule, OrdersModule],
  controllers: [LiveSessionsController],
  providers: [CfIngestService, CfProcessorService, CfQueueService, CfReplyService, LiveSessionsService],
  exports: [CfIngestService, CfReplyService],
})
export class LiveCfModule {}
```
`inbox.module.ts`: `imports: [ChannelsModule, LiveCfModule]`.
`facebook-webhook.controller.ts`: ເພີ່ມ import `CfIngestService` ຈາກ `../live-cf/cf-ingest.service`, constructor `@Inject(CfIngestService) private readonly cf: CfIngestService,`, ແລະໃນ `receive` ຫຼັງແຖວ `if (!req.rawBody || ...) throw new UnauthorizedException();`:

```ts
    // ຄອມເມັ້ນ CF: ເຂົ້າ queue (ລົ້ມ = 500 ໃຫ້ Meta ສົ່ງຊ້ຳ; jobId ກັນຊ້ຳ). ບໍ່ປະມວນຜົນໃນ request
    const comments = adapter.parseComments(body);
    const queuedComments = comments.length > 0 ? await this.cf.enqueue(comments) : 0;
```
ແລະ return ຕອນທ້າຍ: ປ່ຽນ `return failed > 0 ? {...} : { received: events.length };` ເປັນ:

```ts
    const base = failed > 0 ? { received: events.length - failed, failed } : { received: events.length };
    return queuedComments > 0 ? { ...base, comments: queuedComments } : base;
```
ແລະ ປັບ return type ເປັນ `Promise<{ received: number; failed?: number; comments?: number }>`.

- [ ] **Step 7:** `pnpm --filter @oca/api test cf-engine` → PASS ທັງ 15 ກໍລະນີ. ຖ້າກໍລະນີ "ແຂ່ງກັນ" flaky ໃຫ້ກວດ advisory lock (ຕ້ອງໃຊ້ `$executeRaw` ໃນ `tx`). ແລ້ວແລ່ນທັງ api: `pnpm --filter @oca/api test` ແລະ `pnpm --filter @oca/api lint`. ຕ້ອງກວດວ່າ test inbox-webhook ເດີມຍັງຜ່ານ (body ຂອງ response ບໍ່ປ່ຽນເມື່ອບໍ່ມີຄອມເມັ້ນ).

- [ ] **Step 8: commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src apps/api/test/setup.ts apps/api/test/cf-engine.e2e.test.ts
git commit -m "feat(api): CF engine: queue, processor, order merge and Private Reply delivery

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ledger API ແລະ resend

**Files:**
- Create: `apps/api/src/modules/live-cf/cf-comments.controller.ts`, `apps/api/src/modules/live-cf/cf-comments.service.ts`
- Modify: `live-cf.module.ts`, `apps/api/test/cf-engine.e2e.test.ts` (ເພີ່ມ describe)

- [ ] **Step 1: test (RED)** ເພີ່ມທ້າຍ `cf-engine.e2e.test.ts` (ໃນ describe ເດີມ ເພື່ອໃຊ້ helper ຮ່ວມ; ຕ້ອງ `seedRoleUsers`+`bearerFor` ໃນ `beforeEach` ຂອງ describe ໃໝ່):

```ts
  describe("ledger API", () => {
    let auth: { Authorization: string };
    beforeEach(async () => {
      await seedRoleUsers(db);
      auth = await bearerFor(app, "chat_admin@role.test");
    });

    it("GET /live-sessions/:id/comments: ແບ່ງໜ້າ, ກອງ outcome, ມີ orderNumber, ໃໝ່ສຸດກ່ອນ", async () => {
      const s = await liveSession();
      const a = await comment("U1", "A1");
      const b = await comment("U2", "ສະບາຍດີ");
      await settled(a.commentId);
      await ledgerOf(b.commentId);
      const all = await request(server()).get(`/live-sessions/${s.id}/comments`).set(auth).expect(200);
      expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 50 });
      expect(all.body.items.map((item: { externalCommentId: string }) => item.externalCommentId)).toEqual([b.commentId, a.commentId]);
      const ordered = await request(server()).get(`/live-sessions/${s.id}/comments?outcome=ORDERED`).set(auth).expect(200);
      expect(ordered.body.total).toBe(1);
      expect(ordered.body.items[0]).toMatchObject({ outcome: "ORDERED", replyStatus: "SENT", authorName: "User U1" });
      expect(ordered.body.items[0].orderNumber).toMatch(/^SO-/);
      await request(server()).get(`/live-sessions/${s.id}/comments?outcome=NOPE`).set(auth).expect(400);
      const missing = await request(server()).get("/live-sessions/nope/comments").set(auth).expect(404);
      expect(missing.body.code).toBe("LIVE_SESSION_NOT_FOUND");
    });

    it("resend: ສົ່ງ FAILED ໃໝ່ສຳເລັດ → SENT, ບໍ່ສ້າງບິນຊ້ຳ, ບໍ່ຕອບຄອມເມັ້ນສາທາລະນະຊ້ຳ", async () => {
      const s = await liveSession();
      graph.failNext({ status: 500, code: 2, message: "boom" });
      const { commentId } = await comment("U1", "A1");
      const failed = await settled(commentId);
      expect(failed.replyStatus).toBe("FAILED");
      expect(failed.replyErrorCode).toBe("CHANNEL_UNAVAILABLE");
      const res = await request(server()).post(`/live-sessions/${s.id}/comments/${failed.id}/resend`).set(auth).expect(200);
      expect(res.body).toMatchObject({ id: failed.id, replyStatus: "SENT", replyErrorCode: null });
      expect(await db.order.count()).toBe(1);
      expect(graph.privateReplies).toHaveLength(1);
      expect(graph.commentReplies).toHaveLength(0);
    });

    it("resend: ບໍ່ແມ່ນ FAILED → 409; ຄອມເມັ້ນຕ່າງ session / ບໍ່ພົບ → 404 CF_COMMENT_NOT_FOUND", async () => {
      const s = await liveSession();
      const { commentId } = await comment("U1", "A1");
      const row = await settled(commentId);
      await request(server()).post(`/live-sessions/${s.id}/comments/${row.id}/resend`).set(auth).expect(409);
      const other = await seedLiveSession(db, { externalPostId: "OTHER", items: [] });
      const wrong = await request(server()).post(`/live-sessions/${other.id}/comments/${row.id}/resend`).set(auth).expect(404);
      expect(wrong.body.code).toBe("CF_COMMENT_NOT_FOUND");
      await request(server()).post(`/live-sessions/${s.id}/comments/nope/resend`).set(auth).expect(404);
    });

    it("ສິດ: resend ຕ້ອງ live-cf:write; ອ່ານ ledger ຕ້ອງ live-cf:read", async () => {
      const s = await liveSession();
      const warehouse = await bearerFor(app, "warehouse@role.test");
      await request(server()).get(`/live-sessions/${s.id}/comments`).set(warehouse).expect(403);
      await request(server()).post(`/live-sessions/${s.id}/comments/x/resend`).set(warehouse).expect(403);
    });
  });
```
(ເພີ່ມ `bearerFor`, `seedRoleUsers` ໃນ import ຂອງ helpers.) ແລ່ນ → FAIL.

- [ ] **Step 2: service** `cf-comments.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { CfCommentListQuery } from "@oca/shared";
import { apiError } from "../../common/api-error";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import { CfReplyService } from "./cf-reply.service";
import { COMMENT_INCLUDE, type CfCommentDto, toCommentDto } from "./live-cf.mapper";

@Injectable()
export class CfCommentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CfReplyService) private readonly replies: CfReplyService,
  ) {}

  async list(sessionId: string, query: CfCommentListQuery): Promise<Page<CfCommentDto>> {
    await this.requireSession(sessionId);
    const where = { sessionId, ...(query.outcome ? { outcome: query.outcome } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cfComment.findMany({
        where,
        include: COMMENT_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.cfComment.count({ where }),
    ]);
    return toPage(rows.map(toCommentDto), total, query.page, query.pageSize);
  }

  /** ສົ່ງຂໍ້ຄວາມຄືນເມື່ອສົ່ງລົ້ມ (replyStatus FAILED ເທົ່ານັ້ນ). ບໍ່ແຕະບິນ ຈຶ່ງບໍ່ຈອງຊ້ຳ */
  async resend(sessionId: string, commentId: string): Promise<CfCommentDto> {
    await this.requireSession(sessionId);
    const row = await this.prisma.cfComment.findFirst({ where: { id: commentId, sessionId } });
    if (!row) throw apiError("CF_COMMENT_NOT_FOUND", "Comment not found");
    if (row.replyStatus !== "FAILED") {
      throw apiError("CONFLICT", `Reply status is ${row.replyStatus}; only FAILED replies can be resent`);
    }
    await this.replies.deliver(row.id);
    const updated = await this.prisma.cfComment.findUniqueOrThrow({ where: { id: row.id }, include: COMMENT_INCLUDE });
    return toCommentDto(updated);
  }

  private async requireSession(id: string): Promise<void> {
    const found = await this.prisma.liveSession.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
  }
}
```
ໝາຍເຫດ: `resend` ຄັ້ງທີ 2 ຫຼັງຈາກ replyStatus ຖືກຕັ້ງ FAILED ຈາກ deliver ທີ່ລົ້ມ: `deliverOnce` ໃຊ້ `firstAttempt = row.replyStatus === "NONE"` ເປັນ false ເມື່ອ FAILED ຈຶ່ງບໍ່ຕອບສາທາລະນະຊ້ຳ ✓.

- [ ] **Step 3: controller** `cf-comments.controller.ts`:

```ts
import { Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { type CfCommentListQuery, cfCommentListQuerySchema } from "@oca/shared";
import { RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CfCommentsService } from "./cf-comments.service";

@Controller("live-sessions/:id/comments")
export class CfCommentsController {
  constructor(@Inject(CfCommentsService) private readonly comments: CfCommentsService) {}

  @Get()
  @RequirePermissions("live-cf:read")
  list(@Param("id") id: string, @Query(new ZodValidationPipe(cfCommentListQuerySchema)) query: CfCommentListQuery) {
    return this.comments.list(id, query);
  }

  @Post(":commentId/resend")
  @HttpCode(200)
  @RequirePermissions("live-cf:write")
  resend(@Param("id") id: string, @Param("commentId") commentId: string) {
    return this.comments.resend(id, commentId);
  }
}
```
ໃນ `live-cf.module.ts` ເພີ່ມ `CfCommentsController` ໃນ `controllers` ແລະ `CfCommentsService` ໃນ `providers`.

- [ ] **Step 4:** `pnpm --filter @oca/api test` (ທັງໝົດ, ລວມ permission sweep) ແລະ `pnpm --filter @oca/api lint` → PASS.

- [ ] **Step 5: commit**

```bash
git add apps/api/src/modules/live-cf apps/api/test/cf-engine.e2e.test.ts
git commit -m "feat(api): CF comment ledger endpoint and reply resend

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ຕັ້ງຄ່າຂໍ້ມູນໂອນ, simulator CLI, ເອກະສານ, ກວດທັງ repo

**Files:**
- Modify: `packages/shared/src/schemas/inventory.ts` (`updateStoreSettingsSchema`), store settings service/mapper ໃນ `apps/api/src/modules/inventory/` (ຫາດ້ວຍ `grep -rn "reservationMinutes" apps/api/src`), `apps/api/test/store-settings.e2e.test.ts`, `packages/channels/src/simulator/cli.ts`, `docs/DEPLOYMENT-NOTES.md`, `docs/ROADMAP.md`, `README.md` (ຖ້າມີພາກ simulator)

- [ ] **Step 1: paymentInstructions ໃນ settings (RED).** ເພີ່ມ test ໃນ `store-settings.e2e.test.ts` (ຕາມຮູບແບບໄຟລ໌): PATCH `/store-settings` (ຫຼື route ຕົວຈິງ ຕາມ `grep`) ດ້ວຍ `{ paymentInstructions: "BCEL 123" }` → 200 ແລະ GET ຄືນຄ່ານັ້ນ; `{ paymentInstructions: null }` ລ້າງໄດ້; ຍາວເກີນ 500 → 400. ແລ່ນ → FAIL.
ໃນ `updateStoreSettingsSchema` ເພີ່ມ `paymentInstructions: z.string().trim().max(500).nullable().optional(),` (ແລະ transform ຄ່າວ່າງ → null ຖ້າ repo ໃຊ້ pattern ນັ້ນ). ໃນ service/mapper ຂອງ store settings ເພີ່ມ field `paymentInstructions` ໃນ DTO ແລະ update (ເບິ່ງວ່າ service ເດີມ spread `input` ຫຼື ລະບຸ field ເອງ ແລ້ວເພີ່ມຕາມ). `pnpm --filter @oca/shared build` ແລ້ວ test → PASS. (ໜ້າ admin `/settings` ຈະເພີ່ມຊ່ອງນີ້ໃນ plan 4a-2.)

- [ ] **Step 2: simulator CLI.** ໃນ `cli.ts` ເພີ່ມ import `commentPayload` ແລະ command:

```ts
//   pnpm --filter @oca/channels simulate comment POST_1 U123 "ນາງ ກ" "CF A1 2"  # ລູກຄ້າຄອມເມັ້ນໃນໂພສ/Live POST_1
```
ແລະໃນ `main()` ກ່ອນ usage:

```ts
  if (command === "comment") {
    const [postId, fromId, fromName, ...words] = args;
    const message = words.join(" ");
    if (postId && fromId && fromName && message) {
      const commentId = `${postId}_sim_${Date.now()}`;
      await post(commentPayload({ pageId, postId, commentId, fromId, fromName, message }));
      return;
    }
  }
```
ແລະອັບເດດ usage string ເປັນ `... | simulate comment <postId> <fromId> <name> <text>`. ຕ້ອງໃຫ້ `fake-graph` ໃນ CLI ພິມ private reply/ຄອມເມັ້ນ: ເພີ່ມ `onSend` ພຽງ message ເດີມ; ເພື່ອເຫັນ reply ໃຫ້ເພີ່ມ option `onCommentReply?: (kind: "private" | "public", reply: CommentReply) => void` ໃນ `FakeGraphOptions` ແລະ ເອີ້ນໃນ route ໃໝ່ ແລ້ວ CLI ພິມ `private reply → <commentId>: <text>`. (ເພີ່ມ test ສັ້ນໃນ `simulator.test.ts` ວ່າ callback ຖືກເອີ້ນ.) `pnpm --filter @oca/channels test && lint && build`.

- [ ] **Step 3: ເອກະສານ.** `docs/DEPLOYMENT-NOTES.md` ເພີ່ມພາກ "CF Engine": (1) Meta App ຕ້ອງ subscribe webhook field `feed` ນອກຈາກ `messages`, ສິດ `pages_read_engagement`, `pages_manage_engagement`, `pages_messaging`; (2) `externalPostId` ຕ້ອງເປັນ `post_id` ຕາມທີ່ webhook ສົ່ງ (ຮູບ `<pageId>_<postOrVideoId>`; ກວດຈາກ ledger/log ຂອງ webhook ຕອນທົດລອງຈິງ); (3) Private Reply 1 ຄັ້ງຕໍ່ຄອມເມັ້ນ ພາຍໃນ 7 ວັນ; (4) `from.id` ອາດບໍ່ຕົງ PSID: ເຄສແຊັດບໍ່ລິ້ງອັດຕະໂນມັດ; (5) `QUEUE_PREFIX` ຂອງ API ຕ້ອງບໍ່ຊ້ຳກັບ instance ອື່ນທີ່ໃຊ້ Redis ດຽວກັນຖ້າບໍ່ຕ້ອງການແບ່ງ job; (6) consumer ຢູ່ໃນ process ຂອງ API (concurrency 4, serialize ຕໍ່ session); (7) migration `20261007000000_cf_engine` ມີ partial unique index ທີ່ບໍ່ຢູ່ໃນ `schema.prisma` (ຢ່າ drop ເມື່ອ `migrate dev`); (8) ຍັງບໍ່ພິສູດກັບ Meta ຈິງ. `docs/ROADMAP.md`: ໃນແຖວໂມດູນ 3 ໝາຍ "**4a-1 (backend) ສຳເລັດ**; ເຫຼືອ 4a-2 (ໜ້າ `/live`), 4b Host screen".

- [ ] **Step 4: ກວດທັງ repo.** ຢ່າແຕະ dev server/DB ຂອງຜູ້ໃຊ້:
`pnpm --filter @oca/shared build && pnpm --filter @oca/database build && pnpm --filter @oca/channels build` ແລ້ວ `pnpm lint && pnpm test` (turbo) ແລະ `pnpm --filter @oca/api exec tsc --noEmit -p tsconfig.json`. ຄາດ: ທັງໝົດຂຽວ; ລາຍງານຈຳນວນ test ຂອງ shared/channels/api/admin. ຖ້າ `pnpm build` ທັງ repo ແຕະ `apps/admin/.next` ຂອງຜູ້ໃຊ້ ໃຫ້ **ຂ້າມ** build ຂອງ admin/storefront (ບໍ່ຈຳເປັນໃນ plan ນີ້).

- [ ] **Step 5: smoke ດ້ວຍ simulator (ບໍ່ແຕະ dev ຂອງຜູ້ໃຊ້).** ໃນ scratchpad ສ້າງຖານ `oca_smoke` ແຍກ, ແລ່ນ API ພອດ 3012 ດ້ວຍ `DATABASE_URL` ຊີ້ `oca_smoke`, `QUEUE_PREFIX=oca-smoke`, `FACEBOOK_APP_SECRET`/`FACEBOOK_WEBHOOK_VERIFY_TOKEN`/`FACEBOOK_PAGE_ACCESS_TOKEN` ຂອງ smoke, `FACEBOOK_GRAPH_BASE_URL` ຊີ້ fake graph (`simulate graph 4012`); seed ຮ້ານ (migrate + seed ຕາມ README) ແລ້ວ: login owner, ສ້າງ session `POST` ດ້ວຍ `externalPostId=POST_1` + ລະຫັດ A1 ຜູກ variant ທີ່ມີສະຕ໋ອກ, `start`; `SIM_API_URL=http://127.0.0.1:3012 pnpm --filter @oca/channels simulate comment POST_1 U1 "ນາງ ກ" "CF A1 2"` ແລ້ວກວດ: ledger ORDERED, ບິນ PENDING_PAYMENT, ສະຕ໋ອກຖືກຈອງ, fake graph ພິມ private reply; CF ຄັ້ງທີ 2 merge; ຮໍ່ຖ້າໝົດເວລາຈອງແລ້ວ worker (ແຍກພອດ/ຖານ smoke) ຄືນສະຕ໋ອກ. ເກັບກວາດ: ຢຸດ process ທີ່ເຮົາເປີດ, `DROP DATABASE oca_smoke`. ບັນທຶກຜົນລົງ `docs/DEPLOYMENT-NOTES.md` (ຫຍໍ້).

- [ ] **Step 6: commit**

```bash
git add packages/shared packages/channels apps/api/src apps/api/test docs
git commit -m "feat: payment instructions setting, simulator comment command and CF engine docs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(ກວດ `git status` ກ່ອນ add ວ່າບໍ່ໄດ້ເອົາການແກ້ໄຂຂອງຜູ້ໃຊ້ທີ່ບໍ່ກ່ຽວ — ໃຊ້ path ສະເພາະ ແທນ directory ກວ້າງ ຖ້າຈຳເປັນ.)

---

## Self-review (ເທົຽບ spec)

| ຂໍ້ spec | Task |
|---|---|
| §2 comment event + filter LIVE + BullMQ jobId + 200 | 3, 7 |
| §2 Private Reply + ຕອບຄອມເມັ້ນສາທາລະນະ | 3, 6, 7 |
| §2 sendText ເມື່ອເຄສ 24 ຊມ | **ເລື່ອນ** (ບັນທຶກໃນ "ການປ່ຽນຈາກ spec" ຂໍ້ 4) |
| §3 ຂໍ້ມູນທັງໝົດ + partial unique + CHECK | 2 |
| §4 parser | 1 |
| §5 ບິນ: customer, merge, appendItems, all-or-nothing, limit, ບໍ່ merge PAID/ໝົດເວລາ | 4, 7 |
| §6 ຂໍ້ຄວາມ, ສົ່ງລົ້ມ, resend | 6, 7, 8 |
| §7 API ແລະ ສິດ, sweep, error codes | 1, 5, 8 (sweep ເກັບ route ອັດຕະໂນມັດ) |
| §9 ການທົດສອບ (parser, adapter, e2e, ສິດ) | 1, 3, 4, 5, 7, 8 |
| §9 smoke ດ້ວຍ simulator | 9 |
| §8 ໜ້າ admin | plan 4a-2 (ແຍກ) |
| `paymentInstructions` ແກ້ໄດ້ | 9 (API); ຊ່ອງໃນໜ້າ `/settings` ຢູ່ 4a-2 |

ຊື່/signature ທີ່ໃຊ້ຂ້າມ task ຕ້ອງຕົງກັນ: `parseCf`/`normalizeCfText` (T1→T7), `OrderOrigin`/`createCfOrderInTx(tx, input, origin)`/`appendItemsInTx(tx, orderId, additions, actorId)` (T4→T7), `CfIngestService.invalidate/enqueue` (T5 stub → T7), `CfCommentJob` (T7), `CfReplyService.deliver(ledgerId)` (T6→T7,T8), `FakeGraph.privateReplies/commentReplies` (T3→T7,T8), `COMMENT_INCLUDE/toCommentDto` (T5→T8).
