# Phase 1-A4: Admin UI ພື້ນຖານ + ສາງ + ໝວດໝູ່ + ຕັ້ງຄ່າຮ້ານ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ວາງພື້ນຖານ UI ຂອງ Inventory ໃນ `apps/admin` (error code → ຂໍ້ຄວາມ i18n, query helper, server pagination, nav) ແລະ ສົ່ງ 3 ໜ້າທຳອິດທີ່ງ່າຍທີ່ສຸດ: `/warehouses`, `/categories`, `/settings` (ສ່ວນຮ້ານ).

**Architecture:** ໃຊ້ pattern ດຽວກັບ `/staff` ແລະ `/roles` (ໜ້າ server component ບາງໆ ຫໍ່ `PermissionGate` + component client ທີ່ໃຊ້ TanStack Query hook ໃນ `lib/queries.ts`, ຟອມ react-hook-form + `zodResolver` ດ້ວຍ schema ຈາກ `@oca/shared`). ຂໍ້ຜິດພາດຈາກ API ແປຈາກ `code` ຄົງທີ່ (spec §6.2). Plan ນີ້ເປັນ 1 ໃນ 4 plan ຂອງ 1a-ui (A4 ພື້ນຖານ → A5 ສິນຄ້າ → A6 ສະຕ໋ອກ → A7 ບິນ); A5–A7 ໃຊ້ສິ່ງທີ່ Plan ນີ້ສ້າງ.

**Tech Stack:** Next.js 16 (App Router), React 19, TanStack Query 5, react-hook-form 7 + `@hookform/resolvers` 5, zod 4, `@oca/ui`, `@oca/shared`, Vitest + Testing Library.

**ອ້າງອີງ:** spec [2026-10-04-phase1-a-inventory-design.md](../specs/2026-10-04-phase1-a-inventory-design.md) §6.1, §6.2, §10 ແລະ [DESIGN.md](../../DESIGN.md) (**ຖ້າຂັດກັນ DESIGN.md ຊະນະ**).

## ຂໍ້ຕົກລົງສຳຄັນ (ອ່ານກ່ອນເລີ່ມ)

* **ເຮັດຢູ່ branch `phase1-inventory`.** ມີການປ່ຽນແປງ `.claude/skills/**` ທີ່ staged/ບໍ່ staged ຄ້າງຢູ່ ແລະບໍ່ກ່ຽວກັບງານນີ້: **ຢ່າ `git add -A`/`git commit -a`**. ໃຊ້ `git add <path>` ສະເພາະ ແລະ `git commit -m "..." -- <path>...`.
* **Commit trailer:** ທຸກ commit ລົງທ້າຍດ້ວຍບັນທັດ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (ໃສ່ເປັນ `-m` ທີສອງ).
* **ຫ້າມແຕະ Postgres 5432 / Redis 6379 ຂອງຜູ້ໃຊ້** (dev DB = embedded Postgres 5433, memory `dev-database-isolation`). Plan ນີ້ບໍ່ຕ້ອງໃຊ້ DB ຍົກເວັ້ນ smoke ໃນ Task 11. ຜູ້ໃຊ້ມີ API dev (:3001) ແລະ worker ແລ່ນຢູ່ ຢ່າ kill; ຖ້າຕ້ອງການ API ຂອງຕົນເອງໃຫ້ໃຊ້ `PORT=3002`.
* **ກ່ອນ test ຂອງ admin ຕ້ອງ build `@oca/shared`** (`pnpm --filter @oca/shared build`) ເມື່ອ shared ປ່ຽນ; plan ນີ້ບໍ່ແກ້ shared.
* **ສັນຍາ API ທີ່ UI ອີງ** (ມີແລ້ວ ໃນ commit `0197ffc`/`ae7dd31`): error body `{ statusCode, code, message, issues? , shortages? }`; `GET /warehouses`, `POST /warehouses`, `PATCH /warehouses/:id`, `POST /warehouses/:id/default`; `GET|POST /categories`, `PATCH|DELETE /categories/:id` (DELETE → 204); `GET|PATCH /settings/store` (`vatRate` ເປັນ string `"7.00"`). ສິດ: ທັງໝົດນີ້ອ່ານ = `inventory:read`, ຂຽນ = `inventory:write`.
* **`noUncheckedIndexedAccess` ເປີດຢູ່** (`arr[0]` ເປັນ `T | undefined`). Icon ຂອງ `lucide-react` v1: ຖ້າຊື່ໃດບໍ່ມີ ໃຫ້ໃຊ້ຊື່ໃໝ່ (`CheckCircle2→CircleCheck`, `XCircle→CircleX`, `AlertCircle→CircleAlert`) — ໂຄດເດີມໃນ repo ຍັງໃຊ້ຊື່ເກົ່າຢູ່ ແລະ compile ໄດ້ (alias), ໃຊ້ຕາມຊື່ທີ່ໃຊ້ຢູ່ແລ້ວ.
* **ທຸກ component ທີ່ໃຊ້ hook ຕ້ອງມີ `"use client"`** ເທິງສຸດ.
* **Test ໃຊ້ພາສາອັງກິດ** (`renderWithProviders` ຕັ້ງ `initialLanguage="en"`): assert ຂໍ້ຄວາມຕາມຄ່າ `en` ໃນ dictionary. ເມື່ອເພີ່ມ key ໃສ່ dictionary ຕ້ອງເພີ່ມທັງ `lo` ແລະ `en` (type `Record<TranslationKey,string>` ບັງຄັບ).
* **ວິທີເພີ່ມ key ໃນ dictionary (ໃຊ້ທຸກ task):** ໃນ `apps/admin/src/lib/i18n/dictionary.ts` ແຖວສຸດທ້າຍຂອງແຕ່ລະ object ຄື `"module.staff": "ພະນັກງານ",` (ໃນ `lo`) ແລະ `"module.staff": "Staff",` (ໃນ `en`). ໃຫ້ແຊກ block ໃໝ່ **ທັນທີຫຼັງແຖວນັ້ນ** (ໃນແຕ່ລະ object) ດ້ວຍ Edit tool; ຖ້າ plan ກ່ອນໜ້າໄດ້ແຊກແລ້ວ ໃຫ້ແຊກຕໍ່ທ້າຍ block ກ່ອນໜ້າ (ກ່ອນ `} as const;` / `};`).

## ໂຄງສ້າງໄຟລ໌

```
apps/admin/src/
  lib/api.ts                      [ແກ້] ApiError ມີ code + body
  lib/errors.ts                   [ແກ້] errorMessage ແປຈາກ code
  lib/errors.test.ts              [ໃໝ່]
  lib/i18n/dictionary.ts          [ແກ້] error.*, nav.*, warehouses.*, categories.*, settings.*, common.* ເພີ່ມ
  lib/query-string.ts (+test)     [ໃໝ່] ສ້າງ ?a=1&b=2 ຈາກ object (ຂ້າມຄ່າຫວ່າງ)
  lib/format.ts (+test)           [ໃໝ່] formatMoney, formatDateTime
  lib/use-debounced.ts (+test)    [ໃໝ່] ຫນ່ວງ input ຄົ້ນຫາ
  lib/category-tree.ts (+test)    [ໃໝ່] flatten ໝວດເປັນແຖວມີ depth + ຫາລູກຫຼານ
  lib/types.ts                    [ແກ້] Page<T>, WarehouseDto, CategoryDto, StoreSettingsDto
  lib/queries.ts                  [ແກ້] hooks ຂອງ warehouses/categories/settings
  lib/nav.ts (+test)              [ແກ້] ກຸ່ມ "ສະຕ໊ອກ" + ລາຍການ settings
  components/common/server-pager.tsx (+test)  [ໃໝ່] pagination ຝັ່ງ server
  components/warehouses/warehouse-list.tsx (+test), warehouse-form-dialog.tsx (+test)   [ໃໝ່]
  components/categories/category-list.tsx (+test), category-form-dialog.tsx (+test)     [ໃໝ່]
  components/settings/store-settings-form.tsx (+test)                                     [ໃໝ່]
  app/(app)/warehouses/page.tsx, categories/page.tsx, settings/page.tsx                   [ໃໝ່]
```

---

### Task 1: `ApiError` ມີ `code` + `errorMessage` ແປຈາກ code

**Files:**
- Modify: `apps/admin/src/lib/api.ts` (class `ApiError` ແລະ `toApiError`)
- Modify: `apps/admin/src/lib/errors.ts`
- Modify: `apps/admin/src/lib/i18n/dictionary.ts`
- Create: `apps/admin/src/lib/errors.test.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

ສ້າງ `apps/admin/src/lib/errors.test.ts`:

```ts
import { ERROR_CODES } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { errorMessage } from "./errors";
import { type TranslationKey, dictionaries, translate } from "./i18n/dictionary";

const t = (key: TranslationKey, params?: Record<string, string | number>) => translate("en", key, params);

describe("errorMessage", () => {
  it("ແປຈາກ code ທີ່ຮູ້ຈັກ (ບໍ່ສົນ message ພາສາອັງກິດຂອງ API)", () => {
    const error = new ApiError(409, "Warehouse is inactive", [], "WAREHOUSE_INACTIVE");
    expect(errorMessage(error, t)).toBe(t("error.WAREHOUSE_INACTIVE"));
    expect(errorMessage(error, t)).not.toBe("Warehouse is inactive");
  });

  it("code ທົ່ວໄປ (CONFLICT/BAD_REQUEST/NOT_FOUND) ໃຊ້ message ຂອງ API ຖ້າມີ ເພື່ອບໍ່ເສຍລາຍລະອຽດ", () => {
    expect(errorMessage(new ApiError(409, "Cannot remove the last active OWNER", [], "CONFLICT"), t)).toBe(
      "Cannot remove the last active OWNER",
    );
  });

  it("ບໍ່ມີ code: ໃຊ້ message; ບໍ່ແມ່ນ ApiError: ຂໍ້ຄວາມກາງ", () => {
    expect(errorMessage(new ApiError(500, "boom"), t)).toBe("boom");
    expect(errorMessage(new Error("x"), t)).toBe(t("common.error.generic"));
    expect(errorMessage(undefined, t)).toBe(t("common.error.generic"));
  });

  it("ທຸກ ERROR_CODES ມີຂໍ້ຄວາມໃນທັງ lo ແລະ en", () => {
    for (const code of ERROR_CODES) {
      const key = `error.${code}` as TranslationKey;
      expect(dictionaries.lo[key], `lo ${key}`).toBeTruthy();
      expect(dictionaries.en[key], `en ${key}`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: ຣັນ test ໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/errors.test.ts`
Expected: FAIL (`error.WAREHOUSE_INACTIVE` ບໍ່ມີ ແລະ constructor `ApiError` ຮັບ 4 argument ບໍ່ໄດ້ → TS/ຄ່າ `undefined`).

- [ ] **Step 3: ແກ້ `ApiError` ແລະ `toApiError` ໃນ `apps/admin/src/lib/api.ts`**

ແທນ class `ApiError` ດ້ວຍ:

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiIssue[] = [],
    /** ລະຫັດຄົງທີ່ຈາກ API (spec §6.2); undefined ຖ້າ response ບໍ່ມີ */
    readonly code?: string,
    /** body ທັງກ້ອນ ເພື່ອອ່ານ field ສະເພາະ ເຊັ່ນ `shortages` ຂອງ INSUFFICIENT_STOCK */
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

ແທນ function `toApiError` ດ້ວຍ:

```ts
async function toApiError(response: Response): Promise<ApiError> {
  let message = response.statusText || `HTTP ${response.status}`;
  let issues: ApiIssue[] = [];
  let code: string | undefined;
  let parsed: Record<string, unknown> | undefined;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    parsed = body;
    if (typeof body.message === "string") message = body.message;
    else if (Array.isArray(body.message)) message = body.message.join(", ");
    if (Array.isArray(body.issues)) issues = body.issues as ApiIssue[];
    if (typeof body.code === "string") code = body.code;
  } catch {
    // body ບໍ່ແມ່ນ JSON: ໃຊ້ statusText
  }
  return new ApiError(response.status, message, issues, code, parsed);
}
```

- [ ] **Step 4: ແກ້ `apps/admin/src/lib/errors.ts`**

```ts
import { isErrorCode } from "@oca/shared";
import type { Translate, TranslationKey } from "@/lib/i18n/dictionary";
import { ApiError } from "./api";

/** code ທົ່ວໄປທີ່ message ຂອງ API ໃຫ້ລາຍລະອຽດຫຼາຍກວ່າຂໍ້ຄວາມແປ ຈຶ່ງໃຊ້ message ກ່ອນ */
const GENERIC_CODES = new Set(["BAD_REQUEST", "CONFLICT", "NOT_FOUND", "FORBIDDEN", "INTERNAL_ERROR"]);

/**
 * ຂໍ້ຄວາມ error ທີ່ສະແດງຜູ້ໃຊ້ (spec §6.2): ແປຈາກ `code` ຄົງທີ່; code ທົ່ວໄປໃຊ້ message ຂອງ API;
 * ບໍ່ມີ code ໃຊ້ message; ບໍ່ມີຫຍັງ → ຂໍ້ຄວາມກາງ.
 */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    if (isErrorCode(error.code) && !(GENERIC_CODES.has(error.code) && error.message)) {
      return t(`error.${error.code}` as TranslationKey);
    }
    if (error.message) return error.message;
  }
  return t("common.error.generic");
}
```

- [ ] **Step 5: ເພີ່ມ key `error.*` ໃນ dictionary** (ທັງ `lo` ແລະ `en`, ວິທີແຊກຕາມ "ຂໍ້ຕົກລົງສຳຄັນ")

ໃນ `lo`:

```ts
  "error.BAD_REQUEST": "ຂໍ້ມູນທີ່ສົ່ງບໍ່ຖືກຕ້ອງ",
  "error.VALIDATION_FAILED": "ກະລຸນາກວດຂໍ້ມູນທີ່ກອກອີກຄັ້ງ",
  "error.UNAUTHORIZED": "ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່",
  "error.FORBIDDEN": "ບັນຊີຂອງທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້",
  "error.NOT_FOUND": "ບໍ່ພົບຂໍ້ມູນ",
  "error.CONFLICT": "ການກະທຳນີ້ຂັດກັບສະຖານະປັດຈຸບັນ",
  "error.TOO_MANY_ATTEMPTS": "ລອງຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າ ແລ້ວລອງໃໝ່",
  "error.INTERNAL_ERROR": "ລະບົບຂັດຂ້ອງ ກະລຸນາລອງໃໝ່",
  "error.PRODUCT_NOT_FOUND": "ບໍ່ພົບສິນຄ້ານີ້ (ອາດຖືກລຶບແລ້ວ)",
  "error.VARIANT_NOT_FOUND": "ບໍ່ພົບຕົວເລືອກສິນຄ້າ (variant) ນີ້",
  "error.CATEGORY_NOT_FOUND": "ບໍ່ພົບໝວດໝູ່ນີ້",
  "error.WAREHOUSE_NOT_FOUND": "ບໍ່ພົບສາງນີ້",
  "error.STOCK_LEVEL_NOT_FOUND": "ບໍ່ພົບແຖວສະຕ໋ອກນີ້",
  "error.ORDER_NOT_FOUND": "ບໍ່ພົບຄຳສັ່ງຊື້ນີ້",
  "error.CUSTOMER_NOT_FOUND": "ບໍ່ພົບລູກຄ້ານີ້",
  "error.ROLE_NOT_FOUND": "ບໍ່ພົບບົດບາດນີ້",
  "error.DUPLICATE_VALUE": "ມີຄ່ານີ້ຢູ່ແລ້ວ (ຊ້ຳກັບຂໍ້ມູນເດີມ)",
  "error.CATEGORY_IN_USE": "ລຶບບໍ່ໄດ້ ເພາະຍັງມີສິນຄ້າໃນໝວດນີ້",
  "error.PRODUCT_HAS_STOCK_HISTORY": "ລຶບບໍ່ໄດ້ ເພາະມີປະຫວັດສະຕ໋ອກ ໃຫ້ຍ້າຍໄປ \"ເກັບຖາວອນ\" ແທນ",
  "error.WAREHOUSE_NOT_EMPTY": "ປິດສາງບໍ່ໄດ້ ເພາະຍັງມີສະຕ໋ອກ ຫຼື ມີການຈອງ",
  "error.WAREHOUSE_IS_DEFAULT": "ປິດສາງຫຼັກບໍ່ໄດ້ ໃຫ້ຕັ້ງສາງອື່ນເປັນສາງຫຼັກກ່ອນ",
  "error.WAREHOUSE_INACTIVE": "ສາງນີ້ປິດໃຊ້ງານຢູ່",
  "error.NO_DEFAULT_WAREHOUSE": "ຍັງບໍ່ມີສາງຫຼັກທີ່ເປີດໃຊ້ງານ",
  "error.INSUFFICIENT_STOCK": "ສະຕ໋ອກບໍ່ພໍ",
  "error.VARIANT_NOT_AVAILABLE": "ສິນຄ້ານີ້ບໍ່ໄດ້ເປີດຂາຍ",
  "error.ORDER_INVALID_STATE": "ສະຖານະຂອງບິນບໍ່ອະນຸຍາດໃຫ້ເຮັດຂັ້ນນີ້",
  "error.RESERVATION_EXPIRED": "ໝົດເວລາຈອງແລ້ວ ບິນນີ້ຢືນຢັນຊຳລະບໍ່ໄດ້",
```

ໃນ `en`:

```ts
  "error.BAD_REQUEST": "The request was not valid",
  "error.VALIDATION_FAILED": "Please check the information you entered",
  "error.UNAUTHORIZED": "Please sign in again",
  "error.FORBIDDEN": "Your account is not allowed to do this",
  "error.NOT_FOUND": "Not found",
  "error.CONFLICT": "This action conflicts with the current state",
  "error.TOO_MANY_ATTEMPTS": "Too many attempts. Please wait and try again",
  "error.INTERNAL_ERROR": "Something went wrong. Please try again",
  "error.PRODUCT_NOT_FOUND": "This product was not found (it may have been deleted)",
  "error.VARIANT_NOT_FOUND": "This variant was not found",
  "error.CATEGORY_NOT_FOUND": "This category was not found",
  "error.WAREHOUSE_NOT_FOUND": "This warehouse was not found",
  "error.STOCK_LEVEL_NOT_FOUND": "This stock row was not found",
  "error.ORDER_NOT_FOUND": "This order was not found",
  "error.CUSTOMER_NOT_FOUND": "This customer was not found",
  "error.ROLE_NOT_FOUND": "This role was not found",
  "error.DUPLICATE_VALUE": "This value already exists",
  "error.CATEGORY_IN_USE": "Cannot delete: the category still has products",
  "error.PRODUCT_HAS_STOCK_HISTORY": "Cannot delete: it has stock history. Archive it instead",
  "error.WAREHOUSE_NOT_EMPTY": "Cannot deactivate: the warehouse still holds or reserves stock",
  "error.WAREHOUSE_IS_DEFAULT": "Cannot deactivate the default warehouse. Make another one the default first",
  "error.WAREHOUSE_INACTIVE": "This warehouse is inactive",
  "error.NO_DEFAULT_WAREHOUSE": "There is no active default warehouse",
  "error.INSUFFICIENT_STOCK": "Not enough stock",
  "error.VARIANT_NOT_AVAILABLE": "This item is not available for sale",
  "error.ORDER_INVALID_STATE": "The order status does not allow this step",
  "error.RESERVATION_EXPIRED": "The reservation expired; this order can no longer be paid",
```

- [ ] **Step 6: ຣັນ test ໃຫ້ຜ່ານ + ຂອງເດີມບໍ່ເພ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib && pnpm --filter @oca/admin typecheck`
Expected: PASS ທັງໝົດ (test ເດີມຂອງ staff/roles ໃຊ້ `new ApiError(status, message)` ບໍ່ມີ code → ຍັງໃຊ້ message).

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/api.ts apps/admin/src/lib/errors.ts apps/admin/src/lib/errors.test.ts apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): translate API errors from stable codes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/api.ts apps/admin/src/lib/errors.ts apps/admin/src/lib/errors.test.ts apps/admin/src/lib/i18n/dictionary.ts
```

---

### Task 2: Helpers: `toQueryString`, `formatMoney`/`formatDateTime`, `useDebounced`

**Files:**
- Create: `apps/admin/src/lib/query-string.ts`, `query-string.test.ts`
- Create: `apps/admin/src/lib/format.ts`, `format.test.ts`
- Create: `apps/admin/src/lib/use-debounced.ts`, `use-debounced.test.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

`apps/admin/src/lib/query-string.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toQueryString } from "./query-string";

describe("toQueryString", () => {
  it("ຂ້າມ undefined / null / ສະຕຣິງຫວ່າງ ແລະ ເຂົ້າລະຫັດຄ່າ", () => {
    expect(toQueryString({ q: "ສີ ແດງ", page: 2, status: undefined, categoryId: "", x: null })).toBe(
      `?q=${encodeURIComponent("ສີ ແດງ")}&page=2`,
    );
  });
  it("ບໍ່ມີ param ໃດ → ສະຕຣິງຫວ່າງ", () => {
    expect(toQueryString({})).toBe("");
    expect(toQueryString({ q: "" })).toBe("");
  });
  it("boolean ເປັນ true/false", () => {
    expect(toQueryString({ lowStock: true, includeInactive: false })).toBe("?lowStock=true&includeInactive=false");
  });
});
```

`apps/admin/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDateTime, formatMoney } from "./format";

describe("formatMoney", () => {
  it("ໃສ່ comma ຂັ້ນພັນ ແລະ ຮັກສາ 2 ທົດສະນິຍົມຈາກ string", () => {
    expect(formatMoney("12500.00")).toBe("12,500.00");
    expect(formatMoney("0")).toBe("0.00");
    expect(formatMoney("1234567.5")).toBe("1,234,567.50");
  });
  it("ຄ່າຫວ່າງ/ຜິດ → —", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney("abc")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("dd/MM/yyyy HH:mm ເວລາລາວ (UTC+7)", () => {
    expect(formatDateTime("2026-10-05T05:30:00.000Z")).toBe("05/10/2026 12:30");
    expect(formatDateTime("2026-10-04T18:00:00.000Z")).toBe("05/10/2026 01:00");
  });
  it("ຄ່າຫວ່າງ/ຜິດ → —", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("nope")).toBe("—");
  });
});
```

`apps/admin/src/lib/use-debounced.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounced } from "./use-debounced";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebounced", () => {
  it("ຄ່າປ່ຽນຫຼັງຜ່ານເວລາ delay ເທົ່ານັ້ນ ແລະ ປະຕິເສດຄ່າກາງທາງ", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 300), { initialProps: { value: "a" } });
    expect(result.current).toBe("a");
    rerender({ value: "ab" });
    rerender({ value: "abc" });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("abc");
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/query-string.test.ts src/lib/format.test.ts src/lib/use-debounced.test.ts`
Expected: FAIL (ໄຟລ໌ບໍ່ມີ).

- [ ] **Step 3: ຂຽນ implementation**

`apps/admin/src/lib/query-string.ts`:

```ts
export type QueryValue = string | number | boolean | null | undefined;

/** ສ້າງ `?a=1&b=2`; ຂ້າມ undefined/null/"" ເພື່ອໃຫ້ filter ທີ່ບໍ່ໄດ້ເລືອກບໍ່ຖືກສົ່ງ. ບໍ່ມີ param → "". */
export function toQueryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
```

`apps/admin/src/lib/format.ts`:

```ts
import { formatNumber } from "@oca/ui";

/** ເງິນຈາກ API ເປັນ string ("12500.00"): ສະແດງ comma ຂັ້ນພັນ + 2 ທົດສະນິຍົມສະເໝີ (DESIGN.md §16.2). */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ຈຳນວນເຕັມ (ສະຕ໋ອກ) ມີ comma ຂັ້ນພັນ */
export function formatQuantity(value: number | null | undefined): string {
  return formatNumber(value, { maxDecimals: 0 });
}

/** dd/MM/yyyy HH:mm ເຂດເວລາລາວ ສະເໝີ */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date
    .toLocaleString("en-GB", {
      timeZone: "Asia/Vientiane",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(", ", " ");
}
```

`apps/admin/src/lib/use-debounced.ts`:

```ts
import { useEffect, useState } from "react";

/** ຄືນ `value` ຫຼັງຄ່ານັ້ນນິ່ງຢູ່ `delayMs` ມິລິວິນາທີ (ໃຊ້ກັບ input ຄົ້ນຫາ ເພື່ອບໍ່ຍິງ API ທຸກຕົວອັກສອນ). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/query-string.ts apps/admin/src/lib/query-string.test.ts apps/admin/src/lib/format.ts apps/admin/src/lib/format.test.ts apps/admin/src/lib/use-debounced.ts apps/admin/src/lib/use-debounced.test.ts
git commit -m "feat(admin): query-string, money/date-time format and debounce helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/query-string.ts apps/admin/src/lib/query-string.test.ts apps/admin/src/lib/format.ts apps/admin/src/lib/format.test.ts apps/admin/src/lib/use-debounced.ts apps/admin/src/lib/use-debounced.test.ts
```

---

### Task 3: `ServerPager` (pagination ຝັ່ງ server)

`DataTableFooter` ຮັບ `page/totalPages/pageSize` ແລະມີຕົວເລືອກ `0 = ທັງໝົດ`. ຂໍ້ມູນຂອງ inventory ແບ່ງໜ້າຝັ່ງ API (`pageSize` ≤ 100) ຈຶ່ງຕ້ອງ wrapper: "ທັງໝົດ" = 100 ແລະ summary ມາຈາກ `total` ຂອງ server.

**Files:**
- Create: `apps/admin/src/components/common/server-pager.tsx`, `server-pager.test.tsx`
- Modify: `apps/admin/src/lib/i18n/dictionary.ts` (ບໍ່ຕ້ອງ ໃຊ້ key `page.*` ທີ່ມີ)

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

`apps/admin/src/components/common/server-pager.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { MAX_SERVER_PAGE_SIZE, ServerPager } from "./server-pager";

describe("ServerPager", () => {
  it("ສະແດງສະຫຼຸບຈາກ total ຂອງ server ແລະ ປຸ່ມໜ້າຕໍ່ໄປເອີ້ນ onPageChange", async () => {
    const onPageChange = vi.fn();
    const { user } = renderWithProviders(
      <ServerPager page={2} pageSize={10} total={35} onPageChange={onPageChange} onPageSizeChange={vi.fn()} />,
    );
    expect(screen.getByText("Showing 11-20 of 35 items")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("ບໍ່ມີຂໍ້ມູນ: 0-0 ຈາກ 0 ແລະ ປຸ່ມຖັດໄປປິດ", () => {
    renderWithProviders(
      <ServerPager page={1} pageSize={10} total={0} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(screen.getByText("Showing 0-0 of 0 items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("ເລືອກ 'ທັງໝົດ' ຖືກແປງເປັນ pageSize ສູງສຸດຂອງ API (100)", async () => {
    const onPageSizeChange = vi.fn();
    const { user } = renderWithProviders(
      <ServerPager page={1} pageSize={10} total={35} onPageChange={vi.fn()} onPageSizeChange={onPageSizeChange} />,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "per page" }), "All");
    expect(onPageSizeChange).toHaveBeenCalledWith(MAX_SERVER_PAGE_SIZE);
    expect(MAX_SERVER_PAGE_SIZE).toBe(100);
  });
});
```

(ຂໍ້ຄວາມ `en`: `page.showing` = "Showing {from}-{to} of {total} items", `page.next` = "Next", `page.perPage` = "per page", `page.all` = "All". ຖ້າ test ລົ້ມເພາະຂໍ້ຄວາມຕ່າງ ໃຫ້ເປີດ `dictionary.ts` ບັນທັດ `en` ແລ້ວແກ້ຄ່າໃນ test ໃຫ້ກົງ — ຢ່າແກ້ dictionary.)

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/common/server-pager.test.tsx`
Expected: FAIL (module ບໍ່ມີ).

- [ ] **Step 3: ຂຽນ `server-pager.tsx`**

```tsx
"use client";

import { DataTableFooter } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

/** pageSize ສູງສຸດທີ່ API ຍອມ (spec §5). "ທັງໝົດ" ຂອງ footer ຖືກແປງເປັນຄ່ານີ້. */
export const MAX_SERVER_PAGE_SIZE = 100;

export interface ServerPagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** DataTableFooter ສຳລັບຂໍ້ມູນທີ່ແບ່ງໜ້າຝັ່ງ server (ຕ່າງຈາກ `paginate()` ທີ່ແບ່ງໃນ client). */
export function ServerPager({ page, pageSize, total, onPageChange, onPageSizeChange }: ServerPagerProps) {
  const { t } = useT();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <DataTableFooter
      page={page}
      totalPages={totalPages}
      pageSize={pageSize >= MAX_SERVER_PAGE_SIZE ? 0 : pageSize}
      summary={t("page.showing", { from, to, total })}
      labels={{
        show: t("page.show"),
        perPage: t("page.perPage"),
        all: t("page.all"),
        previous: t("page.previous"),
        next: t("page.next"),
      }}
      onPageChange={onPageChange}
      onPageSizeChange={(size) => onPageSizeChange(size === 0 ? MAX_SERVER_PAGE_SIZE : size)}
    />
  );
}
```

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/common/server-pager.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/common
git commit -m "feat(admin): ServerPager for server-paginated lists" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/common
```

---

### Task 4: ປະເພດ DTO + query hooks ຂອງ warehouses / categories / settings

**Files:**
- Modify: `apps/admin/src/lib/types.ts`
- Modify: `apps/admin/src/lib/queries.ts`
- Create: `apps/admin/src/lib/queries.inventory.test.tsx`

- [ ] **Step 1: ເພີ່ມປະເພດ** ຕໍ່ທ້າຍ `apps/admin/src/lib/types.ts`:

```ts
/** ຮູບ response ຂອງລາຍການທີ່ແບ່ງໜ້າຝັ່ງ API (spec §5) */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  productCount: number;
}

export interface StoreSettingsDto {
  name: string;
  baseCurrency: string;
  /** string ສອງທົດສະນິຍົມ ("7.00") */
  vatRate: string;
  pricesIncludeVat: boolean;
  reservationMinutes: number;
}
```

- [ ] **Step 2: ຂຽນ test ທີ່ຈະລົ້ມ** `apps/admin/src/lib/queries.inventory.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { useCategories, useSetDefaultWarehouse, useStoreSettings, useUpdateStoreSettings, useWarehouses } from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("inventory query hooks", () => {
  it("useWarehouses / useCategories / useStoreSettings ເອີ້ນ endpoint ທີ່ຖືກ", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    const { Wrapper } = wrapper();
    renderHook(() => useWarehouses(), { wrapper: Wrapper });
    renderHook(() => useCategories(), { wrapper: Wrapper });
    renderHook(() => useStoreSettings(), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    expect(vi.mocked(apiFetch).mock.calls.map((call) => call[0]).sort()).toEqual([
      "/categories",
      "/settings/store",
      "/warehouses",
    ]);
  });

  it("setDefault ເອີ້ນ POST /warehouses/:id/default ແລ້ວ invalidate ລາຍການສາງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSetDefaultWarehouse(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync("w1"));
    expect(apiFetch).toHaveBeenCalledWith("/warehouses/w1/default", { method: "POST" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["warehouses"] });
  });

  it("updateStoreSettings ເອີ້ນ PATCH /settings/store", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useUpdateStoreSettings(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ vatRate: "7" }));
    expect(apiFetch).toHaveBeenCalledWith("/settings/store", { method: "PATCH", body: { vatRate: "7" } });
  });
});
```

- [ ] **Step 3: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/queries.inventory.test.tsx`
Expected: FAIL (hook ບໍ່ມີ).

- [ ] **Step 4: ແກ້ `apps/admin/src/lib/queries.ts`**

ແກ້ import ບັນທັດ 1–4 ເປັນ:

```ts
import type {
  CreateCategoryInput,
  CreateStaffInput,
  CreateWarehouseInput,
  RoleInput,
  UpdateCategoryInput,
  UpdateStaffInput,
  UpdateStoreSettingsInput,
  UpdateWarehouseInput,
} from "@oca/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { CategoryDto, RoleDto, StaffDto, StoreSettingsDto, WarehouseDto } from "./types";
```

ແທນ object `queryKeys` ດ້ວຍ:

```ts
export const queryKeys = {
  staff: ["staff"] as const,
  roles: ["roles"] as const,
  warehouses: ["warehouses"] as const,
  categories: ["categories"] as const,
  storeSettings: ["store-settings"] as const,
};
```

ຕໍ່ທ້າຍໄຟລ໌:

```ts
// ---------------------------------------------------------------------------
// Inventory: ສາງ / ໝວດໝູ່ / ຕັ້ງຄ່າຮ້ານ
// ---------------------------------------------------------------------------
export function useWarehouses() {
  return useQuery({ queryKey: queryKeys.warehouses, queryFn: () => apiFetch<WarehouseDto[]>("/warehouses") });
}

export function useCreateWarehouse() {
  const invalidate = useInvalidate(queryKeys.warehouses);
  return useMutation({
    mutationFn: (input: CreateWarehouseInput) => apiFetch<WarehouseDto>("/warehouses", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateWarehouse() {
  const invalidate = useInvalidate(queryKeys.warehouses);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWarehouseInput }) =>
      apiFetch<WarehouseDto>(`/warehouses/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useSetDefaultWarehouse() {
  const invalidate = useInvalidate(queryKeys.warehouses);
  return useMutation({
    mutationFn: (id: string) => apiFetch<WarehouseDto>(`/warehouses/${id}/default`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: () => apiFetch<CategoryDto[]>("/categories") });
}

export function useSaveCategory() {
  const invalidate = useInvalidate(queryKeys.categories);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateCategoryInput | UpdateCategoryInput }) =>
      id
        ? apiFetch<CategoryDto>(`/categories/${id}`, { method: "PATCH", body: input })
        : apiFetch<CategoryDto>("/categories", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate(queryKeys.categories);
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useStoreSettings() {
  return useQuery({ queryKey: queryKeys.storeSettings, queryFn: () => apiFetch<StoreSettingsDto>("/settings/store") });
}

export function useUpdateStoreSettings() {
  const invalidate = useInvalidate(queryKeys.storeSettings);
  return useMutation({
    mutationFn: (input: UpdateStoreSettingsInput) =>
      apiFetch<StoreSettingsDto>("/settings/store", { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}
```

(`useInvalidate` ຖືກປະກາດໃນໄຟລ໌ຢູ່ແລ້ວ ເທິງ `useCreateStaff`.)

- [ ] **Step 5: ຣັນໃຫ້ຜ່ານ + typecheck**

Run: `pnpm --filter @oca/admin exec vitest run src/lib && pnpm --filter @oca/admin typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/types.ts apps/admin/src/lib/queries.ts apps/admin/src/lib/queries.inventory.test.tsx
git commit -m "feat(admin): DTO types and query hooks for warehouses, categories, store settings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/types.ts apps/admin/src/lib/queries.ts apps/admin/src/lib/queries.inventory.test.tsx
```

---

### Task 5: Nav: ກຸ່ມ "ສະຕ໊ອກ" ແລະ ລາຍການ settings

**Files:**
- Modify: `apps/admin/src/lib/nav.ts`
- Modify: `apps/admin/src/lib/nav.test.ts`
- Modify: `apps/admin/src/lib/i18n/dictionary.ts`
- Check: `apps/admin/src/components/shell/sidebar.test.tsx` (ອາດຕ້ອງແກ້ຖ້າ assert ຈຳນວນລິ້ງ)

ກຸ່ມໃໝ່ `inventory` ວາງ **ກ່ອນ** ກຸ່ມ `settings`. Plan A5–A7 ຈະແຊກ `/products`, `/stock`, `/orders` ໄວ້ຕົ້ນກຸ່ມ. ລາຍການ `/settings` (ຕັ້ງຄ່າຮ້ານ) ໃສ່ໃນກຸ່ມ `settings` ກ່ອນ `/staff`, ສິດ `inventory:read`.

- [ ] **Step 1: ແກ້ test ໃຫ້ລົ້ມ**

ແທນເນື້ອໃນ `describe("visibleNavGroups"...)` ຂອງ `apps/admin/src/lib/nav.test.ts` ດ້ວຍ:

```ts
describe("visibleNavGroups", () => {
  it("ຜູ້ມີ staff:read ເຫັນສະເພາະ staff ແລະ roles", () => {
    const groups = visibleNavGroups(["staff:read"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("settings");
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/staff", "/roles"]);
  });

  it("ຜູ້ມີ inventory:read ເຫັນກຸ່ມສະຕ໊ອກ (ສາງ, ໝວດໝູ່) ແລະ ຕັ້ງຄ່າຮ້ານ", () => {
    const groups = visibleNavGroups(["inventory:read"]);
    expect(groups.map((group) => group.id)).toEqual(["inventory", "settings"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/warehouses", "/categories"]);
    expect(groups[1]?.items.map((item) => item.href)).toEqual(["/settings"]);
  });

  it("ບໍ່ມີສິດ: ບໍ່ມີກຸ່ມເລີຍ (ກຸ່ມທີ່ບໍ່ມີລາຍການບໍ່ຖືກ render)", () => {
    expect(visibleNavGroups([])).toEqual([]);
    expect(visibleNavGroups(["inbox:read"])).toEqual([]);
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/nav.test.ts`
Expected: FAIL.

- [ ] **Step 3: ແກ້ `apps/admin/src/lib/nav.ts`**

ແກ້ import icon ເປັນ `import { FolderTree, type LucideIcon, Settings, ShieldCheck, Users, Warehouse } from "lucide-react";` ແລະ ແທນ `NAV_GROUPS` ດ້ວຍ:

```ts
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "inventory",
    labelKey: "nav.group.inventory",
    items: [
      { href: "/warehouses", labelKey: "nav.warehouses", icon: Warehouse, permission: "inventory:read" },
      { href: "/categories", labelKey: "nav.categories", icon: FolderTree, permission: "inventory:read" },
    ],
  },
  {
    id: "settings",
    labelKey: "nav.group.settings",
    items: [
      { href: "/settings", labelKey: "nav.storeSettings", icon: Settings, permission: "inventory:read" },
      { href: "/staff", labelKey: "nav.staff", icon: Users, permission: "staff:read" },
      { href: "/roles", labelKey: "nav.roles", icon: ShieldCheck, permission: "staff:read" },
    ],
  },
];
```

- [ ] **Step 4: dictionary** ເພີ່ມ (ວິທີແຊກຕາມ "ຂໍ້ຕົກລົງສຳຄັນ")

`lo`:
```ts
  "nav.group.inventory": "ສະຕ໊ອກ",
  "nav.warehouses": "ສາງ",
  "nav.categories": "ໝວດໝູ່",
  "nav.storeSettings": "ຕັ້ງຄ່າຮ້ານ",
```
`en`:
```ts
  "nav.group.inventory": "Inventory",
  "nav.warehouses": "Warehouses",
  "nav.categories": "Categories",
  "nav.storeSettings": "Store settings",
```

- [ ] **Step 5: ຣັນທັງ admin test + typecheck**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck`
Expected: PASS. ຖ້າ `sidebar.test.tsx` ລົ້ມ (assert ຈຳນວນລິ້ງ/ກຸ່ມຂອງຜູ້ໃຊ້ທີ່ມີສິດ inventory) ໃຫ້ແກ້ຕົວເລກ/ລາຍຊື່ໃນ test ນັ້ນໃຫ້ກົງກັບ nav ໃໝ່; ຖ້າບໍ່ລົ້ມ ບໍ່ຕ້ອງແຕະ.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): inventory nav group and store settings entry" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts apps/admin/src/lib/i18n/dictionary.ts apps/admin/src/components/shell
```

---

### Task 6: ໜ້າ `/warehouses`

ຕາຕະລາງສາງ (ຮຽງຕາມ API: default ກ່ອນ ແລ້ວ code). ຄໍລຳ: ລະຫັດ, ຊື່, ທີ່ຢູ່, ສະຖານະ (ໃຊ້ງານ/ປິດ + ປ້າຍ "ສາງຫຼັກ"). ປຸ່ມຕໍ່ແຖວ (ເມື່ອ `inventory:write`): ແກ້ໄຂ, ຕັ້ງເປັນສາງຫຼັກ (ສະເພາະສາງທີ່ເປີດ ແລະບໍ່ແມ່ນ default), ປິດ/ເປີດ (ປິດຕ້ອງຢືນຢັນ). ການສ້າງ/ແກ້ໃນ dialog. ຂໍ້ຜິດພາດ (`WAREHOUSE_NOT_EMPTY`, `WAREHOUSE_IS_DEFAULT`, `DUPLICATE_VALUE`) ສະແດງເປັນ toast ຜ່ານ `errorMessage`.

**Files:**
- Create: `apps/admin/src/components/warehouses/warehouse-form-dialog.tsx`, `warehouse-form-dialog.test.tsx`
- Create: `apps/admin/src/components/warehouses/warehouse-list.tsx`, `warehouse-list.test.tsx`
- Create: `apps/admin/src/app/(app)/warehouses/page.tsx`
- Modify: `apps/admin/src/lib/i18n/dictionary.ts`

- [ ] **Step 1: dictionary** (ແຊກກ່ອນ test ເພື່ອໃຫ້ type ຜ່ານ)

`lo`:
```ts
  "warehouses.title": "ສາງ",
  "warehouses.description": "ຈັດການສາງເກັບສິນຄ້າ ແລະ ກຳນົດສາງຫຼັກ",
  "warehouses.count": "{count} ສາງ",
  "warehouses.add": "ເພີ່ມສາງ",
  "warehouses.col.code": "ລະຫັດ",
  "warehouses.col.name": "ຊື່ສາງ",
  "warehouses.col.address": "ທີ່ຢູ່",
  "warehouses.col.status": "ສະຖານະ",
  "warehouses.default": "ສາງຫຼັກ",
  "warehouses.empty.title": "ຍັງບໍ່ມີສາງ",
  "warehouses.edit": "ແກ້ໄຂສາງ",
  "warehouses.makeDefault": "ຕັ້ງເປັນສາງຫຼັກ",
  "warehouses.deactivate": "ປິດສາງ",
  "warehouses.activate": "ເປີດສາງ",
  "warehouses.deactivateTitle": "ປິດສາງນີ້?",
  "warehouses.deactivateDescription": "ສາງ {name} ຈະບໍ່ຖືກໃຊ້ຮັບ ຫຼື ຈອງສະຕ໋ອກຈົນກວ່າຈະເປີດຄືນ.",
  "warehouses.form.createTitle": "ເພີ່ມສາງ",
  "warehouses.form.createDescription": "ຕັ້ງລະຫັດ ແລະ ຊື່ສາງ",
  "warehouses.form.editDescription": "ແກ້ໄຂລະຫັດ, ຊື່ ຫຼື ທີ່ຢູ່",
  "warehouses.form.codeHint": "A–Z, 0–9, _ ແລະ - (ສູງສຸດ 20 ໂຕ)",
  "warehouses.toast.created": "ເພີ່ມສາງແລ້ວ",
  "warehouses.toast.updated": "ບັນທຶກສາງແລ້ວ",
  "warehouses.toast.defaultSet": "ຕັ້ງສາງຫຼັກແລ້ວ",
  "warehouses.toast.activated": "ເປີດສາງແລ້ວ",
  "warehouses.toast.deactivated": "ປິດສາງແລ້ວ",
```
`en`:
```ts
  "warehouses.title": "Warehouses",
  "warehouses.description": "Manage storage locations and choose the default warehouse",
  "warehouses.count": "{count} warehouses",
  "warehouses.add": "Add warehouse",
  "warehouses.col.code": "Code",
  "warehouses.col.name": "Name",
  "warehouses.col.address": "Address",
  "warehouses.col.status": "Status",
  "warehouses.default": "Default",
  "warehouses.empty.title": "No warehouses yet",
  "warehouses.edit": "Edit warehouse",
  "warehouses.makeDefault": "Make default",
  "warehouses.deactivate": "Deactivate warehouse",
  "warehouses.activate": "Activate warehouse",
  "warehouses.deactivateTitle": "Deactivate this warehouse?",
  "warehouses.deactivateDescription": "{name} will no longer receive or reserve stock until it is activated again.",
  "warehouses.form.createTitle": "Add warehouse",
  "warehouses.form.createDescription": "Set a code and a name",
  "warehouses.form.editDescription": "Edit the code, name or address",
  "warehouses.form.codeHint": "A–Z, 0–9, _ and - (up to 20 characters)",
  "warehouses.toast.created": "Warehouse added",
  "warehouses.toast.updated": "Warehouse saved",
  "warehouses.toast.defaultSet": "Default warehouse updated",
  "warehouses.toast.activated": "Warehouse activated",
  "warehouses.toast.deactivated": "Warehouse deactivated",
```

- [ ] **Step 2: ຂຽນ test ຂອງ dialog ທີ່ຈະລົ້ມ**

`apps/admin/src/components/warehouses/warehouse-form-dialog.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { WarehouseDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { WarehouseFormDialog } from "./warehouse-form-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const existing: WarehouseDto = { id: "w1", code: "MAIN", name: "Main", address: "Vientiane", isDefault: true, isActive: true };

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("WarehouseFormDialog", () => {
  it("ສ້າງ: ປ່ຽນລະຫັດເປັນຕົວພິມໃຫຍ່ ແລະ POST ພ້ອມ address ທີ່ເປົ່າ = ບໍ່ສົ່ງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...existing, id: "w2" });
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<WarehouseFormDialog open onOpenChange={onOpenChange} warehouse={null} />);

    await user.type(screen.getByLabelText("Code"), "b2");
    await user.type(screen.getByLabelText("Name"), "Branch 2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/warehouses", { method: "POST", body: { code: "B2", name: "Branch 2", isActive: true } }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ແກ້ໄຂ: PATCH ພ້ອມ address ທີ່ລ້າງ = null", async () => {
    vi.mocked(apiFetch).mockResolvedValue(existing);
    const { user } = renderWithProviders(<WarehouseFormDialog open onOpenChange={vi.fn()} warehouse={existing} />);

    await user.clear(screen.getByLabelText("Address"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/warehouses/w1", {
        method: "PATCH",
        body: { code: "MAIN", name: "Main", address: null },
      }),
    );
  });

  it("ລະຫັດຜິດຮູບແບບ ບໍ່ສົ່ງ API ແລະ ສະແດງ error ຂອງ field", async () => {
    const { user } = renderWithProviders(<WarehouseFormDialog open onOpenChange={vi.fn()} warehouse={null} />);
    await user.type(screen.getByLabelText("Code"), "bad code!");
    await user.type(screen.getByLabelText("Name"), "X");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("API ຕອບ DUPLICATE_VALUE: ສະແດງຂໍ້ຄວາມແປໃນ dialog ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "Warehouse code already in use", [], "DUPLICATE_VALUE"));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<WarehouseFormDialog open onOpenChange={onOpenChange} warehouse={null} />);
    await user.type(screen.getByLabelText("Code"), "MAIN");
    await user.type(screen.getByLabelText("Name"), "Dup");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This value already exists");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
```

ໝາຍເຫດ: `validation.required` ໃນ `en` ຕ້ອງຄືກັບຄ່າໃນ test ("This field is required"); ຖ້າຕ່າງ ໃຫ້ອ່ານ `en` ຂອງ `"validation.required"` ແລ້ວແກ້ຄ່າໃນ test.

- [ ] **Step 3: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/warehouses/warehouse-form-dialog.test.tsx`
Expected: FAIL (module ບໍ່ມີ).

- [ ] **Step 4: ຂຽນ `warehouse-form-dialog.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createWarehouseSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCreateWarehouse, useUpdateWarehouse } from "@/lib/queries";
import type { WarehouseDto } from "@/lib/types";
import { validationText } from "@/lib/validation-text";

/** ຟອມໃຊ້ສະຕຣິງລ້ວນ (address ເປົ່າໄດ້); ແປງເປັນ payload ຂອງ API ຕອນ submit */
const formSchema = z.object({
  code: z.string().trim().toUpperCase().pipe(createWarehouseSchema.shape.code),
  name: createWarehouseSchema.shape.name,
  address: z.string().trim().max(300),
});
type FormValues = z.input<typeof formSchema>;

export interface WarehouseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ສ້າງໃໝ່ */
  warehouse: WarehouseDto | null;
}

export function WarehouseFormDialog({ open, onOpenChange, warehouse }: WarehouseFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <WarehouseForm key={warehouse?.id ?? "new"} warehouse={warehouse} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function WarehouseForm({ warehouse, onDone }: { warehouse: WarehouseDto | null; onDone: () => void }) {
  const { t } = useT();
  const create = useCreateWarehouse();
  const update = useUpdateWarehouse();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: warehouse?.code ?? "", name: warehouse?.name ?? "", address: warehouse?.address ?? "" },
  });

  const submit = handleSubmit(async (raw) => {
    setFormError(null);
    const values = formSchema.parse(raw);
    try {
      if (warehouse) {
        await update.mutateAsync({
          id: warehouse.id,
          input: { code: values.code, name: values.name, address: values.address === "" ? null : values.address },
        });
        toast.success(t("warehouses.toast.updated"));
      } else {
        await create.mutateAsync({
          code: values.code,
          name: values.name,
          ...(values.address ? { address: values.address } : {}),
          isActive: true,
        });
        toast.success(t("warehouses.toast.created"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={warehouse ? t("warehouses.edit") : t("warehouses.form.createTitle")}
        description={warehouse ? t("warehouses.form.editDescription") : t("warehouses.form.createDescription")}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("warehouses.col.code")}
            htmlFor="warehouse-code"
            required
            error={errors.code ? validationText("code", t) : undefined}
          >
            <Input id="warehouse-code" invalid={!!errors.code} placeholder="MAIN" {...register("code")} />
            <p className="mt-1 text-xs text-ink-muted">{t("warehouses.form.codeHint")}</p>
          </Field>
          <Field
            label={t("warehouses.col.name")}
            htmlFor="warehouse-name"
            required
            error={errors.name ? validationText("name", t) : undefined}
          >
            <Input id="warehouse-name" invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field label={t("warehouses.col.address")} htmlFor="warehouse-address" className="sm:col-span-2">
            <Input id="warehouse-address" {...register("address")} />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 5: ຣັນ test dialog ໃຫ້ຜ່ານ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/warehouses/warehouse-form-dialog.test.tsx`
Expected: PASS. (ຖ້າ test "ບໍ່ສົ່ງ API" ລົ້ມເພາະ `zodResolver` ກັບ `.pipe`/`.toUpperCase()` ປ່ຽນ input ກ່ອນ validate: ຕົວ `"bad code!"` ຍັງຜິດ regex `^[A-Z0-9_-]{1,20}$` ຫຼັງ uppercase ຈຶ່ງ fail ຖືກຕ້ອງ.)

- [ ] **Step 6: ຂຽນ test ຂອງ list ທີ່ຈະລົ້ມ**

`apps/admin/src/components/warehouses/warehouse-list.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { WarehouseDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { WarehouseList } from "./warehouse-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const rows: WarehouseDto[] = [
  { id: "w1", code: "MAIN", name: "Main", address: "Vientiane", isDefault: true, isActive: true },
  { id: "w2", code: "B2", name: "Branch 2", address: null, isDefault: false, isActive: true },
  { id: "w3", code: "OLD", name: "Old", address: null, isDefault: false, isActive: false },
];

function mockApi(list: WarehouseDto[] = rows) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/warehouses" && !options?.method) return list;
    return {};
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("WarehouseList", () => {
  it("ສະແດງລະຫັດ, ຊື່, ທີ່ຢູ່, ປ້າຍສາງຫຼັກ ແລະ ສະຖານະ", async () => {
    renderWithProviders(<WarehouseList />);
    const main = await screen.findByTestId("row-warehouse-w1");
    expect(within(main).getByText("MAIN")).toBeInTheDocument();
    expect(within(main).getByText("Vientiane")).toBeInTheDocument();
    expect(within(main).getByText("Default")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-warehouse-w3")).getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("3 warehouses")).toBeInTheDocument();
  });

  it("ປຸ່ມ 'ຕັ້ງເປັນສາງຫຼັກ' ມີສະເພາະສາງທີ່ເປີດ ແລະ ບໍ່ແມ່ນ default; ກົດແລ້ວ POST /default", async () => {
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w1");
    expect(within(screen.getByTestId("row-warehouse-w1")).queryByRole("button", { name: /Make default/ })).toBeNull();
    expect(within(screen.getByTestId("row-warehouse-w3")).queryByRole("button", { name: /Make default/ })).toBeNull();

    await user.click(within(screen.getByTestId("row-warehouse-w2")).getByRole("button", { name: /Make default/ }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/warehouses/w2/default", { method: "POST" }));
  });

  it("ປິດສາງຕ້ອງຢືນຢັນ ແລ້ວ PATCH isActive=false; ສາງ default ປິດບໍ່ໄດ້ (ບໍ່ມີປຸ່ມ)", async () => {
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w1");
    expect(within(screen.getByTestId("row-warehouse-w1")).queryByRole("button", { name: /Deactivate/ })).toBeNull();

    await user.click(within(screen.getByTestId("row-warehouse-w2")).getByRole("button", { name: /Deactivate/ }));
    expect(apiFetch).not.toHaveBeenCalledWith("/warehouses/w2", expect.anything());
    await user.click(await screen.findByRole("button", { name: "Deactivate warehouse" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/warehouses/w2", { method: "PATCH", body: { isActive: false } }),
    );
  });

  it("ເປີດສາງທີ່ປິດ: PATCH isActive=true ທັນທີ", async () => {
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w3");
    await user.click(within(screen.getByTestId("row-warehouse-w3")).getByRole("button", { name: /Activate/ }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/warehouses/w3", { method: "PATCH", body: { isActive: true } }),
    );
  });

  it("API ຕອບ error ເມື່ອປິດ: ບໍ່ crash (toast ຜ່ານ errorMessage)", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/warehouses" && !options?.method) return rows;
      throw new ApiError(409, "x", [], "WAREHOUSE_NOT_EMPTY");
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w2");
    await user.click(within(screen.getByTestId("row-warehouse-w2")).getByRole("button", { name: /Deactivate/ }));
    await user.click(await screen.findByRole("button", { name: "Deactivate warehouse" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Deactivate warehouse" })).toBeNull());
  });

  it("ບໍ່ມີ inventory:write: ບໍ່ມີປຸ່ມເພີ່ມ/ແກ້/ຕັ້ງຄ່າ", async () => {
    auth.canWrite = false;
    renderWithProviders(<WarehouseList />);
    await screen.findByTestId("row-warehouse-w1");
    expect(screen.queryByRole("button", { name: "Add warehouse" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit warehouse/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Make default/ })).toBeNull();
  });

  it("ວ່າງ: empty state ພ້ອມປຸ່ມເພີ່ມ; load ລົ້ມ: ປຸ່ມລອງໃໝ່", async () => {
    mockApi([]);
    renderWithProviders(<WarehouseList />);
    expect(await screen.findByText("No warehouses yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/warehouses/warehouse-list.test.tsx`
Expected: FAIL.

- [ ] **Step 8: ຂຽນ `warehouse-list.tsx`**

```tsx
"use client";

import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  toast,
} from "@oca/ui";
import { AlertCircle, CheckCircle2, Pencil, Plus, Power, PowerOff, Star, Warehouse, XCircle } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useSetDefaultWarehouse, useUpdateWarehouse, useWarehouses } from "@/lib/queries";
import type { WarehouseDto } from "@/lib/types";
import { WarehouseFormDialog } from "./warehouse-form-dialog";

const COLUMNS = 5;

export function WarehouseList() {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const query = useWarehouses();
  const update = useUpdateWarehouse();
  const setDefault = useSetDefaultWarehouse();

  const [formOpen, setFormOpen] = useState(false);
  const [formWarehouse, setFormWarehouse] = useState<WarehouseDto | null>(null);
  const [deactivating, setDeactivating] = useState<WarehouseDto | null>(null);
  const rows = query.data ?? [];

  function openForm(warehouse: WarehouseDto | null) {
    setFormWarehouse(warehouse);
    setFormOpen(true);
  }

  async function setActive(warehouse: WarehouseDto, isActive: boolean) {
    try {
      await update.mutateAsync({ id: warehouse.id, input: { isActive } });
      toast.success(t(isActive ? "warehouses.toast.activated" : "warehouses.toast.deactivated"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setDeactivating(null);
    }
  }

  async function makeDefault(warehouse: WarehouseDto) {
    try {
      await setDefault.mutateAsync(warehouse.id);
      toast.success(t("warehouses.toast.defaultSet"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  }

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => openForm(null)}>
      <Plus aria-hidden="true" />
      {t("warehouses.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("warehouses.title")]}
        title={t("warehouses.title")}
        badge={query.data ? t("warehouses.count", { count: rows.length }) : undefined}
        description={t("warehouses.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("warehouses.col.code")}</TableHead>
                    <TableHead>{t("warehouses.col.name")}</TableHead>
                    <TableHead>{t("warehouses.col.address")}</TableHead>
                    <TableHead>{t("warehouses.col.status")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((warehouse) => (
                    <TableRow key={warehouse.id} data-testid={`row-warehouse-${warehouse.id}`}>
                      <TableCell className="font-mono text-sm font-semibold text-ink">{warehouse.code}</TableCell>
                      <TableCell className="font-medium text-ink">{warehouse.name}</TableCell>
                      <TableCell className="text-ink-secondary">{warehouse.address ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill
                            tone={warehouse.isActive ? "success" : "neutral"}
                            icon={warehouse.isActive ? CheckCircle2 : XCircle}
                          >
                            {warehouse.isActive ? t("status.active") : t("status.inactive")}
                          </StatusPill>
                          {warehouse.isDefault ? (
                            <StatusPill tone="brand" icon={Star}>
                              {t("warehouses.default")}
                            </StatusPill>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t("warehouses.edit")} ${warehouse.code}`}
                                title={t("warehouses.edit")}
                                onClick={() => openForm(warehouse)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              {warehouse.isActive && !warehouse.isDefault ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("warehouses.makeDefault")} ${warehouse.code}`}
                                  title={t("warehouses.makeDefault")}
                                  onClick={() => void makeDefault(warehouse)}
                                >
                                  <Star aria-hidden="true" />
                                </Button>
                              ) : null}
                              {warehouse.isActive && !warehouse.isDefault ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("warehouses.deactivate")} ${warehouse.code}`}
                                  title={t("warehouses.deactivate")}
                                  onClick={() => setDeactivating(warehouse)}
                                >
                                  <PowerOff aria-hidden="true" />
                                </Button>
                              ) : null}
                              {!warehouse.isActive ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  aria-label={`${t("warehouses.activate")} ${warehouse.code}`}
                                  title={t("warehouses.activate")}
                                  onClick={() => void setActive(warehouse, true)}
                                >
                                  <Power aria-hidden="true" />
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? (
                <EmptyState icon={Warehouse} title={t("warehouses.empty.title")} action={addButton} />
              ) : null}
            </>
          )}
        </Card>
      </div>

      <WarehouseFormDialog open={formOpen} onOpenChange={setFormOpen} warehouse={formWarehouse} />

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        title={t("warehouses.deactivateTitle")}
        description={t("warehouses.deactivateDescription", { name: deactivating?.name ?? "" })}
        confirmLabel={t("warehouses.deactivate")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={update.isPending}
        onConfirm={() => (deactivating ? setActive(deactivating, false) : undefined)}
      />
    </div>
  );
}
```

- [ ] **Step 9: ໜ້າ** `apps/admin/src/app/(app)/warehouses/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { WarehouseList } from "@/components/warehouses/warehouse-list";

export default function WarehousesPage() {
  return (
    <PermissionGate permission="inventory:read">
      <WarehouseList />
    </PermissionGate>
  );
}
```

- [ ] **Step 10: ຣັນ test + lint + typecheck**

Run: `pnpm --filter @oca/admin exec vitest run src/components/warehouses && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/admin/src/components/warehouses "apps/admin/src/app/(app)/warehouses" apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): warehouses page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/warehouses "apps/admin/src/app/(app)/warehouses" apps/admin/src/lib/i18n/dictionary.ts
```

---

### Task 7: `category-tree` helper

API ຄືນໝວດແບບແບນ (ຮຽງ `position`, `name`) ພ້ອມ `parentId`. UI ສະແດງເປັນ tree ໂດຍ indent ແລະ dropdown ຂອງ "ໝວດແມ່" ຕ້ອງຕັດໂຕເອງ ແລະ ລູກຫຼານ (ກັນ `400`).

**Files:**
- Create: `apps/admin/src/lib/category-tree.ts`, `category-tree.test.ts`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```ts
import { describe, expect, it } from "vitest";
import { descendantIds, flattenCategories } from "./category-tree";
import type { CategoryDto } from "./types";

const cat = (id: string, parentId: string | null, position = 0, name = id): CategoryDto => ({
  id,
  name,
  slug: id,
  parentId,
  position,
  productCount: 0,
});

describe("flattenCategories", () => {
  it("ຮຽງແບບ depth-first: ແມ່ ຕາມດ້ວຍລູກ; ລູກຮຽງຕາມ position ແລ້ວຊື່", () => {
    const rows = flattenCategories([
      cat("b", null, 1),
      cat("a", null, 0),
      cat("a2", "a", 2),
      cat("a1", "a", 1),
      cat("a1x", "a1", 0),
    ]);
    expect(rows.map((row) => [row.category.id, row.depth])).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a1x", 2],
      ["a2", 1],
      ["b", 0],
    ]);
  });

  it("ໝວດທີ່ແມ່ຫາຍ (orphan) ຖືກຖືວ່າເປັນຮາກ ເພື່ອບໍ່ໃຫ້ຫາຍຈາກລາຍການ; ວົງຈອນບໍ່ເຮັດໃຫ້ວົນບໍ່ຈົບ", () => {
    expect(flattenCategories([cat("x", "ghost")]).map((row) => row.category.id)).toEqual(["x"]);
    const looped = flattenCategories([cat("p", "q"), cat("q", "p")]);
    expect(looped.length).toBeLessThanOrEqual(2);
  });
});

describe("descendantIds", () => {
  it("ຄືນລູກຫຼານທຸກຊັ້ນ (ບໍ່ລວມໂຕເອງ)", () => {
    const list = [cat("a", null), cat("a1", "a"), cat("a1x", "a1"), cat("b", null)];
    expect([...descendantIds(list, "a")].sort()).toEqual(["a1", "a1x"]);
    expect(descendantIds(list, "b").size).toBe(0);
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/category-tree.test.ts`
Expected: FAIL.

- [ ] **Step 3: ຂຽນ `category-tree.ts`**

```ts
import type { CategoryDto } from "./types";

export interface CategoryRow {
  category: CategoryDto;
  depth: number;
}

const byOrder = (a: CategoryDto, b: CategoryDto) => a.position - b.position || a.name.localeCompare(b.name);

/** ແບນ tree ເປັນລາຍການ depth-first ພ້ອມ depth ສຳລັບ indent. ໝວດທີ່ແມ່ຫາຍຖືເປັນຮາກ; ກັນວົງຈອນ. */
export function flattenCategories(list: readonly CategoryDto[]): CategoryRow[] {
  const ids = new Set(list.map((category) => category.id));
  const children = new Map<string | null, CategoryDto[]>();
  for (const category of list) {
    const key = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    children.set(key, [...(children.get(key) ?? []), category]);
  }
  const rows: CategoryRow[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const category of [...(children.get(parent) ?? [])].sort(byOrder)) {
      if (seen.has(category.id)) continue;
      seen.add(category.id);
      rows.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** id ຂອງລູກຫຼານທຸກຊັ້ນຂອງ `id` (ບໍ່ລວມ `id` ເອງ) */
export function descendantIds(list: readonly CategoryDto[], id: string): Set<string> {
  const result = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const category of list) {
      if (category.parentId === current && !result.has(category.id)) {
        result.add(category.id);
        queue.push(category.id);
      }
    }
  }
  return result;
}
```

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/lib/category-tree.test.ts` → PASS.

```bash
git add apps/admin/src/lib/category-tree.ts apps/admin/src/lib/category-tree.test.ts
git commit -m "feat(admin): category tree helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib/category-tree.ts apps/admin/src/lib/category-tree.test.ts
```

---

### Task 8: ໜ້າ `/categories`

**Files:**
- Create: `apps/admin/src/components/categories/category-form-dialog.tsx`, `category-form-dialog.test.tsx`
- Create: `apps/admin/src/components/categories/category-list.tsx`, `category-list.test.tsx`
- Create: `apps/admin/src/app/(app)/categories/page.tsx`
- Modify: `apps/admin/src/lib/i18n/dictionary.ts`

- [ ] **Step 1: dictionary**

`lo`:
```ts
  "categories.title": "ໝວດໝູ່",
  "categories.description": "ຈັດກຸ່ມສິນຄ້າ (ຮອງຮັບໝວດຍ່ອຍ)",
  "categories.count": "{count} ໝວດ",
  "categories.add": "ເພີ່ມໝວດໝູ່",
  "categories.col.name": "ຊື່ໝວດ",
  "categories.col.slug": "Slug",
  "categories.col.products": "ສິນຄ້າ",
  "categories.col.position": "ລຳດັບ",
  "categories.empty.title": "ຍັງບໍ່ມີໝວດໝູ່",
  "categories.edit": "ແກ້ໄຂໝວດ",
  "categories.delete": "ລຶບໝວດ",
  "categories.deleteTitle": "ລຶບໝວດນີ້?",
  "categories.deleteDescription": "ໝວດ {name} ຈະຖືກລຶບ ແລະ ໝວດຍ່ອຍຈະຍ້າຍຂຶ້ນໄປລະດັບເທິງ.",
  "categories.form.createTitle": "ເພີ່ມໝວດໝູ່",
  "categories.form.createDescription": "ຕັ້ງຊື່ ແລະ ເລືອກໝວດແມ່ (ຖ້າມີ)",
  "categories.form.editDescription": "ແກ້ໄຂຊື່, slug, ໝວດແມ່ ຫຼື ລຳດັບ",
  "categories.form.parent": "ໝວດແມ່",
  "categories.form.noParent": "— ບໍ່ມີ (ໝວດຫຼັກ) —",
  "categories.form.slugHint": "ເວັ້ນໄວ້ເພື່ອສ້າງຈາກຊື່ອັດຕະໂນມັດ (a–z, 0–9, -)",
  "categories.toast.created": "ເພີ່ມໝວດໝູ່ແລ້ວ",
  "categories.toast.updated": "ບັນທຶກໝວດໝູ່ແລ້ວ",
  "categories.toast.deleted": "ລຶບໝວດໝູ່ແລ້ວ",
```
`en`:
```ts
  "categories.title": "Categories",
  "categories.description": "Group products (sub-categories supported)",
  "categories.count": "{count} categories",
  "categories.add": "Add category",
  "categories.col.name": "Category",
  "categories.col.slug": "Slug",
  "categories.col.products": "Products",
  "categories.col.position": "Order",
  "categories.empty.title": "No categories yet",
  "categories.edit": "Edit category",
  "categories.delete": "Delete category",
  "categories.deleteTitle": "Delete this category?",
  "categories.deleteDescription": "{name} will be deleted and its sub-categories move up one level.",
  "categories.form.createTitle": "Add category",
  "categories.form.createDescription": "Set a name and choose a parent (optional)",
  "categories.form.editDescription": "Edit the name, slug, parent or order",
  "categories.form.parent": "Parent category",
  "categories.form.noParent": "— None (top level) —",
  "categories.form.slugHint": "Leave empty to generate it from the name (a–z, 0–9, -)",
  "categories.toast.created": "Category added",
  "categories.toast.updated": "Category saved",
  "categories.toast.deleted": "Category deleted",
```

- [ ] **Step 2: ຂຽນ test dialog ທີ່ຈະລົ້ມ** `category-form-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CategoryDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CategoryFormDialog } from "./category-form-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const cat = (id: string, parentId: string | null, name = id): CategoryDto => ({
  id,
  name,
  slug: id,
  parentId,
  position: 0,
  productCount: 0,
});
const all = [cat("a", null, "Alpha"), cat("a1", "a", "Alpha child"), cat("b", null, "Beta")];

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("CategoryFormDialog", () => {
  it("ສ້າງ: ສົ່ງ name + position ເທົ່ານັ້ນ ເມື່ອ slug ແລະ ໝວດແມ່ຫວ່າງ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(cat("n", null));
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={onOpenChange} category={null} categories={all} />,
    );
    await user.type(screen.getByLabelText("Category"), "Shoes");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/categories", { method: "POST", body: { name: "Shoes", position: 0 } }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ເລືອກໝວດແມ່ ແລະ ກຳນົດ slug/ລຳດັບ", async () => {
    vi.mocked(apiFetch).mockResolvedValue(cat("n", "b"));
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={vi.fn()} category={null} categories={all} />,
    );
    await user.type(screen.getByLabelText("Category"), "Hats");
    await user.type(screen.getByLabelText("Slug"), "hats");
    await user.selectOptions(screen.getByLabelText("Parent category"), "b");
    await user.clear(screen.getByLabelText("Order"));
    await user.type(screen.getByLabelText("Order"), "3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/categories", {
        method: "POST",
        body: { name: "Hats", slug: "hats", parentId: "b", position: 3 },
      }),
    );
  });

  it("ແກ້ໄຂ: dropdown ໝວດແມ່ບໍ່ມີໂຕເອງ ແລະ ລູກຫຼານ; PATCH parentId=null ເມື່ອເລືອກ 'ບໍ່ມີ'", async () => {
    vi.mocked(apiFetch).mockResolvedValue(cat("a1", null));
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={vi.fn()} category={all[1] ?? null} categories={all} />,
    );
    const select = screen.getByLabelText("Parent category");
    const options = within(select).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["— None (top level) —", "Alpha", "Beta"]); // ບໍ່ມີ "Alpha child" (ໂຕເອງ)
    await user.selectOptions(select, "");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/categories/a1", {
        method: "PATCH",
        body: { name: "Alpha child", slug: "a1", parentId: null, position: 0 },
      }),
    );
  });

  it("ແກ້ໝວດ a: ບໍ່ມີ a ແລະ ລູກ a1 ໃນຕົວເລືອກໝວດແມ່", () => {
    renderWithProviders(<CategoryFormDialog open onOpenChange={vi.fn()} category={all[0] ?? null} categories={all} />);
    const options = within(screen.getByLabelText("Parent category")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["— None (top level) —", "Beta"]);
  });

  it("slug ຊ້ຳ (DUPLICATE_VALUE) ສະແດງຂໍ້ຄວາມແປ", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "dup", [], "DUPLICATE_VALUE"));
    const { user } = renderWithProviders(
      <CategoryFormDialog open onOpenChange={vi.fn()} category={null} categories={all} />,
    );
    await user.type(screen.getByLabelText("Category"), "X");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This value already exists");
  });
});
```

- [ ] **Step 3: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/categories/category-form-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 4: ຂຽນ `category-form-dialog.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createCategorySchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Select, toast } from "@oca/ui";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { descendantIds, flattenCategories } from "@/lib/category-tree";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useSaveCategory } from "@/lib/queries";
import type { CategoryDto } from "@/lib/types";
import { validationText } from "@/lib/validation-text";

/** slug ເປົ່າ = ໃຫ້ API ສ້າງເອງ; ຮູບແບບກວດດ້ວຍ schema ຂອງ shared ເມື່ອມີຄ່າ */
const formSchema = z.object({
  name: createCategorySchema.shape.name,
  slug: z.union([z.literal(""), z.string().trim().pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100))]),
  parentId: z.string(),
  position: z.coerce.number().int().min(0),
});
type FormValues = z.input<typeof formSchema>;

export interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryDto | null;
  categories: CategoryDto[];
}

export function CategoryFormDialog({ open, onOpenChange, category, categories }: CategoryFormDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <CategoryForm
          key={category?.id ?? "new"}
          category={category}
          categories={categories}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  categories,
  onDone,
}: {
  category: CategoryDto | null;
  categories: CategoryDto[];
  onDone: () => void;
}) {
  const { t } = useT();
  const save = useSaveCategory();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      parentId: category?.parentId ?? "",
      position: category?.position ?? 0,
    },
  });

  // ໝວດແມ່ຕ້ອງບໍ່ແມ່ນໂຕເອງ/ລູກຫຼານ (API ຕອບ 400): ຕັດອອກຈາກຕົວເລືອກ
  const parentOptions = useMemo(() => {
    const blocked = category ? new Set([category.id, ...descendantIds(categories, category.id)]) : new Set<string>();
    return flattenCategories(categories).filter((row) => !blocked.has(row.category.id));
  }, [categories, category]);

  const submit = handleSubmit(async (raw) => {
    setFormError(null);
    const values = formSchema.parse(raw);
    try {
      if (category) {
        await save.mutateAsync({
          id: category.id,
          input: {
            name: values.name,
            slug: values.slug || category.slug,
            parentId: values.parentId === "" ? null : values.parentId,
            position: values.position,
          },
        });
        toast.success(t("categories.toast.updated"));
      } else {
        await save.mutateAsync({
          input: {
            name: values.name,
            ...(values.slug ? { slug: values.slug } : {}),
            ...(values.parentId ? { parentId: values.parentId } : {}),
            position: values.position,
          },
        });
        toast.success(t("categories.toast.created"));
      }
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader
        title={category ? t("categories.edit") : t("categories.form.createTitle")}
        description={category ? t("categories.form.editDescription") : t("categories.form.createDescription")}
      />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={t("categories.col.name")}
            htmlFor="category-name"
            required
            error={errors.name ? validationText("name", t) : undefined}
          >
            <Input id="category-name" invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field
            label={t("categories.col.slug")}
            htmlFor="category-slug"
            error={errors.slug ? validationText("slug", t) : undefined}
          >
            <Input id="category-slug" invalid={!!errors.slug} {...register("slug")} />
            <p className="mt-1 text-xs text-ink-muted">{t("categories.form.slugHint")}</p>
          </Field>
          <Field label={t("categories.form.parent")} htmlFor="category-parent">
            <Select id="category-parent" {...register("parentId")}>
              <option value="">{t("categories.form.noParent")}</option>
              {parentOptions.map((row) => (
                <option key={row.category.id} value={row.category.id}>
                  {`${"— ".repeat(row.depth)}${row.category.name}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("categories.col.position")}
            htmlFor="category-position"
            error={errors.position ? validationText("position", t) : undefined}
          >
            <Input id="category-position" type="number" min={0} invalid={!!errors.position} {...register("position")} />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

ໝາຍເຫດ: option ຂອງໝວດຍ່ອຍມີ prefix `"— "` ຕາມ depth; test ຂ້າງເທິງໃຊ້ໝວດ depth 0 ເທົ່ານັ້ນໃນລາຍການທີ່ສະແດງ (Alpha, Beta) ຈຶ່ງບໍ່ມີ prefix.

- [ ] **Step 5: ຣັນ test dialog**

Run: `pnpm --filter @oca/admin exec vitest run src/components/categories/category-form-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: ຂຽນ test list ທີ່ຈະລົ້ມ** `category-list.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CategoryDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CategoryList } from "./category-list";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const rows: CategoryDto[] = [
  { id: "a", name: "Apparel", slug: "apparel", parentId: null, position: 0, productCount: 2 },
  { id: "a1", name: "Shirts", slug: "shirts", parentId: "a", position: 0, productCount: 0 },
];

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path === "/categories" && !options?.method) return rows;
    return undefined;
  }) as typeof apiFetch);
});

describe("CategoryList", () => {
  it("ສະແດງເປັນ tree (ລູກຢູ່ລຸ່ມແມ່) ພ້ອມຈຳນວນສິນຄ້າ", async () => {
    renderWithProviders(<CategoryList />);
    const parent = await screen.findByTestId("row-category-a");
    const child = screen.getByTestId("row-category-a1");
    expect(within(parent).getByText("Apparel")).toBeInTheDocument();
    expect(within(parent).getByText("2")).toBeInTheDocument();
    expect(child.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getByText("2 categories")).toBeInTheDocument();
  });

  it("ລຶບ: ຢືນຢັນແລ້ວ DELETE /categories/:id", async () => {
    const { user } = renderWithProviders(<CategoryList />);
    await screen.findByTestId("row-category-a1");
    await user.click(within(screen.getByTestId("row-category-a1")).getByRole("button", { name: /Delete category/ }));
    await user.click(await screen.findByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/categories/a1", { method: "DELETE" }));
  });

  it("ລຶບແລ້ວ API ຕອບ CATEGORY_IN_USE: dialog ປິດ ແລະ ບໍ່ crash", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (path === "/categories" && !options?.method) return rows;
      throw new ApiError(409, "x", [], "CATEGORY_IN_USE");
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<CategoryList />);
    await screen.findByTestId("row-category-a");
    await user.click(within(screen.getByTestId("row-category-a")).getByRole("button", { name: /Delete category/ }));
    await user.click(await screen.findByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete category" })).toBeNull());
  });

  it("ບໍ່ມີ inventory:write: ບໍ່ມີປຸ່ມເພີ່ມ/ແກ້/ລຶບ", async () => {
    auth.canWrite = false;
    renderWithProviders(<CategoryList />);
    await screen.findByTestId("row-category-a");
    expect(screen.queryByRole("button", { name: "Add category" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit category/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete category/ })).toBeNull();
  });

  it("ວ່າງ: empty state", async () => {
    vi.mocked(apiFetch).mockResolvedValue([] as never);
    renderWithProviders(<CategoryList />);
    expect(await screen.findByText("No categories yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/categories/category-list.test.tsx`
Expected: FAIL.

- [ ] **Step 8: ຂຽນ `category-list.tsx`**

```tsx
"use client";

import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  toast,
} from "@oca/ui";
import { AlertCircle, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { flattenCategories } from "@/lib/category-tree";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCategories, useDeleteCategory } from "@/lib/queries";
import type { CategoryDto } from "@/lib/types";
import { CategoryFormDialog } from "./category-form-dialog";

const COLUMNS = 5;

export function CategoryList() {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const query = useCategories();
  const remove = useDeleteCategory();
  const [formOpen, setFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<CategoryDto | null>(null);
  const [deleting, setDeleting] = useState<CategoryDto | null>(null);

  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = useMemo(() => flattenCategories(all), [all]);

  function openForm(category: CategoryDto | null) {
    setFormCategory(category);
    setFormOpen(true);
  }

  async function confirmDelete(category: CategoryDto) {
    try {
      await remove.mutateAsync(category.id);
      toast.success(t("categories.toast.deleted"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setDeleting(null);
    }
  }

  const addButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => openForm(null)}>
      <Plus aria-hidden="true" />
      {t("categories.add")}
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("categories.title")]}
        title={t("categories.title")}
        badge={query.data ? t("categories.count", { count: all.length }) : undefined}
        description={t("categories.description")}
        actions={addButton}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <Card className="overflow-hidden rounded-[20px]">
          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("categories.col.name")}</TableHead>
                    <TableHead>{t("categories.col.slug")}</TableHead>
                    <TableHead className="text-right">{t("categories.col.products")}</TableHead>
                    <TableHead className="text-right">{t("categories.col.position")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map(({ category, depth }) => (
                    <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                      <TableCell>
                        <span className="font-medium text-ink" style={{ paddingLeft: `${depth * 20}px` }}>
                          {depth > 0 ? <span aria-hidden="true" className="mr-1 text-ink-muted">└</span> : null}
                          {category.name}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-ink-secondary">{category.slug}</TableCell>
                      <TableCell className="text-right tabular-nums">{category.productCount}</TableCell>
                      <TableCell className="text-right tabular-nums text-ink-secondary">{category.position}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t("categories.edit")} ${category.name}`}
                                title={t("categories.edit")}
                                onClick={() => openForm(category)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t("categories.delete")} ${category.name}`}
                                title={t("categories.delete")}
                                onClick={() => setDeleting(category)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.isPending && rows.length === 0 ? (
                <EmptyState icon={FolderTree} title={t("categories.empty.title")} action={addButton} />
              ) : null}
            </>
          )}
        </Card>
      </div>

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={formCategory} categories={all} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("categories.deleteTitle")}
        description={t("categories.deleteDescription", { name: deleting?.name ?? "" })}
        confirmLabel={t("categories.delete")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        busy={remove.isPending}
        onConfirm={() => (deleting ? confirmDelete(deleting) : undefined)}
      />
    </div>
  );
}
```

- [ ] **Step 9: ໜ້າ** `apps/admin/src/app/(app)/categories/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { CategoryList } from "@/components/categories/category-list";

export default function CategoriesPage() {
  return (
    <PermissionGate permission="inventory:read">
      <CategoryList />
    </PermissionGate>
  );
}
```

- [ ] **Step 10: ຣັນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/categories && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/admin/src/components/categories "apps/admin/src/app/(app)/categories" apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): categories page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/categories "apps/admin/src/app/(app)/categories" apps/admin/src/lib/i18n/dictionary.ts
```

---

### Task 9: ໜ້າ `/settings` (ຕັ້ງຄ່າຮ້ານ)

ຟອມ: ຊື່ຮ້ານ, VAT % (string, ≤2 ທົດສະນິຍົມ), "ລາຄາລວມ VAT ແລ້ວ" (checkbox), ນາທີຈອງສະຕ໋ອກ (1–10080). ສະກຸນເງິນຖານສະແດງຢ່າງດຽວ (ປ່ຽນບໍ່ໄດ້ໃນ 1a). ເມື່ອບໍ່ມີ `inventory:write` ຟອມເປັນ read-only ແລະບໍ່ມີປຸ່ມບັນທຶກ.

**Files:**
- Create: `apps/admin/src/components/settings/store-settings-form.tsx`, `store-settings-form.test.tsx`
- Create: `apps/admin/src/app/(app)/settings/page.tsx`
- Modify: `apps/admin/src/lib/i18n/dictionary.ts`

- [ ] **Step 1: dictionary**

`lo`:
```ts
  "settings.title": "ຕັ້ງຄ່າຮ້ານ",
  "settings.description": "ຂໍ້ມູນຮ້ານ, VAT ແລະ ເວລາຈອງສະຕ໋ອກ",
  "settings.name": "ຊື່ຮ້ານ",
  "settings.currency": "ສະກຸນເງິນຫຼັກ",
  "settings.currencyHint": "ປ່ຽນບໍ່ໄດ້ໃນເວີຊັນນີ້",
  "settings.vatRate": "VAT (%)",
  "settings.vatHint": "ເຊັ່ນ 7 ຫຼື 10.5 (ສູງສຸດ 2 ທົດສະນິຍົມ)",
  "settings.pricesIncludeVat": "ລາຄາຂາຍລວມ VAT ແລ້ວ",
  "settings.reservationMinutes": "ເວລາຈອງສະຕ໋ອກ (ນາທີ)",
  "settings.reservationHint": "ບິນທີ່ບໍ່ຊຳລະພາຍໃນເວລານີ້ຈະໝົດອາຍຸ ແລະ ຄືນສະຕ໋ອກ (1–10,080)",
  "settings.toast.saved": "ບັນທຶກການຕັ້ງຄ່າແລ້ວ",
  "settings.validation.vat": "VAT ຕ້ອງເປັນຕົວເລກ 0–100 (ສູງສຸດ 2 ທົດສະນິຍົມ)",
  "settings.validation.minutes": "ຕ້ອງເປັນຈຳນວນເຕັມ 1–10,080",
```
`en`:
```ts
  "settings.title": "Store settings",
  "settings.description": "Store details, VAT and stock reservation time",
  "settings.name": "Store name",
  "settings.currency": "Base currency",
  "settings.currencyHint": "Cannot be changed in this version",
  "settings.vatRate": "VAT (%)",
  "settings.vatHint": "e.g. 7 or 10.5 (up to 2 decimals)",
  "settings.pricesIncludeVat": "Selling prices include VAT",
  "settings.reservationMinutes": "Stock reservation time (minutes)",
  "settings.reservationHint": "Unpaid orders expire after this time and release their stock (1–10,080)",
  "settings.toast.saved": "Settings saved",
  "settings.validation.vat": "VAT must be a number from 0 to 100 (up to 2 decimals)",
  "settings.validation.minutes": "Must be a whole number from 1 to 10,080",
```

- [ ] **Step 2: ຂຽນ test ທີ່ຈະລົ້ມ** `store-settings-form.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { StoreSettingsDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StoreSettingsForm } from "./store-settings-form";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const settings: StoreSettingsDto = {
  name: "OCA Store",
  baseCurrency: "LAK",
  vatRate: "10.00",
  pricesIncludeVat: true,
  reservationMinutes: 30,
};

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) =>
    options?.method === "PATCH" ? settings : settings) as typeof apiFetch);
});

describe("StoreSettingsForm", () => {
  it("ໂຫຼດຄ່າເຂົ້າຟອມ ແລະ ສະແດງສະກຸນເງິນຫຼັກແບບອ່ານຢ່າງດຽວ", async () => {
    renderWithProviders(<StoreSettingsForm />);
    expect(await screen.findByDisplayValue("OCA Store")).toBeInTheDocument();
    expect(screen.getByLabelText("VAT (%)")).toHaveValue("10.00");
    expect(screen.getByLabelText("Stock reservation time (minutes)")).toHaveValue(30);
    expect(screen.getByLabelText("Base currency")).toHaveValue("LAK");
    expect(screen.getByLabelText("Base currency")).toBeDisabled();
  });

  it("ບັນທຶກ: PATCH ພ້ອມ vatRate ເປັນ string ແລະ ນາທີເປັນຕົວເລກ", async () => {
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.clear(screen.getByLabelText("VAT (%)"));
    await user.type(screen.getByLabelText("VAT (%)"), "7");
    await user.clear(screen.getByLabelText("Stock reservation time (minutes)"));
    await user.type(screen.getByLabelText("Stock reservation time (minutes)"), "45");
    await user.click(screen.getByRole("checkbox", { name: "Selling prices include VAT" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/settings/store", {
        method: "PATCH",
        body: { name: "OCA Store", vatRate: "7", pricesIncludeVat: false, reservationMinutes: 45 },
      }),
    );
  });

  it("VAT ເກີນ 100 ຫຼື ນາທີ 0: ສະແດງ error ແລະ ບໍ່ສົ່ງ", async () => {
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.clear(screen.getByLabelText("VAT (%)"));
    await user.type(screen.getByLabelText("VAT (%)"), "101");
    await user.clear(screen.getByLabelText("Stock reservation time (minutes)"));
    await user.type(screen.getByLabelText("Stock reservation time (minutes)"), "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("VAT must be a number from 0 to 100 (up to 2 decimals)")).toBeInTheDocument();
    expect(screen.getByText("Must be a whole number from 1 to 10,080")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/settings/store", expect.objectContaining({ method: "PATCH" }));
  });

  it("API error ສະແດງໃນຟອມ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "PATCH") throw new ApiError(403, "no", [], "FORBIDDEN");
      return settings;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StoreSettingsForm />);
    await screen.findByDisplayValue("OCA Store");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no");
  });

  it("ບໍ່ມີ inventory:write: ຟອມອ່ານຢ່າງດຽວ ແລະ ບໍ່ມີປຸ່ມບັນທຶກ", async () => {
    auth.canWrite = false;
    renderWithProviders(<StoreSettingsForm />);
    expect(await screen.findByDisplayValue("OCA Store")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
```

(ໝາຍເຫດ: ກໍລະນີ "API error" `FORBIDDEN` ເປັນ code ທົ່ວໄປ ຈຶ່ງສະແດງ `message` ("no") ຕາມ `errorMessage`.)

- [ ] **Step 3: ຣັນໃຫ້ລົ້ມ**

Run: `pnpm --filter @oca/admin exec vitest run src/components/settings/store-settings-form.test.tsx`
Expected: FAIL.

- [ ] **Step 4: ຂຽນ `store-settings-form.tsx`**

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MAX_RESERVATION_MINUTES, vatRateSchema } from "@oca/shared";
import { Button, Card, EmptyState, Field, Input, PageHeader, Skeleton, toast } from "@oca/ui";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCan } from "@/components/auth/auth-provider";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useStoreSettings, useUpdateStoreSettings } from "@/lib/queries";
import type { StoreSettingsDto } from "@/lib/types";
import { validationText } from "@/lib/validation-text";

const formSchema = z.object({
  name: z.string().trim().min(1).max(100),
  vatRate: vatRateSchema,
  pricesIncludeVat: z.boolean(),
  reservationMinutes: z.coerce.number().int().min(1).max(MAX_RESERVATION_MINUTES),
});
type FormValues = z.input<typeof formSchema>;

export function StoreSettingsForm() {
  const { t } = useT();
  const query = useStoreSettings();

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("settings.title")]}
        title={t("settings.title")}
        description={t("settings.description")}
      />
      <div className="px-3 pb-10 sm:px-6">
        <Card className="max-w-2xl rounded-[20px] p-6">
          {query.isError ? (
            <EmptyState
              icon={AlertCircle}
              title={t("common.error.load")}
              action={
                <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : query.data ? (
            <SettingsFields settings={query.data} />
          ) : (
            <div className="space-y-4" aria-busy="true">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-1/2" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SettingsFields({ settings }: { settings: StoreSettingsDto }) {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const update = useUpdateStoreSettings();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: settings.name,
      vatRate: settings.vatRate,
      pricesIncludeVat: settings.pricesIncludeVat,
      reservationMinutes: settings.reservationMinutes,
    },
  });

  // ຫຼັງບັນທຶກ/refetch ຄ່າຈາກ server ປ່ຽນ → ຮີເຊັດຟອມໃຫ້ກົງ
  useEffect(() => {
    reset({
      name: settings.name,
      vatRate: settings.vatRate,
      pricesIncludeVat: settings.pricesIncludeVat,
      reservationMinutes: settings.reservationMinutes,
    });
  }, [settings, reset]);

  const submit = handleSubmit(async (raw) => {
    setFormError(null);
    const values = formSchema.parse(raw);
    try {
      await update.mutateAsync(values);
      toast.success(t("settings.toast.saved"));
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {formError}
        </p>
      ) : null}
      <Field
        label={t("settings.name")}
        htmlFor="settings-name"
        required
        error={errors.name ? validationText("name", t) : undefined}
      >
        <Input id="settings-name" disabled={!canWrite} invalid={!!errors.name} {...register("name")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("settings.currency")} htmlFor="settings-currency">
          <Input id="settings-currency" value={settings.baseCurrency} disabled readOnly />
          <p className="mt-1 text-xs text-ink-muted">{t("settings.currencyHint")}</p>
        </Field>
        <Field
          label={t("settings.vatRate")}
          htmlFor="settings-vat"
          required
          error={errors.vatRate ? t("settings.validation.vat") : undefined}
        >
          <Input
            id="settings-vat"
            inputMode="decimal"
            disabled={!canWrite}
            invalid={!!errors.vatRate}
            {...register("vatRate")}
          />
          <p className="mt-1 text-xs text-ink-muted">{t("settings.vatHint")}</p>
        </Field>
        <Field
          label={t("settings.reservationMinutes")}
          htmlFor="settings-minutes"
          required
          error={errors.reservationMinutes ? t("settings.validation.minutes") : undefined}
        >
          <Input
            id="settings-minutes"
            type="number"
            min={1}
            max={MAX_RESERVATION_MINUTES}
            disabled={!canWrite}
            invalid={!!errors.reservationMinutes}
            {...register("reservationMinutes")}
          />
          <p className="mt-1 text-xs text-ink-muted">{t("settings.reservationHint")}</p>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="size-4 rounded border-line accent-[var(--color-brand)]"
          disabled={!canWrite}
          {...register("pricesIncludeVat")}
        />
        {t("settings.pricesIncludeVat")}
      </label>
      {canWrite ? (
        <div className="flex justify-end">
          <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={isSubmitting}>
            {isSubmitting ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
```

ໝາຍເຫດ: checkbox ໃຊ້ `<input type="checkbox">` ພື້ນເມືອງ (ກົງກັບ `register` ຂອງ react-hook-form ແລະ `getByRole("checkbox")`) ແທນ Radix `Checkbox` ທີ່ຕ້ອງ `Controller`. ຖ້າ `Skeleton` ບໍ່ຮັບ prop `className` ໃຫ້ເບິ່ງ `packages/ui/src/components/skeleton.tsx` ແລ້ວປັບ.

- [ ] **Step 5: ໜ້າ** `apps/admin/src/app/(app)/settings/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { StoreSettingsForm } from "@/components/settings/store-settings-form";

export default function SettingsPage() {
  return (
    <PermissionGate permission="inventory:read">
      <StoreSettingsForm />
    </PermissionGate>
  );
}
```

- [ ] **Step 6: ຣັນ test + typecheck + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/settings && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/settings "apps/admin/src/app/(app)/settings" apps/admin/src/lib/i18n/dictionary.ts
git commit -m "feat(admin): store settings page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/settings "apps/admin/src/app/(app)/settings" apps/admin/src/lib/i18n/dictionary.ts
```

---

### Task 10: ກວດທັງ repo

- [ ] **Step 1:** ຣັນທັງໝົດ (ຕ້ອງຂຽວ):

```bash
pnpm lint && pnpm build && pnpm test
```
Expected: ທຸກ task ສຳເລັດ; admin test ເພີ່ມຂຶ້ນຈາກ 63.

- [ ] **Step 2:** ຖ້າ `next build` ຮ້ອງ type error ໃນ `app/(app)/*/page.tsx` ໃຫ້ແກ້ຕາມ error (ປົກກະຕິ import path ຜິດ).

---

### Task 11: ກວດຈິງໃນ browser (smoke)

**ຫ້າມແຕະ Postgres 5432 / Redis 6379.** ໃຊ້ dev DB 5433 ຕາມ `.env`.

- [ ] **Step 1: ກວດ infra** — `grep -E "^(DATABASE_URL|REDIS_URL)=" .env; nc -z localhost 5433 && echo pg-ok`. ຖ້າບໍ່ຕອບ ໃຫ້ຢຸດ ແລ້ວແຈ້ງຜູ້ໃຊ້.
- [ ] **Step 2: ເປີດ API + admin ພອດແຍກ** (ຢ່າ kill ຂອງຜູ້ໃຊ້ຢູ່ :3001/:3000):

```bash
pnpm --filter @oca/shared build && pnpm --filter @oca/database build
PORT=3002 pnpm --filter @oca/api dev            # run_in_background
API_URL=http://localhost:3002 pnpm --filter @oca/admin exec next dev --port 3100   # run_in_background
```
- [ ] **Step 3:** ເຂົ້າ `http://localhost:3100/login` ດ້ວຍ owner ຂອງ seed (`SEED_OWNER_EMAIL`/`SEED_OWNER_PASSWORD` ໃນ `.env`). ກວດ:
  1. sidebar ມີກຸ່ມ "ສະຕ໊ອກ" (ສາງ, ໝວດໝູ່) ແລະ "ຕັ້ງຄ່າຮ້ານ".
  2. `/warehouses`: ເຫັນສາງ `MAIN` ເປັນ "ສາງຫຼັກ"; ເພີ່ມ `B2`; ຕັ້ງ `B2` ເປັນສາງຫຼັກ (ປ້າຍຍ້າຍ); ປິດ `MAIN` ສຳເລັດ; ປິດ `B2` (default) ບໍ່ມີປຸ່ມ.
  3. `/categories`: ເພີ່ມໝວດແມ່ ແລະ ໝວດຍ່ອຍ (indent ຖືກ); ແກ້ໝວດແມ່ບໍ່ເຫັນລູກໃນຕົວເລືອກໝວດແມ່; ລຶບໝວດຍ່ອຍ.
  4. `/settings`: ປ່ຽນ VAT ເປັນ `7` ແລ້ວ refresh ເຫັນ `7.00`; ໃສ່ 101 ເຫັນຂໍ້ຄວາມຜິດ.
  5. ສະຫຼັບພາສາ lo/en ໄດ້ ແລະບໍ່ມີ key ດິບ (ຮູບແບບ `warehouses.xxx`) ຢູ່ໜ້າຈໍ.
- [ ] **Step 4:** ຢຸດ process ທີ່ເຮົາເປີດເອງ (ບໍ່ແມ່ນຂອງຜູ້ໃຊ້). ຄືນຄ່າ: ປ່ຽນສາງ default ກັບໄປ `MAIN`, ລຶບໝວດທົດສອບ, VAT ເປັນຄ່າເດີມ.

### Task 12: ອັບເດດ docs ແລະ memory

- [ ] **Step 1:** ໃນ spec `docs/superpowers/specs/2026-10-04-phase1-a-inventory-design.md` §10 ເພີ່ມບັນທັດໃຕ້ຕາຕະລາງ: "ແບ່ງ 1a-ui ເປັນ 4 plan: A4 ພື້ນຖານ+ສາງ+ໝວດໝູ່+ຕັ້ງຄ່າ, A5 ສິນຄ້າ, A6 ສະຕ໋ອກ, A7 ບິນ". Commit ດ້ວຍ `git commit -m "docs: split 1a-ui into four plans" -- docs/superpowers/specs/2026-10-04-phase1-a-inventory-design.md`.
- [ ] **Step 2:** ອັບເດດ memory `phase1-progress` (A4 ສຳເລັດ; ຕໍ່ໄປ A5).

---

## Self-review

* **Spec §10:** `/warehouses` (Task 6), `/categories` (Task 8), `/settings` (Task 9) ຄົບ; ປຸ່ມຊ່ອນຕາມສິດ (`useCan("inventory:write")`) ທັງ 3 ໜ້າ; loading/empty/error ຄົບ (skeleton, EmptyState, retry); error ແປຈາກ `code` (Task 1, spec §6.2). `/products`, `/stock`, `/orders` ຢູ່ A5–A7.
* **Contract fixes ຂອງ API ທີ່ນຳໃຊ້:** `vatRate` string (Task 9), `*_NOT_FOUND`/`code` (Task 1), ສິດແຍກ (A7 ຈະໃຊ້ `orders:*`, `payments:write`, `logistics:write`, `costs:read`).
* **Names ສອດຄ່ອງ:** `ServerPager`/`MAX_SERVER_PAGE_SIZE` (Task 3) ໃຊ້ໃນ A5–A7; `toQueryString`, `formatMoney`, `formatQuantity`, `formatDateTime`, `useDebounced` (Task 2); `queryKeys.*` ແລະ `useInvalidate` (Task 4); `flattenCategories` ຈະໃຊ້ອີກໃນ A5 (ຕົວເລືອກໝວດຂອງສິນຄ້າ).
* **ບໍ່ມີ placeholder:** ທຸກ step ມີໂຄດ/ຄຳສັ່ງຄົບ.
