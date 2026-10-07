# Slip Verification S1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ວາງພື້ນຖານຂອງ Slip Verification: error codes, schema + migration `PaymentSlip`, ຟັງຊັນກວດສະລິບ (pure), `evaluateSlip` ໃນ `@oca/database`, ແລະ package `@oca/ai-engine` (`SlipReader`, `FakeSlipReader`, `LocalDiskStorage`).

**Architecture:** logic ທີ່ API ແລະ worker ໃຊ້ຮ່ວມກັນ (ກວດ flag, ຄິດ duplicate) ຢູ່ໃນ `@oca/shared` (pure) + `@oca/database` (ອ່ານ/ຂຽນ DB) ເພາະ worker ໃຊ້ແຕ່ `@oca/database`. `@oca/ai-engine` ເປັນ package ໃໝ່ທີ່ build ເປັນ `dist` ຄືກັບ `@oca/channels`; ຖືກ API ແລະ worker import. Spec: `docs/superpowers/specs/2026-10-07-phase1-slip-verification-design.md`.

**Tech Stack:** TypeScript, zod 4, decimal.js, Prisma 7 (Postgres), vitest, pnpm workspaces + turbo.

**ກົດຂອງໂປຣເຈັກທີ່ຕ້ອງຮັກສາ**
- ຫ້າມແຕະ Postgres 5432 / Redis 6379 ຂອງຜູ້ໃຊ້; test ໃຊ້ DB `oca_test` ຜ່ານ global-setup ທີ່ມີຢູ່.
- ຫຼັງແກ້ `@oca/shared` / `@oca/database` ຕ້ອງ `pnpm --filter <pkg> build` ກ່ອນ test ຂອງ api/worker.
- ຂຽນ test ກ່ອນ ແລະ ເຫັນ RED ກ່ອນຂຽນ implementation (ລາຍງານວ່າເຫັນ RED).
- comment/ຂໍ້ຄວາມໃນໂຄດຂຽນພາສາລາວຕາມແບບເດີມ; ຊື່ identifier ເປັນອັງກິດ.
- ທຸກ commit ລົງທ້າຍດ້ວຍ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## ການຕັດສິນໃຈເພີ່ມຈາກ spec (ໃຫ້ spec ອັບເດດຕາມ ໃນ Task 9)
1. ມີ `confirmedCurrency` ເພີ່ມ (ຍອດບໍ່ມີຄວາມໝາຍຖ້າບໍ່ມີສະກຸນ).
2. ຍອດທີ່ຄາດຫວັງ = `Order.total ÷ Order.exchangeRate` ປັດ 2 ຕຳແໜ່ງ (ຍອດບິນເກັບເປັນ baseCurrency; `currency`+`exchangeRate` ບອກສະກຸນທີ່ລູກຄ້າຈ່າຍ).
3. ບໍ່ເພີ່ມ error code `ORDER_NOT_PAYABLE`: ຕອນ confirm ໃຊ້ `ORDER_INVALID_STATE` / `RESERVATION_EXPIRED` ທີ່ມີຢູ່. `ORDER_NOT_PAYABLE` ເປັນ **flag** ເທົ່ານັ້ນ.
4. ເພີ່ມ error code `SLIP_AMOUNT_REQUIRED` (confirm ໂດຍບໍ່ມີຍອດບໍ່ໄດ້).
5. ຖ້າຮ້ານຕັ້ງ `receivingAccounts` ແລ້ວ ແຕ່ອ່ານບັນຊີປາຍທາງບໍ່ໄດ້ → flag `UNREADABLE_FIELDS`.

## File map

| ໄຟລ໌ | ໜ້າທີ່ |
|---|---|
| `packages/shared/src/error-codes.ts` (ແກ້) | ເພີ່ມ `SLIP_NOT_FOUND`, `SLIP_ALREADY_REVIEWED`, `SLIP_NOT_LINKED`, `SLIP_FILE_INVALID`, `SLIP_AMOUNT_REQUIRED` |
| `packages/shared/src/schemas/slips.ts` (ໃໝ່) | ຄ່າຄົງທີ່ + zod schema ຂອງ body/receivingAccounts + `normalizeSlipAmount` |
| `packages/shared/src/slip-flags.ts` (ໃໝ່) | `computeSlipFlags` (pure) + `accountMatches` |
| `apps/api/src/common/api-error.ts` (ແກ້) | map status ຂອງ code ໃໝ່ |
| `apps/admin/src/lib/i18n/dictionary.ts` (ແກ້) | ຂໍ້ຄວາມ `error.SLIP_*` lo/en |
| `packages/database/prisma/schema.prisma` (ແກ້) | enum `SlipSource`/`SlipStatus`, model `PaymentSlip`, `StoreSetting.receivingAccounts` |
| `packages/database/prisma/migrations/20261007000000_payment_slip/migration.sql` (ໃໝ່) | migration ແບບເພີ່ມ |
| `packages/database/src/slips/evaluate-slip.ts` (ໃໝ່) | `evaluateSlip(db, slipId)`: ໂຫຼດ → ຄິດ duplicate → `computeSlipFlags` → ບັນທຶກ `flags` |
| `packages/database/src/slips/index.ts`, `src/index.ts` (ແກ້) | export |
| `packages/ai-engine/*` (ໃໝ່/ແກ້) | package build ໄດ້ + `SlipReader`, `FakeSlipReader`, `createSlipReader`, `StorageService`, `LocalDiskStorage` |
| `apps/api/test/helpers.ts` (ແກ້) | `resetDb` truncate `PaymentSlip` |
| `.env.example`, `.gitignore` (ແກ້) | `SLIP_STORAGE_DIR`, `SLIP_READER`, `QUEUE_PREFIX`; ignore `.data/` |

---

### Task 1: error codes + status map + i18n

**Files:**
- Modify: `packages/shared/src/error-codes.ts`
- Modify: `packages/shared/src/error-codes.test.ts`
- Modify: `apps/api/src/common/api-error.ts`
- Modify: `apps/admin/src/lib/i18n/dictionary.ts`

- [ ] **Step 1: test ແດງ** — ເພີ່ມໃນ `packages/shared/src/error-codes.test.ts` ຫຼັງ `it("ມີ code ຂອງ inbox", ...)`:

```ts
  it("ມີ code ຂອງ slip", () => {
    for (const code of [
      "SLIP_NOT_FOUND",
      "SLIP_ALREADY_REVIEWED",
      "SLIP_NOT_LINKED",
      "SLIP_FILE_INVALID",
      "SLIP_AMOUNT_REQUIRED",
    ]) {
      expect(isErrorCode(code), code).toBe(true);
    }
  });
```

- [ ] **Step 2:** `pnpm --filter @oca/shared test -- error-codes` → ຕ້ອງ **FAIL** (`ມີ code ຂອງ slip`).

- [ ] **Step 3: implement** — ໃນ `packages/shared/src/error-codes.ts` ຕໍ່ທ້າຍ array ຫຼັງ `"CHANNEL_NOT_CONFIGURED",`:

```ts
  // slip
  "SLIP_NOT_FOUND",
  "SLIP_ALREADY_REVIEWED",
  "SLIP_NOT_LINKED",
  "SLIP_FILE_INVALID",
  "SLIP_AMOUNT_REQUIRED",
```

- [ ] **Step 4:** `pnpm --filter @oca/shared test -- error-codes` → PASS. ແລ້ວ `pnpm --filter @oca/shared build`.

- [ ] **Step 5: status map** — `apps/api/src/common/api-error.ts`, ໃນ `STATUS_BY_CODE` ຫຼັງ `CHANNEL_NOT_CONFIGURED: ...`:

```ts
  SLIP_NOT_FOUND: HttpStatus.NOT_FOUND,
  SLIP_ALREADY_REVIEWED: HttpStatus.CONFLICT,
  SLIP_NOT_LINKED: HttpStatus.CONFLICT,
  SLIP_FILE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  SLIP_AMOUNT_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
```

`UNPROCESSABLE_ENTITY` (422) ບໍ່ຢູ່ໃນ `ERROR_CLASSES` ຈຶ່ງຕົກໄປ `new HttpException(body, 422)` — ຖືກຕ້ອງແລ້ວ.

- [ ] **Step 6: i18n** — `apps/admin/src/lib/i18n/dictionary.ts`: ໃນ object `lo` ຫຼັງແຖວ `"error.CHANNEL_NOT_CONFIGURED": "ຊ່ອງທາງນີ້ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ",` ເພີ່ມ:

```ts
  "error.SLIP_NOT_FOUND": "ບໍ່ພົບສະລິບນີ້",
  "error.SLIP_ALREADY_REVIEWED": "ສະລິບນີ້ຖືກຢືນຢັນ ຫຼື ປະຕິເສດແລ້ວ",
  "error.SLIP_NOT_LINKED": "ສະລິບນີ້ຍັງບໍ່ໄດ້ຜູກກັບບິນ",
  "error.SLIP_FILE_INVALID": "ໄຟລ໌ຮູບບໍ່ຖືກຕ້ອງ (ຕ້ອງເປັນ JPG/PNG/WebP ແລະ ບໍ່ໃຫຍ່ເກີນກຳນົດ) ຫຼື ດາວໂຫຼດຮູບບໍ່ໄດ້",
  "error.SLIP_AMOUNT_REQUIRED": "ຕ້ອງໃສ່ຍອດເງິນໃນສະລິບກ່ອນຢືນຢັນ",
```

ໃນ object `en` ຫຼັງ `"error.CHANNEL_NOT_CONFIGURED": "This channel is not configured",`:

```ts
  "error.SLIP_NOT_FOUND": "Slip not found",
  "error.SLIP_ALREADY_REVIEWED": "This slip was already confirmed or rejected",
  "error.SLIP_NOT_LINKED": "This slip is not linked to an order yet",
  "error.SLIP_FILE_INVALID": "Invalid image (must be JPG/PNG/WebP within the size limit) or the image could not be downloaded",
  "error.SLIP_AMOUNT_REQUIRED": "Enter the slip amount before confirming",
```

- [ ] **Step 7: ກວດ** — `pnpm --filter @oca/api exec tsc --noEmit` ແລະ `pnpm --filter @oca/admin exec tsc --noEmit` ຕ້ອງສະອາດ.

- [ ] **Step 8: commit** — `git add -A packages/shared apps/api/src/common/api-error.ts apps/admin/src/lib/i18n/dictionary.ts` (ຢ່າ `git add` ໄຟລ໌ admin ອື່ນທີ່ຍັງແກ້ຄ້າງຢູ່) → `git commit -m "feat(shared): slip error codes with status map and i18n"`.

---

### Task 2: shared — schemas + normalizeSlipAmount

**Files:**
- Create: `packages/shared/src/schemas/slips.ts`
- Create: `packages/shared/src/schemas/slips.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: test ແດງ** — `packages/shared/src/schemas/slips.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SLIP_FLAGS,
  SLIP_STATUSES,
  linkChatSlipSchema,
  normalizeSlipAmount,
  patchSlipSchema,
  receivingAccountsSchema,
  rejectSlipSchema,
} from "./slips";

describe("normalizeSlipAmount", () => {
  it.each([
    ["1,250,000", "1250000.00"],
    ["1 250 000.5", "1250000.50"],
    ["₭ 50,000.00", "50000.00"],
    ["12.345", "12.35"],
    ["0", "0.00"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeSlipAmount(raw)).toBe(expected);
  });

  it.each([[""], ["abc"], ["-5"], ["1.2.3"], [null], [undefined], ["1e5"]])("%s → null", (raw) => {
    expect(normalizeSlipAmount(raw as string | null | undefined)).toBeNull();
  });

  it("ບໍ່ເກີນ 16 ຫຼັກກ່ອນຈຸດ (Decimal(18,2))", () => {
    expect(normalizeSlipAmount("9".repeat(17))).toBeNull();
    expect(normalizeSlipAmount("9".repeat(16))).toBe(`${"9".repeat(16)}.00`);
  });
});

describe("receivingAccountsSchema", () => {
  it("ຮັບລາຍການທີ່ຖືກ ແລະ ຕັດຍະຫວ່າງ", () => {
    const parsed = receivingAccountsSchema.parse([{ bank: " BCEL ", accountNo: " 010-12-00-0123 ", accountName: "OCA" }]);
    expect(parsed).toEqual([{ bank: "BCEL", accountNo: "010-12-00-0123", accountName: "OCA" }]);
  });
  it("accountName ເປັນ optional; ຫຼາຍສຸດ 20 ບັນຊີ; accountNo ຕ້ອງມີຕົວເລກ", () => {
    expect(receivingAccountsSchema.safeParse([{ bank: "LDB", accountNo: "123456" }]).success).toBe(true);
    expect(receivingAccountsSchema.safeParse(Array.from({ length: 21 }, () => ({ bank: "A", accountNo: "1" }))).success).toBe(false);
    expect(receivingAccountsSchema.safeParse([{ bank: "A", accountNo: "abc" }]).success).toBe(false);
    expect(receivingAccountsSchema.safeParse([{ bank: "", accountNo: "1" }]).success).toBe(false);
  });
});

describe("patchSlipSchema", () => {
  it("ທຸກ field ເປັນ optional ແຕ່ຕ້ອງມີຢ່າງໜ້ອຍ 1", () => {
    expect(patchSlipSchema.safeParse({}).success).toBe(false);
    expect(patchSlipSchema.safeParse({ orderId: "o1" }).success).toBe(true);
  });
  it("ຍອດ normalize ແລ້ວ; paidAt ເປັນ Date; ສະກຸນຕ້ອງຢູ່ໃນ enum", () => {
    const parsed = patchSlipSchema.parse({
      confirmedAmount: "1,000",
      confirmedPaidAt: "2026-10-07T03:00:00.000Z",
      confirmedCurrency: "LAK",
      confirmedRefNo: " ABC123 ",
    });
    expect(parsed.confirmedAmount).toBe("1000.00");
    expect(parsed.confirmedPaidAt).toEqual(new Date("2026-10-07T03:00:00.000Z"));
    expect(parsed.confirmedRefNo).toBe("ABC123");
    expect(patchSlipSchema.safeParse({ confirmedCurrency: "EUR" }).success).toBe(false);
    expect(patchSlipSchema.safeParse({ confirmedAmount: "abc" }).success).toBe(false);
  });
  it("null ລ້າງຄ່າໄດ້ (ຍົກເວັ້ນ orderId ທີ່ບໍ່ອະນຸຍາດ null)", () => {
    expect(patchSlipSchema.parse({ confirmedRefNo: null }).confirmedRefNo).toBeNull();
    expect(patchSlipSchema.safeParse({ orderId: null }).success).toBe(false);
  });
});

describe("rejectSlipSchema / linkChatSlipSchema", () => {
  it("reject ຕ້ອງມີເຫດຜົນ", () => {
    expect(rejectSlipSchema.safeParse({ reason: "  " }).success).toBe(false);
    expect(rejectSlipSchema.parse({ reason: " ຍອດບໍ່ຕົງ " })).toEqual({ reason: "ຍອດບໍ່ຕົງ" });
  });
  it("link: orderId + attachmentIndex (ເລີ່ມຈາກ 0)", () => {
    expect(linkChatSlipSchema.parse({ orderId: "o1", attachmentIndex: 0 })).toEqual({ orderId: "o1", attachmentIndex: 0 });
    expect(linkChatSlipSchema.safeParse({ orderId: "o1", attachmentIndex: -1 }).success).toBe(false);
  });
});

describe("constants", () => {
  it("ຄ່າຄົງທີ່ກົງ spec", () => {
    expect(SLIP_STATUSES).toEqual(["PENDING_READ", "READ", "READ_FAILED", "CONFIRMED", "REJECTED"]);
    expect(SLIP_FLAGS).toEqual([
      "AMOUNT_MISMATCH",
      "DUPLICATE_REF",
      "DUPLICATE_IMAGE",
      "DEST_MISMATCH",
      "PAID_BEFORE_ORDER",
      "ORDER_NOT_PAYABLE",
      "UNREADABLE_FIELDS",
    ]);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/shared test -- slips` → **FAIL** (module ບໍ່ມີ).

- [ ] **Step 3: implement** — `packages/shared/src/schemas/slips.ts`:

```ts
import { z } from "zod";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const SLIP_SOURCES = ["CHAT", "UPLOAD"] as const;
export const SLIP_STATUSES = ["PENDING_READ", "READ", "READ_FAILED", "CONFIRMED", "REJECTED"] as const;
/** flag ທີ່ລະບົບໃສ່ໃຫ້ (ຊ່ວຍຕັດສິນ ບໍ່ບລັອກ). ລຳດັບນີ້ຄືລຳດັບທີ່ເກັບ/ສະແດງ. */
export const SLIP_FLAGS = [
  "AMOUNT_MISMATCH",
  "DUPLICATE_REF",
  "DUPLICATE_IMAGE",
  "DEST_MISMATCH",
  "PAID_BEFORE_ORDER",
  "ORDER_NOT_PAYABLE",
  "UNREADABLE_FIELDS",
] as const;
export const SLIP_CURRENCIES = ["LAK", "THB", "USD"] as const;

export const SLIP_ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
/** ຂະໜາດຮູບສູງສຸດ (byte) */
export const SLIP_MAX_BYTES = 8 * 1024 * 1024;

export type SlipSource = (typeof SLIP_SOURCES)[number];
export type SlipStatus = (typeof SLIP_STATUSES)[number];
export type SlipFlag = (typeof SLIP_FLAGS)[number];
export type SlipCurrency = (typeof SLIP_CURRENCIES)[number];

/**
 * ແປງຍອດທີ່ model/ຄົນພິມ ("1,250,000", "₭ 50 000.5") ເປັນ "1250000.00".
 * ຄືນ null ເມື່ອບໍ່ແມ່ນຕົວເລກບວກ ຫຼື ໃຫຍ່ເກີນ Decimal(18,2). ປັດ half-up.
 */
export function normalizeSlipAmount(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = raw.replace(/[\s,₭฿$]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [intPart = "", frac = ""] = cleaned.split(".");
  const intTrimmed = intPart.replace(/^0+(?=\d)/, "");
  if (intTrimmed.length > 16) return null;
  // ປັດ half-up ດ້ວຍ BigInt ເພື່ອບໍ່ເສຍຄວາມແມ່ນຍຳ
  const cents = BigInt(intTrimmed + (frac + "00").slice(0, 2));
  const rounded = (frac[2] ?? "0") >= "5" ? cents + 1n : cents;
  const text = rounded.toString().padStart(3, "0");
  const result = `${text.slice(0, -2)}.${text.slice(-2)}`;
  return text.slice(0, -2).length > 16 ? null : result;
}

// ---------------------------------------------------------------------------
// body
// ---------------------------------------------------------------------------
const trimmed = (max: number) => z.string().trim().min(1).max(max);

const amountField = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizeSlipAmount(value);
    if (normalized === null) {
      ctx.addIssue({ code: "custom", message: "Invalid amount" });
      return z.NEVER;
    }
    return normalized;
  });

/** ບັນຊີຮັບເງິນຂອງຮ້ານ (StoreSetting.receivingAccounts) */
export const receivingAccountSchema = z.object({
  bank: trimmed(50),
  accountNo: trimmed(40).refine((value) => /\d/.test(value), "accountNo must contain digits"),
  accountName: z.string().trim().max(100).optional(),
});
export const receivingAccountsSchema = z.array(receivingAccountSchema).max(20);
export type ReceivingAccount = z.infer<typeof receivingAccountSchema>;

/** ແກ້ຄ່າທີ່ແອດມິນຢືນຢັນ ແລະ/ຫຼື ຜູກສະລິບກັບບິນ. null ລ້າງຄ່າ (ຍົກເວັ້ນ orderId). */
export const patchSlipSchema = z
  .object({
    orderId: z.string().min(1),
    confirmedAmount: amountField.nullable(),
    confirmedCurrency: z.enum(SLIP_CURRENCIES).nullable(),
    confirmedPaidAt: z.coerce.date().nullable(),
    confirmedRefNo: trimmed(100).nullable(),
    confirmedDestAccount: trimmed(100).nullable(),
  })
  .partial()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), "At least one field is required");
export type PatchSlipInput = z.infer<typeof patchSlipSchema>;

export const rejectSlipSchema = z.object({ reason: trimmed(500) });
export type RejectSlipInput = z.infer<typeof rejectSlipSchema>;

/** ຜູກຮູບ attachment ໃນແຊັດກັບບິນ */
export const linkChatSlipSchema = z.object({
  orderId: z.string().min(1),
  attachmentIndex: z.number().int().min(0).max(50),
});
export type LinkChatSlipInput = z.infer<typeof linkChatSlipSchema>;
```

ໝາຍເຫດ: ບັນທັດ return ສຸດທ້າຍຂອງ `normalizeSlipAmount` ກວດ 16 ຫຼັກຫຼັງປັດ (ເຊັ່ນ `9999999999999999.999` ປັດເປັນ 17 ຫຼັກ → null).

- [ ] **Step 4:** ເພີ່ມ `export * from "./schemas/slips";` ໃນ `packages/shared/src/index.ts`. `pnpm --filter @oca/shared test -- slips` → PASS. ຖ້າ test ໃດ FAIL ໃຫ້ແກ້ implementation (ບໍ່ແກ້ test ເພື່ອໃຫ້ຜ່ານ ເວັ້ນແຕ່ test ຜິດຈິງ ແລະ ບອກເຫດຜົນ).

- [ ] **Step 5: commit** — `git add packages/shared && git commit -m "feat(shared): slip schemas and amount normalizer"`.

---

### Task 3: shared — computeSlipFlags

**Files:**
- Create: `packages/shared/src/slip-flags.ts`
- Create: `packages/shared/src/slip-flags.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: test ແດງ** — `packages/shared/src/slip-flags.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type SlipFlagInput, accountMatches, computeSlipFlags } from "./slip-flags";

const now = new Date("2026-10-07T10:00:00.000Z");
const order = {
  total: "100000.00",
  currency: "LAK",
  exchangeRate: "1",
  createdAt: new Date("2026-10-07T08:00:00.000Z"),
  status: "PENDING_PAYMENT",
  reservedUntil: new Date("2026-10-07T11:00:00.000Z"),
};
const base: SlipFlagInput = {
  amount: "100000.00",
  currency: "LAK",
  paidAt: new Date("2026-10-07T09:00:00.000Z"),
  destAccount: "010-12-00-0123",
  refNo: "REF1",
  order,
  receivingAccounts: [{ accountNo: "010120001230" }],
  duplicateRef: false,
  duplicateImage: false,
  now,
};
const flags = (patch: Partial<SlipFlagInput> = {}) => computeSlipFlags({ ...base, ...patch });

describe("computeSlipFlags", () => {
  it("ທຸກຢ່າງຖືກ → ບໍ່ມີ flag", () => {
    expect(flags()).toEqual([]);
  });

  it("ຍອດບໍ່ຕົງ → AMOUNT_MISMATCH (ແມ້ແຕ່ 0.01)", () => {
    expect(flags({ amount: "99999.99" })).toEqual(["AMOUNT_MISMATCH"]);
    expect(flags({ amount: "100000.01" })).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("ຍອດຄາດຫວັງ = total ÷ exchangeRate (ລູກຄ້າຈ່າຍເປັນ THB)", () => {
    const thb = { ...order, currency: "THB", exchangeRate: "500" };
    expect(flags({ order: thb, amount: "200.00", currency: "THB" })).toEqual([]);
    expect(flags({ order: thb, amount: "100000.00", currency: "THB" })).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("ສະກຸນຕ່າງຈາກບິນ → AMOUNT_MISMATCH; ສະກຸນບໍ່ຮູ້ (null) → ປຽບທຽບແຕ່ຕົວເລກ", () => {
    expect(flags({ currency: "THB" })).toEqual(["AMOUNT_MISMATCH"]);
    expect(flags({ currency: null })).toEqual([]);
  });

  it("ບໍ່ມີບິນ (ຍັງບໍ່ຜູກ) → ບໍ່ກວດຍອດ/ເວລາ/ສະຖານະ", () => {
    expect(flags({ order: null, amount: "1.00" })).toEqual([]);
  });

  it("ຊ້ຳ → DUPLICATE_REF / DUPLICATE_IMAGE", () => {
    expect(flags({ duplicateRef: true })).toEqual(["DUPLICATE_REF"]);
    expect(flags({ duplicateImage: true })).toEqual(["DUPLICATE_IMAGE"]);
    expect(flags({ duplicateRef: true, duplicateImage: true })).toEqual(["DUPLICATE_REF", "DUPLICATE_IMAGE"]);
  });

  it("ບັນຊີປາຍທາງ: ບໍ່ຢູ່ໃນລາຍການ → DEST_MISMATCH; ລາຍການວ່າງ = ຂ້າມ; masked ຈັບ 4 ໂຕທ້າຍ", () => {
    expect(flags({ destAccount: "999999999999" })).toEqual(["DEST_MISMATCH"]);
    expect(flags({ receivingAccounts: [], destAccount: "999" })).toEqual([]);
    expect(flags({ destAccount: "xxxx-xxxx-1230" })).toEqual([]);
    expect(flags({ destAccount: "xxxx-xxxx-9999" })).toEqual(["DEST_MISMATCH"]);
  });

  it("ຕັ້ງບັນຊີຮ້ານແລ້ວ ແຕ່ອ່ານບັນຊີບໍ່ໄດ້ → UNREADABLE_FIELDS", () => {
    expect(flags({ destAccount: null })).toEqual(["UNREADABLE_FIELDS"]);
    expect(flags({ destAccount: null, receivingAccounts: [] })).toEqual([]);
  });

  it("ໂອນກ່ອນບິນສ້າງ → PAID_BEFORE_ORDER ແຕ່ອະນຸໂລມ 5 ນາທີ", () => {
    expect(flags({ paidAt: new Date("2026-10-07T07:00:00.000Z") })).toEqual(["PAID_BEFORE_ORDER"]);
    expect(flags({ paidAt: new Date("2026-10-07T07:56:00.000Z") })).toEqual([]);
    expect(flags({ paidAt: new Date("2026-10-07T07:54:00.000Z") })).toEqual(["PAID_BEFORE_ORDER"]);
  });

  it("ບິນບໍ່ຢູ່ PENDING_PAYMENT ຫຼື ໝົດເວລາຈອງ → ORDER_NOT_PAYABLE", () => {
    expect(flags({ order: { ...order, status: "EXPIRED" } })).toEqual(["ORDER_NOT_PAYABLE"]);
    expect(flags({ order: { ...order, status: "PAID" } })).toEqual(["ORDER_NOT_PAYABLE"]);
    expect(flags({ order: { ...order, reservedUntil: new Date("2026-10-07T09:59:59.000Z") } })).toEqual(["ORDER_NOT_PAYABLE"]);
    expect(flags({ order: { ...order, reservedUntil: null } })).toEqual([]);
  });

  it("ອ່ານຍອດ ຫຼື ເລກອ້າງອີງບໍ່ໄດ້ → UNREADABLE_FIELDS (ບໍ່ໃສ່ AMOUNT_MISMATCH ເມື່ອບໍ່ມີຍອດ)", () => {
    expect(flags({ amount: null })).toEqual(["UNREADABLE_FIELDS"]);
    expect(flags({ refNo: null })).toEqual(["UNREADABLE_FIELDS"]);
  });

  it("ຄືນຕາມລຳດັບຂອງ SLIP_FLAGS ເສມີ", () => {
    const result = flags({
      amount: "1.00",
      duplicateRef: true,
      destAccount: "0",
      paidAt: new Date("2026-01-01T00:00:00.000Z"),
      order: { ...order, status: "EXPIRED" },
      refNo: null,
    });
    expect(result).toEqual([
      "AMOUNT_MISMATCH",
      "DUPLICATE_REF",
      "DEST_MISMATCH",
      "PAID_BEFORE_ORDER",
      "ORDER_NOT_PAYABLE",
      "UNREADABLE_FIELDS",
    ]);
  });
});

describe("accountMatches", () => {
  it.each([
    ["010-12-00-0123", "010120000123", true],
    ["010 12 00 0123", "0101200123", false],
    ["xxx0123", "010120000123", true],
    ["***123", "010120000123", false], // masked ແຕ່ເຫຼືອ <4 ຫຼັກ
    ["", "123", false],
    ["abc", "123", false],
  ])("%s vs %s → %s", (dest, accountNo, expected) => {
    expect(accountMatches(dest, accountNo)).toBe(expected);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/shared test -- slip-flags` → **FAIL**.

- [ ] **Step 3: implement** — `packages/shared/src/slip-flags.ts`:

```ts
import { Decimal } from "decimal.js";
import { SLIP_FLAGS, type SlipFlag, normalizeSlipAmount } from "./schemas/slips";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** ອະນຸໂລມເວລາ (ms) ລະຫວ່າງໂມງທະນາຄານ ແລະ ໂມງລະບົບ */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface SlipFlagOrder {
  /** ຍອດບິນ (baseCurrency) ເປັນ string */
  total: string;
  /** ສະກຸນທີ່ລູກຄ້າຈ່າຍ */
  currency: string;
  /** 1 ໜ່ວຍຂອງ currency = ? baseCurrency */
  exchangeRate: string;
  createdAt: Date;
  status: string;
  reservedUntil: Date | null;
}

export interface SlipFlagInput {
  /** ຄ່າທີ່ໃຊ້ຕັດສິນ (confirmed ກ່ອນ ບໍ່ດັ່ງນັ້ນ read) */
  amount: string | null;
  currency: string | null;
  paidAt: Date | null;
  destAccount: string | null;
  refNo: string | null;
  order: SlipFlagOrder | null;
  receivingAccounts: { accountNo: string }[];
  duplicateRef: boolean;
  duplicateImage: boolean;
  now: Date;
}

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** ເລກບັນຊີທີ່ອ່ານໄດ້ ກົງກັບບັນຊີຮ້ານ: ກົງທັງໝົດ ຫຼື (ມີ mask ແລະ ເຫຼືອ ≥4 ຫຼັກ) ກົງທ້າຍ */
export function accountMatches(dest: string, accountNo: string): boolean {
  const d = digitsOf(dest);
  const a = digitsOf(accountNo);
  if (!d || !a) return false;
  if (d === a) return true;
  const masked = /[x*•]/i.test(dest);
  return masked && d.length >= 4 && a.endsWith(d);
}

function amountMismatch(input: SlipFlagInput, order: SlipFlagOrder, amount: string): boolean {
  if (input.currency !== null && input.currency !== order.currency) return true;
  const normalized = normalizeSlipAmount(amount);
  if (normalized === null) return true;
  const expected = new D(order.total).div(order.exchangeRate).toDecimalPlaces(2);
  return !new D(normalized).eq(expected);
}

/** ຄິດ flag ຂອງສະລິບ (pure). ຄືນຕາມລຳດັບ SLIP_FLAGS. */
export function computeSlipFlags(input: SlipFlagInput): SlipFlag[] {
  const found = new Set<SlipFlag>();
  const { order } = input;

  if (order && input.amount !== null && amountMismatch(input, order, input.amount)) {
    found.add("AMOUNT_MISMATCH");
  }
  if (input.duplicateRef) found.add("DUPLICATE_REF");
  if (input.duplicateImage) found.add("DUPLICATE_IMAGE");

  const accountsConfigured = input.receivingAccounts.length > 0;
  if (accountsConfigured && input.destAccount !== null) {
    const dest = input.destAccount;
    if (!input.receivingAccounts.some((account) => accountMatches(dest, account.accountNo))) {
      found.add("DEST_MISMATCH");
    }
  }
  if (order && input.paidAt !== null && input.paidAt.getTime() < order.createdAt.getTime() - CLOCK_SKEW_MS) {
    found.add("PAID_BEFORE_ORDER");
  }
  if (
    order &&
    (order.status !== "PENDING_PAYMENT" ||
      (order.reservedUntil !== null && order.reservedUntil.getTime() <= input.now.getTime()))
  ) {
    found.add("ORDER_NOT_PAYABLE");
  }
  if (input.amount === null || input.refNo === null || (accountsConfigured && input.destAccount === null)) {
    found.add("UNREADABLE_FIELDS");
  }
  return SLIP_FLAGS.filter((flag) => found.has(flag));
}
```

- [ ] **Step 4:** ເພີ່ມ `export * from "./slip-flags";` ໃນ `packages/shared/src/index.ts`. `pnpm --filter @oca/shared test` (ທັງ package) → PASS; `pnpm --filter @oca/shared lint` ສະອາດ; `pnpm --filter @oca/shared build`.

- [ ] **Step 5: ກວດ mutation ຢ່າງໜ້ອຍ 2 ຈຸດ** (ລາຍງານຜົນ): ປ່ຽນ `CLOCK_SKEW_MS` ເປັນ 0 → test tolerance ຕ້ອງແດງ; ປ່ຽນ `order.total ÷ exchangeRate` ເປັນ `order.total` ເຕັມ → test THB ຕ້ອງແດງ. ຄືນຄ່າເດີມ.

- [ ] **Step 6: commit** — `git add packages/shared && git commit -m "feat(shared): pure slip flag computation"`.

---

### Task 4: database schema + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20261007000000_payment_slip/migration.sql`
- Modify: `apps/api/test/helpers.ts` (resetDb)
- Create: `apps/api/test/slip-migration.test.ts`

- [ ] **Step 1: schema** — ໃນ `schema.prisma`:

(a) ຫຼັງ `enum OrderStatus { ... }` ເພີ່ມ:

```prisma
enum SlipSource {
  CHAT
  UPLOAD
}

enum SlipStatus {
  PENDING_READ // ລໍ worker ອ່ານ
  READ // ອ່ານສຳເລັດ ລໍແອດມິນກວດ
  READ_FAILED // ອ່ານບໍ່ໄດ້ (retry ໝົດ)
  CONFIRMED
  REJECTED
}
```

(b) ໃນ `model StoreSetting` ກ່ອນ `updatedAt`:

```prisma
  receivingAccounts  Json     @default("[]") // [{ bank, accountNo, accountName? }] ບັນຊີຮັບເງິນຂອງຮ້ານ; [] = ບໍ່ກວດບັນຊີປາຍທາງ
```

(c) ໃນ `model Order` ເພີ່ມ field relation (ໃກ້ `conversation`): `slips PaymentSlip[]`. ໃນ `model Conversation`: `slips PaymentSlip[]`. ໃນ `model Message`: `slips PaymentSlip[]`. ໃນ `model User`: `reviewedSlips PaymentSlip[]`.

(d) ທ້າຍໄຟລ໌ ເພີ່ມ model:

```prisma
/// ສະລິບໂອນເງິນ: ຮູບ + ຜົນອ່ານ + flag + ຄ່າທີ່ແອດມິນຢືນຢັນ (ຄູ່ ຮູບ/ຄ່າທີ່ຖືກ = ຂໍ້ມູນ train ຂອງຂັ້ນ 2)
model PaymentSlip {
  id              String        @id @default(cuid())
  orderId         String?
  order           Order?        @relation(fields: [orderId], references: [id], onDelete: SetNull)
  conversationId  String?
  conversation    Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  messageId       String?
  message         Message?      @relation(fields: [messageId], references: [id], onDelete: SetNull)
  attachmentIndex Int? // ລຳດັບຮູບໃນ Message.attachments (ເລີ່ມ 0)
  source          SlipSource

  imageKey    String // key ໃນ StorageService
  imageMime   String
  imageBytes  Int
  imageSha256 String

  status        SlipStatus @default(PENDING_READ)
  readerName    String?
  readerVersion String?

  readAmount      Decimal?  @db.Decimal(18, 2)
  readCurrency    Currency?
  readPaidAt      DateTime?
  readDestAccount String?
  readRefNo       String?
  readRaw         Json? // ຜົນດິບຂອງ reader: ບໍ່ເຊື່ອຖື (untrusted)

  flags String[] @default([])

  confirmedAmount      Decimal?  @db.Decimal(18, 2)
  confirmedCurrency    Currency?
  confirmedPaidAt      DateTime?
  confirmedRefNo       String?
  confirmedDestAccount String?

  reviewedByUserId String?
  reviewedBy       User?     @relation(fields: [reviewedByUserId], references: [id], onDelete: SetNull)
  reviewedAt       DateTime?
  rejectReason     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([messageId, attachmentIndex])
  @@index([orderId])
  @@index([imageSha256])
  @@index([readRefNo])
  @@index([status, createdAt])
}
```

- [ ] **Step 2: migration SQL** — `packages/database/prisma/migrations/20261007000000_payment_slip/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "SlipSource" AS ENUM ('CHAT', 'UPLOAD');

-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('PENDING_READ', 'READ', 'READ_FAILED', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "receivingAccounts" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "PaymentSlip" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "attachmentIndex" INTEGER,
    "source" "SlipSource" NOT NULL,
    "imageKey" TEXT NOT NULL,
    "imageMime" TEXT NOT NULL,
    "imageBytes" INTEGER NOT NULL,
    "imageSha256" TEXT NOT NULL,
    "status" "SlipStatus" NOT NULL DEFAULT 'PENDING_READ',
    "readerName" TEXT,
    "readerVersion" TEXT,
    "readAmount" DECIMAL(18,2),
    "readCurrency" "Currency",
    "readPaidAt" TIMESTAMP(3),
    "readDestAccount" TEXT,
    "readRefNo" TEXT,
    "readRaw" JSONB,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirmedAmount" DECIMAL(18,2),
    "confirmedCurrency" "Currency",
    "confirmedPaidAt" TIMESTAMP(3),
    "confirmedRefNo" TEXT,
    "confirmedDestAccount" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentSlip_orderId_idx" ON "PaymentSlip"("orderId");

-- CreateIndex
CREATE INDEX "PaymentSlip_imageSha256_idx" ON "PaymentSlip"("imageSha256");

-- CreateIndex
CREATE INDEX "PaymentSlip_readRefNo_idx" ON "PaymentSlip"("readRefNo");

-- CreateIndex
CREATE INDEX "PaymentSlip_status_createdAt_idx" ON "PaymentSlip"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSlip_messageId_attachmentIndex_key" ON "PaymentSlip"("messageId", "attachmentIndex");

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

ໝາຍເຫດ: Prisma ສ້າງ `TEXT[] DEFAULT ARRAY[]::TEXT[]` ສຳລັບ `String[] @default([])` (ບໍ່ມີ NOT NULL). ຖ້າ Step 4 ບອກວ່າ diff ບໍ່ວ່າງ ໃຫ້ແກ້ SQL ຕາມ diff.

- [ ] **Step 3: validate + generate** — `pnpm --filter @oca/database db:validate` (ຕ້ອງ valid) ແລ້ວ `pnpm --filter @oca/database db:generate`.

- [ ] **Step 4: ພິສູດວ່າ SQL ກົງ schema** — ໃຊ້ DB ທົດສອບເທົ່ານັ້ນ (ຫ້າມ DB dev `oca` ຂອງຜູ້ໃຊ້):
  1. `pnpm --filter @oca/api test -- inbox-migration` (global-setup ສ້າງ/migrate `oca_test`; migration ໃໝ່ຖືກ apply ນຳ ຕ້ອງບໍ່ error).
  2. ຫາ URL ຂອງ `oca_test`: `node -e "require('node:fs').readdirSync('.')" >/dev/null; grep DATABASE_URL .env` ແລ້ວປ່ຽນຊື່ DB ເປັນ `oca_test` (ຕາມ `apps/api/test/env.ts` `testDatabaseUrl`).
  3. ຈາກ `packages/database`: `DATABASE_URL=<url oca_test> pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → ຕ້ອງ exit 0 ("No difference"). ຖ້າ flag ບໍ່ຮອງຮັບໃນເວີຊັນນີ້ ໃຫ້ `pnpm exec prisma migrate diff --help` ແລ້ວໃຊ້ flag ທີ່ຖືກ; ຖ້າ diff ບໍ່ວ່າງ ແກ້ migration.sql ຈົນວ່າງ.

- [ ] **Step 5: resetDb** — `apps/api/test/helpers.ts`: ໃນ `TRUNCATE TABLE` ເພີ່ມ `"PaymentSlip", ` ຫຼັງ `'"Message", "Conversation", ' +` ກາຍເປັນ `'"PaymentSlip", "Message", "Conversation", ' +`.

- [ ] **Step 6: test migration** — `apps/api/test/slip-migration.test.ts`:

```ts
import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedConversation } from "./helpers";

describe("payment slip migration", () => {
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

  const slip = (data: object = {}) =>
    db.paymentSlip.create({
      data: { source: "UPLOAD", imageKey: "slips/k", imageMime: "image/png", imageBytes: 10, imageSha256: "a".repeat(64), ...data },
    });

  it("ຄ່າເລີ່ມຕົ້ນ: PENDING_READ, flags ວ່າງ", async () => {
    const created = await slip();
    expect(created.status).toBe("PENDING_READ");
    expect(created.flags).toEqual([]);
  });

  it("(messageId, attachmentIndex) ຊ້ຳບໍ່ໄດ້ ແຕ່ NULL ຫຼາຍແຖວໄດ້", async () => {
    const conversation = await seedConversation(db);
    const message = await db.message.create({ data: { conversationId: conversation.id, direction: "IN", text: "x" } });
    await slip({ messageId: message.id, attachmentIndex: 0, conversationId: conversation.id });
    await expect(slip({ messageId: message.id, attachmentIndex: 0 })).rejects.toMatchObject({ code: "P2002" });
    await slip({ messageId: message.id, attachmentIndex: 1 });
    await slip();
    await slip();
    expect(await db.paymentSlip.count()).toBe(4);
  });

  it("ລຶບບິນ → orderId ເປັນ NULL (ສະລິບຍັງຢູ່)", async () => {
    const order = await db.order.create({
      data: {
        orderNumber: "SO-S1",
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "0",
        vatRate: "0",
        vatAmount: "0",
        total: "0",
      },
    });
    const created = await slip({ orderId: order.id });
    await db.order.delete({ where: { id: order.id } });
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: created.id } })).orderId).toBeNull();
  });

  it("StoreSetting.receivingAccounts ເລີ່ມຕົ້ນເປັນ []", async () => {
    const setting = await db.storeSetting.create({ data: { id: 1, name: "t" } });
    expect(setting.receivingAccounts).toEqual([]);
  });
});
```

- [ ] **Step 7:** `pnpm --filter @oca/api test -- slip-migration` → PASS. (ຖ້າ `seedConversation` ຕ້ອງ argument ອື່ນ ໃຫ້ເບິ່ງ `apps/api/test/helpers.ts`; ຖ້າ `Order` ຕ້ອງ field ເພີ່ມ ໃຫ້ copy ຈາກ test inbox-migration.)

- [ ] **Step 8: commit** — `git add packages/database apps/api/test && git commit -m "feat(database): PaymentSlip model, migration and StoreSetting.receivingAccounts"`.

---

### Task 5: database — evaluateSlip

**Files:**
- Create: `packages/database/src/slips/evaluate-slip.ts`
- Create: `packages/database/src/slips/index.ts`
- Modify: `packages/database/src/index.ts`
- Create: `apps/api/test/evaluate-slip.test.ts` (ທົດສອບກັບ Postgres ຈິງ ຕາມແບບ `expire-reservations.test.ts` ທີ່ຢູ່ໃນ api)

- [ ] **Step 1: test ແດງ** — `apps/api/test/evaluate-slip.test.ts`:

```ts
import { type PrismaClient, createPrismaClient, evaluateSlip } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

describe("evaluateSlip (Postgres ຈິງ)", () => {
  let db: PrismaClient;
  const now = new Date("2026-10-07T10:00:00.000Z");

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
    await db.storeSetting.create({
      data: { id: 1, name: "t", receivingAccounts: [{ bank: "BCEL", accountNo: "010120000123" }] },
    });
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
        createdAt: new Date("2026-10-07T08:00:00.000Z"),
        reservedUntil: new Date("2026-10-07T11:00:00.000Z"),
        ...patch,
      },
    });
  const makeSlip = (patch: object = {}) =>
    db.paymentSlip.create({
      data: {
        source: "UPLOAD",
        imageKey: "slips/k",
        imageMime: "image/png",
        imageBytes: 10,
        imageSha256: "a".repeat(64),
        status: "READ",
        readAmount: "100000",
        readCurrency: "LAK",
        readPaidAt: new Date("2026-10-07T09:00:00.000Z"),
        readDestAccount: "010-12-00-0123",
        readRefNo: "REF1",
        ...patch,
      },
    });

  it("ຖືກທຸກຢ່າງ → flags ວ່າງ ແລະ ບັນທຶກ", async () => {
    const order = await makeOrder();
    const slip = await makeSlip({ orderId: order.id, flags: ["AMOUNT_MISMATCH"] });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
    expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).flags).toEqual([]);
  });

  it("ບໍ່ມີບິນ → ຂ້າມກວດຍອດ; ໃຊ້ confirmed* ກ່ອນ read*", async () => {
    const slip = await makeSlip({ readAmount: "1", confirmedAmount: "100000" });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
    const order = await makeOrder();
    await db.paymentSlip.update({ where: { id: slip.id }, data: { orderId: order.id, confirmedAmount: "5" } });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("ຊ້ຳດ້ວຍ refNo ກັບສະລິບອື່ນ (ບໍ່ນັບ REJECTED)", async () => {
    const a = await makeSlip({ imageSha256: "b".repeat(64) });
    const b = await makeSlip({ imageSha256: "c".repeat(64) });
    expect(await evaluateSlip(db, b.id, { now })).toContain("DUPLICATE_REF");
    await db.paymentSlip.update({ where: { id: a.id }, data: { status: "REJECTED" } });
    expect(await evaluateSlip(db, b.id, { now })).not.toContain("DUPLICATE_REF");
  });

  it("ຊ້ຳດ້ວຍ sha256 ຂອງຮູບ", async () => {
    await makeSlip({ readRefNo: "X1" });
    const second = await makeSlip({ readRefNo: "X2" });
    expect(await evaluateSlip(db, second.id, { now })).toEqual(["DUPLICATE_IMAGE"]);
  });

  it("refNo ຕ່າງກັນແຕ່ບັນຊີ/ຮູບຕ່າງກັນ → ບໍ່ຊ້ຳ; ບໍ່ມີ refNo → ບໍ່ຊ້ຳດ້ວຍ refNo", async () => {
    await makeSlip({ readRefNo: "A", imageSha256: "d".repeat(64) });
    const other = await makeSlip({ readRefNo: null, imageSha256: "e".repeat(64) });
    expect(await evaluateSlip(db, other.id, { now })).toEqual(["UNREADABLE_FIELDS"]);
  });

  it("ບິນໝົດເວລາ/ບໍ່ຢູ່ PENDING_PAYMENT → ORDER_NOT_PAYABLE", async () => {
    const order = await makeOrder({ status: "EXPIRED" });
    const slip = await makeSlip({ orderId: order.id });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual(["ORDER_NOT_PAYABLE"]);
  });

  it("ບັນຊີຮ້ານເປັນ [] → ບໍ່ກວດບັນຊີປາຍທາງ", async () => {
    await db.storeSetting.update({ where: { id: 1 }, data: { receivingAccounts: [] } });
    const slip = await makeSlip({ readDestAccount: "999" });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
  });

  it("ບໍ່ມີ StoreSetting ເລີຍ → ຖືວ່າບໍ່ມີບັນຊີຮ້ານ (ບໍ່ throw)", async () => {
    await db.storeSetting.deleteMany();
    const slip = await makeSlip({ readDestAccount: "999" });
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
  });

  it("ບໍ່ພົບສະລິບ → throw", async () => {
    await expect(evaluateSlip(db, "nope", { now })).rejects.toThrow("not found");
  });

  it("receivingAccounts ຮູບແບບຜິດໃນ DB → ຂ້າມລາຍການທີ່ຜິດ (ບໍ່ throw)", async () => {
    await db.storeSetting.update({ where: { id: 1 }, data: { receivingAccounts: [{ bad: true }, { bank: "A", accountNo: "010120000123" }] } });
    const slip = await makeSlip();
    expect(await evaluateSlip(db, slip.id, { now })).toEqual([]);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/database build && pnpm --filter @oca/api test -- evaluate-slip` → **FAIL** (`evaluateSlip` ບໍ່ມີ).

- [ ] **Step 3: implement** — `packages/database/src/slips/evaluate-slip.ts`. `@oca/database` ມີ `@oca/shared` ເປັນ dependency ແລ້ວ:

```ts
import { computeSlipFlags, receivingAccountSchema } from "@oca/shared";
import type { PrismaClient } from "../generated/client";

export interface EvaluateSlipOptions {
  /** ສຳລັບ test */
  now?: Date;
}

/** ຄ່າທີ່ໃຊ້ຕັດສິນ: ແອດມິນຢືນຢັນ/ແກ້ແລ້ວ ໃຊ້ກ່ອນຄ່າທີ່ເຄື່ອງອ່ານ */
function effective<T>(confirmed: T | null, read: T | null): T | null {
  return confirmed ?? read;
}

/**
 * ຄິດ flag ຂອງສະລິບ ແລະ ບັນທຶກລົງ `PaymentSlip.flags` (ໃຊ້ຮ່ວມໂດຍ API ແລະ worker).
 * duplicate = ສະລິບອື່ນ (ບໍ່ແມ່ນ REJECTED, ບໍ່ແມ່ນຕົວເອງ) ທີ່ມີ refNo+ບັນຊີ ຫຼື sha256 ດຽວກັນ.
 */
export async function evaluateSlip(db: PrismaClient, slipId: string, options: EvaluateSlipOptions = {}) {
  const slip = await db.paymentSlip.findUnique({
    where: { id: slipId },
    include: { order: { select: { total: true, currency: true, exchangeRate: true, createdAt: true, status: true, reservedUntil: true } } },
  });
  if (!slip) throw new Error(`Slip ${slipId} not found`);

  const setting = await db.storeSetting.findUnique({ where: { id: 1 }, select: { receivingAccounts: true } });
  const receivingAccounts = (Array.isArray(setting?.receivingAccounts) ? setting.receivingAccounts : []).flatMap((entry) => {
    const parsed = receivingAccountSchema.safeParse(entry);
    return parsed.success ? [{ accountNo: parsed.data.accountNo }] : [];
  });

  const amount = effective(slip.confirmedAmount, slip.readAmount);
  const refNo = effective(slip.confirmedRefNo, slip.readRefNo);
  const destAccount = effective(slip.confirmedDestAccount, slip.readDestAccount);

  const others = { id: { not: slip.id }, status: { not: "REJECTED" as const } };
  const [refDuplicate, imageDuplicate] = await Promise.all([
    refNo
      ? db.paymentSlip.findFirst({
          where: {
            ...others,
            OR: [{ readRefNo: refNo }, { confirmedRefNo: refNo }],
            // ເລກອ້າງອີງຊ້ຳ ແຕ່ບັນຊີປາຍທາງຕ່າງ ບໍ່ແມ່ນສະລິບຊ້ຳ (ຄົນລະທະນາຄານອາດໃຊ້ເລກຄືກັນ)
            ...(destAccount ? { AND: [{ OR: [{ readDestAccount: destAccount }, { confirmedDestAccount: destAccount }] }] } : {}),
          },
          select: { id: true },
        })
      : null,
    db.paymentSlip.findFirst({ where: { ...others, imageSha256: slip.imageSha256 }, select: { id: true } }),
  ]);

  const flags = computeSlipFlags({
    amount: amount?.toFixed(2) ?? null,
    currency: effective(slip.confirmedCurrency, slip.readCurrency),
    paidAt: effective(slip.confirmedPaidAt, slip.readPaidAt),
    destAccount,
    refNo,
    order: slip.order
      ? {
          total: slip.order.total.toFixed(2),
          currency: slip.order.currency,
          exchangeRate: slip.order.exchangeRate.toString(),
          createdAt: slip.order.createdAt,
          status: slip.order.status,
          reservedUntil: slip.order.reservedUntil,
        }
      : null,
    receivingAccounts,
    duplicateRef: refDuplicate !== null,
    duplicateImage: imageDuplicate !== null,
    now: options.now ?? new Date(),
  });

  await db.paymentSlip.update({ where: { id: slip.id }, data: { flags } });
  return flags;
}
```

ໝາຍເຫດ test: ກໍລະນີ "ຊ້ຳດ້ວຍ refNo" ຂ້າງເທິງ ທັງສອງສະລິບມີ `readDestAccount` ດຽວກັນ (`010-12-00-0123`) ຈຶ່ງຊ້ຳ; ຖ້າ implementation ຕ້ອງການໃຫ້ຈັບ "ຄືກັນທີ່ບໍ່ມີບັນຊີ" ກໍ່ຜ່ານເພາະ `destAccount` null ຈະບໍ່ໃສ່ເງື່ອນໄຂບັນຊີ.

- [ ] **Step 4:** `packages/database/src/slips/index.ts`: `export * from "./evaluate-slip";` ແລະ ໃນ `packages/database/src/index.ts` ເພີ່ມ `export * from "./slips";` ຫຼັງ `export * from "./inventory";`.

- [ ] **Step 5:** `pnpm --filter @oca/database build && pnpm --filter @oca/api test -- evaluate-slip` → PASS ທັງໝົດ. `pnpm --filter @oca/database lint` ສະອາດ. ແກ້ test ຕາມ semantics ຈິງຖ້າພົບວ່າ test ຜິດ (ບໍ່ແກ້ implementation ໃຫ້ຜ່ານ test ທີ່ຜິດ).

- [ ] **Step 6: commit** — `git add packages/database apps/api/test && git commit -m "feat(database): evaluateSlip computes and stores slip flags"`.

---

### Task 6: ai-engine package — SlipReader + FakeSlipReader

**Files:**
- Modify: `packages/ai-engine/package.json`
- Create: `packages/ai-engine/tsconfig.json`, `packages/ai-engine/eslint.config.mjs`
- Create: `packages/ai-engine/src/index.ts`, `src/slip-reader.ts`, `src/fake-slip-reader.ts`, `src/fake-slip-reader.test.ts`

- [ ] **Step 1: package** — ຂຽນທັບ `packages/ai-engine/package.json`:

```json
{
  "name": "@oca/ai-engine",
  "version": "0.0.0",
  "private": true,
  "description": "Slip reader, file storage and (later) AI/OCR services",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@oca/shared": "workspace:*"
  },
  "devDependencies": {
    "@oca/config": "workspace:*",
    "@types/node": "^26.6.4",
    "eslint": "^9.39.5",
    "typescript": "~5.9.3",
    "vitest": "^5.0.3"
  }
}
```

`packages/ai-engine/tsconfig.json`:

```json
{
  "extends": "@oca/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/ai-engine/eslint.config.mjs`:

```js
import base from "@oca/config/eslint";

export default base;
```

ແລ້ວ `pnpm install` ຈາກ root (ເພື່ອ link workspace).

- [ ] **Step 2: test ແດງ** — `packages/ai-engine/src/fake-slip-reader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FakeSlipReader, createSlipReader } from "./index";

const image = { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" };

describe("FakeSlipReader", () => {
  it("ຄ່າເລີ່ມຕົ້ນ: ຜົນວ່າງ (ໃຫ້ແອດມິນຕື່ມມື)", async () => {
    const result = await new FakeSlipReader().read(image);
    expect(result).toEqual({ raw: {} });
  });

  it("ຄືນຜົນຕາມທີ່ຕັ້ງ ແລະ ເກັບ raw", async () => {
    const reader = new FakeSlipReader({ amount: "1000.00", currency: "LAK", refNo: "R1" });
    expect(await reader.read(image)).toEqual({
      amount: "1000.00",
      currency: "LAK",
      refNo: "R1",
      raw: { amount: "1000.00", currency: "LAK", refNo: "R1" },
    });
  });

  it("throw ເມື່ອຕັ້ງ failWith (ຈຳລອງ reader ລົ້ມ)", async () => {
    await expect(new FakeSlipReader({}, { failWith: "boom" }).read(image)).rejects.toThrow("boom");
  });

  it("ມີ name/version", () => {
    const reader = new FakeSlipReader();
    expect(reader.name).toBe("fake");
    expect(reader.version).toBe("1");
  });
});

describe("createSlipReader", () => {
  it("fake (ຄ່າເລີ່ມຕົ້ນ) ອ່ານ JSON ຈາກ SLIP_FAKE_RESULT", async () => {
    const reader = createSlipReader({ SLIP_FAKE_RESULT: '{"amount":"5.00","refNo":"Z"}' });
    expect(await reader.read(image)).toMatchObject({ amount: "5.00", refNo: "Z" });
    expect(createSlipReader({}).name).toBe("fake");
  });

  it("SLIP_FAKE_RESULT ບໍ່ແມ່ນ JSON ຖືກ → throw ຕອນສ້າງ", () => {
    expect(() => createSlipReader({ SLIP_FAKE_RESULT: "{nope" })).toThrow("SLIP_FAKE_RESULT");
  });

  it("ຊື່ reader ທີ່ບໍ່ຮູ້ຈັກ → throw", () => {
    expect(() => createSlipReader({ SLIP_READER: "magic" })).toThrow("Unknown SLIP_READER");
  });
});
```

- [ ] **Step 3:** `pnpm --filter @oca/ai-engine test` → **FAIL**.

- [ ] **Step 4: implement**

`packages/ai-engine/src/slip-reader.ts`:

```ts
export interface SlipImage {
  bytes: Uint8Array;
  mime: string;
}

/** ຜົນອ່ານສະລິບ: ທຸກ field ເປັນ optional (ອ່ານບໍ່ໄດ້ = ບໍ່ມີ). `raw` ເກັບໄວ້ debug/ປະເມີນ model ແລະ ເປັນ untrusted. */
export interface SlipReadResult {
  amount?: string;
  currency?: string;
  /** ISO 8601 */
  paidAt?: string;
  destAccount?: string;
  refNo?: string;
  raw: unknown;
}

/**
 * ຜູ້ອ່ານສະລິບ. ຕ້ອງ throw ເມື່ອລົ້ມທັງໝົດ (ເຄືອຂ່າຍ/model); ອ່ານໄດ້ບາງສ່ວນ = ຄືນສະເພາະ field ທີ່ອ່ານໄດ້.
 * `name`/`version` ຖືກບັນທຶກໃນ PaymentSlip ເພື່ອທຽບຄວາມແມ່ນຍຳລະຫວ່າງ reader.
 */
export interface SlipReader {
  readonly name: string;
  readonly version: string;
  read(image: SlipImage): Promise<SlipReadResult>;
}
```

`packages/ai-engine/src/fake-slip-reader.ts`:

```ts
import type { SlipImage, SlipReadResult, SlipReader } from "./slip-reader";

export type FakeSlipFields = Partial<Omit<SlipReadResult, "raw">>;

/** reader ສຳລັບ test/dev: ຄືນຜົນຄົງທີ່ (ຄ່າເລີ່ມຕົ້ນວ່າງ ເພື່ອໃຫ້ແອດມິນຕື່ມມື ແລ້ວໃຊ້ງານໄດ້ໂດຍບໍ່ມີ AI) */
export class FakeSlipReader implements SlipReader {
  readonly name = "fake";
  readonly version = "1";

  constructor(
    private readonly fields: FakeSlipFields = {},
    private readonly options: { failWith?: string } = {},
  ) {}

  async read(_image: SlipImage): Promise<SlipReadResult> {
    if (this.options.failWith) throw new Error(this.options.failWith);
    return { ...this.fields, raw: { ...this.fields } };
  }
}
```

`packages/ai-engine/src/create-slip-reader.ts`:

```ts
import { FakeSlipReader, type FakeSlipFields } from "./fake-slip-reader";
import type { SlipReader } from "./slip-reader";

/** ເລືອກ reader ຈາກ env. ຂັ້ນ 1 ມີແຕ່ `fake`; reader ຈິງຈະເພີ່ມໃນຂັ້ນ 2 (ຫຼັງ bake-off). */
export function createSlipReader(env: Record<string, string | undefined>): SlipReader {
  const name = env.SLIP_READER ?? "fake";
  if (name === "fake") {
    let fields: FakeSlipFields = {};
    if (env.SLIP_FAKE_RESULT) {
      try {
        fields = JSON.parse(env.SLIP_FAKE_RESULT) as FakeSlipFields;
      } catch {
        throw new Error("SLIP_FAKE_RESULT must be valid JSON");
      }
    }
    return new FakeSlipReader(fields);
  }
  throw new Error(`Unknown SLIP_READER: ${name}`);
}
```

`packages/ai-engine/src/index.ts`:

```ts
export * from "./slip-reader";
export * from "./fake-slip-reader";
export * from "./create-slip-reader";
export * from "./storage";
```

(ໄຟລ໌ `./storage` ຖືກສ້າງໃນ Task 7; ເພື່ອໃຫ້ Task 6 ຜ່ານກ່ອນ ໃຫ້ສ້າງ `src/storage.ts` ຊົ່ວຄາວເປັນ `export {};` ແລ້ວ Task 7 ແທນທີ່.)

- [ ] **Step 5:** `pnpm --filter @oca/ai-engine test && pnpm --filter @oca/ai-engine lint && pnpm --filter @oca/ai-engine build` → ຜ່ານ. ໝາຍເຫດ: test ກໍລະນີ "SLIP_FAKE_RESULT ບໍ່ແມ່ນ JSON ຖືກ" ຄາດ message ມີ `SLIP_FAKE_RESULT`.

- [ ] **Step 6: commit** — `git add packages/ai-engine pnpm-lock.yaml && git commit -m "feat(ai-engine): SlipReader interface, FakeSlipReader and factory"`.

---

### Task 7: ai-engine — StorageService + LocalDiskStorage

**Files:**
- Replace: `packages/ai-engine/src/storage.ts`
- Create: `packages/ai-engine/src/storage.test.ts`

- [ ] **Step 1: test ແດງ** — `packages/ai-engine/src/storage.test.ts`:

```ts
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStorage, newStorageKey } from "./storage";

describe("LocalDiskStorage", () => {
  let dir: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "oca-storage-"));
    storage = new LocalDiskStorage(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("put ແລ້ວ get ໄດ້ bytes + mime ຄືເກົ່າ", async () => {
    await storage.put("slips/2026/10/abc", new Uint8Array([1, 2, 3, 255]), "image/png");
    const got = await storage.get("slips/2026/10/abc");
    expect(Array.from(got.bytes)).toEqual([1, 2, 3, 255]);
    expect(got.mime).toBe("image/png");
  });

  it("get key ທີ່ບໍ່ມີ → throw ພ້ອມ code NOT_FOUND", async () => {
    await expect(storage.get("slips/none")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each(["../escape", "/abs/path", "a/../../b", "a//b", "", "a/\0b", "a\\b"])("ປະຕິເສດ key ອັນຕະລາຍ %j", async (key) => {
    await expect(storage.put(key, new Uint8Array([1]), "image/png")).rejects.toThrow("Invalid storage key");
    await expect(storage.get(key)).rejects.toThrow("Invalid storage key");
  });

  it("ບໍ່ຂຽນທັບ key ເດີມ (ກັນ key ຊ້ຳ)", async () => {
    await storage.put("slips/x", new Uint8Array([1]), "image/png");
    await expect(storage.put("slips/x", new Uint8Array([2]), "image/png")).rejects.toThrow("already exists");
    expect(Array.from((await storage.get("slips/x")).bytes)).toEqual([1]);
  });

  it("ບໍ່ປ່ອຍໄຟລ໌ຊົ່ວຄາວຄ້າງຫຼັງຂຽນສຳເລັດ", async () => {
    await storage.put("slips/y", new Uint8Array([1]), "image/webp");
    const files = await readdir(path.join(dir, "slips"));
    expect(files.sort()).toEqual(["y", "y.mime"]);
  });
});

describe("newStorageKey", () => {
  it("ຮູບແບບ slips/<yyyy>/<mm>/<id> ແລະ ບໍ່ຊ້ຳ", () => {
    const at = new Date("2026-10-07T00:00:00.000Z");
    const a = newStorageKey("slips", at);
    const b = newStorageKey("slips", at);
    expect(a).toMatch(/^slips\/2026\/10\/[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/ai-engine test -- storage` → **FAIL**.

- [ ] **Step 3: implement** — `packages/ai-engine/src/storage.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredFile {
  bytes: Uint8Array;
  mime: string;
}

/** ບ່ອນເກັບໄຟລ໌. ປ່ຽນເປັນ S3/R2 ໄດ້ພາຍຫຼັງ ໂດຍບໍ່ແກ້ຜູ້ໃຊ້. key ມາຈາກລະບົບເທົ່ານັ້ນ (ບໍ່ແມ່ນ input ຜູ້ໃຊ້). */
export interface StorageService {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<StoredFile>;
}

export class StorageNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(key: string) {
    super(`Storage key not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}

/** key ໃໝ່: `<prefix>/<yyyy>/<mm>/<uuid>` (UTC) */
export function newStorageKey(prefix: string, at: Date = new Date()): string {
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}/${at.getUTCFullYear()}/${month}/${randomUUID()}`;
}

const SAFE_KEY = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function assertSafeKey(key: string): void {
  // segment "." ແລະ ".." ຖືກຫ້າມ ເພື່ອກັນ path traversal
  if (!SAFE_KEY.test(key) || key.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
  }
}

/** ເກັບໃນໂຟເດີຂອງເຄື່ອງ: ໄຟລ໌ `<root>/<key>` + `<root>/<key>.mime`. ບໍ່ຮອງຮັບຫຼາຍ instance ທີ່ບໍ່ໃຊ້ volume ຮ່ວມ. */
export class LocalDiskStorage implements StorageService {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
    return full;
  }

  async put(key: string, bytes: Uint8Array, mime: string): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    // flag "wx" ບໍ່ຂຽນທັບ; ຂຽນໄຟລ໌ຊົ່ວຄາວແລ້ວ rename ເພື່ອບໍ່ໃຫ້ມີໄຟລ໌ເຄິ່ງສຳເລັດ
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(`${target}.mime`, mime, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Storage key already exists: ${key}`);
      throw error;
    }
    await writeFile(temp, bytes);
    await rename(temp, target);
  }

  async get(key: string): Promise<StoredFile> {
    const target = this.resolve(key);
    try {
      const [bytes, mime] = await Promise.all([readFile(target), readFile(`${target}.mime`, "utf8")]);
      return { bytes: new Uint8Array(bytes), mime };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageNotFoundError(key);
      throw error;
    }
  }
}
```

- [ ] **Step 4:** `pnpm --filter @oca/ai-engine test && pnpm --filter @oca/ai-engine lint && pnpm --filter @oca/ai-engine build` → ຜ່ານ. (ຖ້າ test "ປະຕິເສດ key ອັນຕະລາຍ" ກໍລະນີໃດບໍ່ throw ໃຫ້ແກ້ `SAFE_KEY`/ການກວດ; ຢ່າຜ່ອນ test.)

- [ ] **Step 5: commit** — `git add packages/ai-engine && git commit -m "feat(ai-engine): StorageService with path-safe LocalDiskStorage"`.

---

### Task 8: env + ignore

**Files:**
- Modify: `.env.example`, `.gitignore`

- [ ] **Step 1:** `.env.example` ເພີ່ມຫຼັງກຸ່ມ `# Worker (apps/worker)`:

```
# Slip verification
# ໂຟເດີເກັບຮູບສະລິບ (API ແລະ worker ຕ້ອງຊີ້ໄປບ່ອນດຽວກັນ; ໃນ production ໃຊ້ volume ຮ່ວມ ແລະ path ແບບ absolute)
# path ແບບ relative ຖືກຕີຄວາມຈາກ cwd ຂອງ process (apps/api ແລະ apps/worker) ຈຶ່ງໃຊ້ ../../ ໃຫ້ຊີ້ root ຂອງ repo ຄືກັນທັງສອງ
SLIP_STORAGE_DIR=../../.data/slips
# fake = ບໍ່ໃຊ້ AI (ແອດມິນຕື່ມຄ່າມື). reader ຈິງຈະເພີ່ມໃນຂັ້ນ 2
SLIP_READER=fake
# ສະເພາະ SLIP_READER=fake: ຜົນອ່ານຈຳລອງ ເຊັ່ນ {"amount":"100000","currency":"LAK","refNo":"R1"}
SLIP_FAKE_RESULT=
```

- [ ] **Step 2:** `.gitignore` ເພີ່ມທ້າຍ: `.data/`.

- [ ] **Step 3: commit** — `git add .env.example .gitignore && git commit -m "chore: env and ignore for slip storage"`.

---

### Task 9: ກວດທັງ repo + ອັບເດດ spec

- [ ] **Step 1:** `pnpm lint && pnpm build && pnpm test` ຕ້ອງຂຽວທັງໝົດ (ລາຍງານຈຳນວນ test ຕໍ່ package). ຖ້າ `pnpm test` ເຮັດວຽກກັບ `apps/admin` ທີ່ຍັງແກ້ຄ້າງຢູ່ (ໄຟລ໌ຂອງຜູ້ໃຊ້) ແລະ ແດງ ໃຫ້ແຍກວ່າແດງຍ້ອນການແກ້ເຮົາ ຫຼື ຂອງຜູ້ໃຊ້ ແລ້ວລາຍງານ (ຢ່າແກ້ໄຟລ໌ຂອງຜູ້ໃຊ້).

- [ ] **Step 2: ອັບເດດ spec** `docs/superpowers/specs/2026-10-07-phase1-slip-verification-design.md` ຕາມ "ການຕັດສິນໃຈເພີ່ມ" ຂ້າງເທິງ: §2 ເພີ່ມ `confirmedCurrency`; §4 ແກ້ `AMOUNT_MISMATCH` ເປັນ `total ÷ exchangeRate`, ແລະ ກົດ `UNREADABLE_FIELDS` ກັບບັນຊີຮ້ານ; §7 ເອົາ `ORDER_NOT_PAYABLE` ອອກຈາກ error code (ເຫຼືອເປັນ flag; confirm ໃຊ້ `ORDER_INVALID_STATE`/`RESERVATION_EXPIRED`) ແລະ ເພີ່ມ `SLIP_AMOUNT_REQUIRED`; §6 ບອກວ່າ `StorageService`/`LocalDiskStorage` ຢູ່ໃນ `@oca/ai-engine` (ບໍ່ແມ່ນ API).

- [ ] **Step 3: commit** — `git add docs && git commit -m "docs: align slip spec with foundation decisions"`.

---

## Self-review (ເຮັດແລ້ວ)
- Spec §2 ຂໍ້ມູນ → Task 4; §4 ການກວດ → Task 3+5; §6 interface → Task 6+7; error codes (§7) → Task 1; env → Task 8.
- ຊື່ທີ່ໃຊ້ຕໍ່ໃນ plan S2/S3: `computeSlipFlags`, `evaluateSlip(db, slipId, {now?})`, `normalizeSlipAmount`, `patchSlipSchema`, `rejectSlipSchema`, `linkChatSlipSchema`, `receivingAccountsSchema`, `SLIP_ALLOWED_MIMES`, `SLIP_MAX_BYTES`, `SlipReader`, `SlipReadResult`, `createSlipReader(env)`, `StorageService`, `LocalDiskStorage`, `newStorageKey(prefix, at?)`, `StorageNotFoundError`.
- ບໍ່ມີ placeholder.
