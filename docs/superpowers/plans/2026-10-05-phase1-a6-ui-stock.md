# Phase 1-A6: Admin UI ສະຕ໋ອກ (`/stock`: ຍອດ + ປະຫວັດ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ໜ້າ `/stock` ມີ 2 ແຖບ: "ຍອດ" (ຕາຕະລາງຕາມ variant × ສາງ ພ້ອມ filter, ໄອຄອນໃກ້ໝົດ, ຮັບ/ປັບ/ຍ້າຍ/ຮັບຄືນ/ຕັ້ງເກນ) ແລະ "ປະຫວັດ" (`StockMovement` ພ້ອມ filter type/variant/ວັນທີ). ຮັບສະຕ໋ອກຄັ້ງທຳອິດຂອງ variant ໃໝ່ (ທີ່ຍັງບໍ່ມີແຖວສະຕ໋ອກ) ເຮັດໄດ້ຜ່ານ variant picker.

**Architecture:** ປະຕິບັດການສະຕ໋ອກທັງ 4 ແບບ (receive/adjust/transfer/return) ໃຊ້ dialog ດຽວ `StockOpDialog` ທີ່ປ່ຽນຊຸດ field ຕາມ `mode` ແລະ validate ດ້ວຍ schema ຂອງ `@oca/shared` ກ່ອນສົ່ງ. `VariantPicker` (autocomplete ຜ່ານ `GET /variants`) ເປັນ component ກາງທີ່ Plan A7 (ຟອມບິນ) ໃຊ້ຕໍ່. ຂໍ້ຜິດພາດ `INSUFFICIENT_STOCK` ສະແດງລາຍການ `shortages` ຈາກ `ApiError.body`.

**Tech Stack:** ຄືກັບ Plan A4.

**ອ້າງອີງ:** spec [Phase 1-A §5 (stock ops), §6, §10](../specs/2026-10-04-phase1-a-inventory-design.md); [DESIGN.md](../../DESIGN.md) ຊະນະເມື່ອຂັດ.

**ກ່ອນເລີ່ມ:** Plan A4 ແລະ A5 ສຳເລັດແລ້ວ (ໃຊ້ `ServerPager`, `useDebounced`, `formatQuantity`, `formatDateTime`, `useWarehouses`, `VariantSearchItemDto` ຈາກ A5, hooks ຂອງ A4). ອ່ານ "ຂໍ້ຕົກລົງສຳຄັນ" ຂອງ A4 (branch, commit trailer, ຫ້າມ `git add -A`, ວິທີເພີ່ມ key dictionary, ຫ້າມແຕະ 5432/6379).

## ຂໍ້ຕົກລົງສະເພາະ plan ນີ້

* **ສັນຍາ API:** `GET /stock?warehouseId&variantId&q&lowStock=true&page&pageSize` → `Page<StockLevelDto>`; `GET /stock/movements?variantId&warehouseId&orderId&type&from&to&page&pageSize` → `Page<StockMovementDto>` (ໃໝ່→ເກົ່າ); `POST /stock/receive|adjust|return` (ຕອບ 201 + StockLevelDto), `POST /stock/transfer` (201 + `{from,to}`); `PATCH /stock/:id/threshold` `{ lowStockThreshold: int≥0 | null }`; `GET /variants?q&includeInactive` (A5/API ເພີ່ມແລ້ວ). ສິດ: ອ່ານ `inventory:read`, ຂຽນ `inventory:write`.
* **ວັນທີໃນ filter ປະຫວັດ** ສົ່ງເປັນ `YYYY-MM-DD` ຈາກ `<input type="date">` ໂດຍກົງ: API ຖືເປັນເວລາຮ້ານ (UTC+7) ແລະ `to` ຮວມທັງມື້ (spec §5). **ຫ້າມ** ແປງເປັນ ISO ໃນ client.
* **ຮັບຄືນ (return):** ໃນ plan ນີ້ບໍ່ຜູກກັບບິນ (ບໍ່ສົ່ງ `orderId`); API ຮອງຮັບ `orderId` ເປັນ optional ແລະ UI ຜູກກັບບິນຈະເພີ່ມຈາກໜ້າລາຍລະອຽດບິນພາຍຫຼັງ (ນອກຂອບເຂດ 1a).
* **ຕົວເລກໃນຕາຕະລາງປະຫວັດ:** ປະເພດທີ່ກະທົບ `onHand` ສະແດງມີເຄື່ອງໝາຍ (`RECEIVE`, `RETURN`, `TRANSFER_IN` = `+`; `SHIP`, `TRANSFER_OUT` = `−`; `ADJUST` ຄ່າທີ່ເກັບເປັນຄ່າມີເຄື່ອງໝາຍຢູ່ແລ້ວ); `RESERVE`/`RELEASE` ສະແດງຈຳນວນລ້ວນ (ກະທົບ `reserved`).
* **Icon ຂອງ lucide-react v1:** ໃຊ້ `PackagePlus`, `SlidersHorizontal`, `ArrowLeftRight`, `Undo2`, `BellRing`, `Boxes`, `AlertTriangle`; ຖ້າຊື່ໃດ compile ບໍ່ຜ່ານໃຫ້ຊອກຊື່ໃກ້ຄຽງດ້ວຍ `grep -o "export { default as [A-Za-z0-9]*" node_modules/lucide-react/dist/esm/icons/index.js | grep -i <ຄຳ>` ແລ້ວໃຊ້ຊື່ນັ້ນ.
* **ໜ້າ `/stock` ຮັບ `?q=` ແລະ `?tab=movements`** ຜ່ານ `searchParams` ຂອງ server page (ລິ້ງຈາກໜ້າສິນຄ້າໃຊ້ `?q=<SKU>`).

## ໂຄງສ້າງໄຟລ໌

```
apps/admin/src/
  lib/types.ts                     [ແກ້] StockLevelDto, StockMovementDto, Shortage
  lib/errors.ts (+test)            [ແກ້] extractShortages, shortageLines
  lib/queries.ts                   [ແກ້] useStockLevels, useStockMovements, useVariantSearch, useStockOperation, useSetThreshold
  lib/nav.ts (+test)               [ແກ້] /stock
  lib/i18n/dictionary.ts           [ແກ້] stock.*
  components/common/variant-picker.tsx (+test)   [ໃໝ່]
  components/stock/stock-op-dialog.tsx (+test)   [ໃໝ່]
  components/stock/threshold-dialog.tsx (+test)  [ໃໝ່]
  components/stock/stock-levels.tsx (+test)      [ໃໝ່]
  components/stock/stock-movements.tsx (+test)   [ໃໝ່]
  components/stock/stock-page.tsx (+test)        [ໃໝ່] (tabs)
  app/(app)/stock/page.tsx                       [ໃໝ່]
```

---

### Task 1: ປະເພດ, `shortageLines`, hooks, ແລະ dictionary ຂອງສະຕ໋ອກ

**Files:**
- Modify: `apps/admin/src/lib/types.ts`, `apps/admin/src/lib/errors.ts`, `apps/admin/src/lib/errors.test.ts`, `apps/admin/src/lib/queries.ts`, `apps/admin/src/lib/i18n/dictionary.ts`
- Create: `apps/admin/src/lib/queries.stock.test.tsx`

- [ ] **Step 1: dictionary** (ແຊກຕາມ "ຂໍ້ຕົກລົງສຳຄັນ" ຂອງ A4; ໃຊ້ໂດຍ Task 1–7)

`lo`:
```ts
  "stock.title": "ສະຕ໋ອກ",
  "stock.description": "ຍອດສະຕ໋ອກຕາມສາງ ແລະ ປະຫວັດການເຄື່ອນໄຫວ",
  "stock.tab.levels": "ຍອດສະຕ໋ອກ",
  "stock.tab.movements": "ປະຫວັດ",
  "stock.search": "ຄົ້ນຫາ SKU ຫຼື ຊື່ສິນຄ້າ...",
  "stock.filter.warehouse": "ສາງ",
  "stock.filter.allWarehouses": "ທຸກສາງ",
  "stock.filter.lowOnly": "ສະເພາະໃກ້ໝົດ",
  "stock.col.item": "ສິນຄ້າ",
  "stock.col.warehouse": "ສາງ",
  "stock.col.onHand": "ໃນສາງ",
  "stock.col.reserved": "ຈອງ",
  "stock.col.available": "ຂາຍໄດ້",
  "stock.col.threshold": "ເກນໃກ້ໝົດ",
  "stock.low": "ໃກ້ໝົດ",
  "stock.empty.title": "ຍັງບໍ່ມີຍອດສະຕ໋ອກ",
  "stock.empty.hint": "ກົດ \"ຮັບສະຕ໋ອກ\" ເພື່ອນຳສິນຄ້າເຂົ້າສາງຄັ້ງທຳອິດ",
  "stock.empty.noResults": "ບໍ່ພົບຍອດສະຕ໋ອກທີ່ຄົ້ນຫາ",
  "stock.receiveNew": "ຮັບສະຕ໋ອກ",
  "stock.op.receive": "ຮັບເຂົ້າ",
  "stock.op.adjust": "ປັບຍອດ",
  "stock.op.transfer": "ຍ້າຍສາງ",
  "stock.op.return": "ຮັບຄືນ",
  "stock.op.threshold": "ຕັ້ງເກນໃກ້ໝົດ",
  "stock.op.title.receive": "ຮັບສະຕ໋ອກເຂົ້າສາງ",
  "stock.op.title.adjust": "ປັບຍອດສະຕ໋ອກ",
  "stock.op.title.transfer": "ຍ້າຍສະຕ໋ອກລະຫວ່າງສາງ",
  "stock.op.title.return": "ຮັບສິນຄ້າຄືນເຂົ້າສາງ",
  "stock.op.desc.receive": "ເພີ່ມຈຳນວນທີ່ຮັບເຂົ້າ (ໃຊ້ໄດ້ກັບ variant ທີ່ຍັງບໍ່ເຄີຍມີສະຕ໋ອກ)",
  "stock.op.desc.adjust": "ເພີ່ມ ຫຼື ລົດຍອດ ຕ້ອງໃສ່ເຫດຜົນ ແລະ ລົດໃຫ້ຕ່ຳກວ່າຍອດທີ່ຈອງບໍ່ໄດ້",
  "stock.op.desc.transfer": "ຍ້າຍຈາກສາງໜຶ່ງໄປອີກສາງ (ຍ້າຍສະຕ໋ອກທີ່ຈອງແລ້ວບໍ່ໄດ້)",
  "stock.op.desc.return": "ນຳສິນຄ້າທີ່ລູກຄ້າສົ່ງຄືນເຂົ້າສາງ",
  "stock.field.variant": "ສິນຄ້າ (variant)",
  "stock.field.warehouse": "ສາງ",
  "stock.field.fromWarehouse": "ຈາກສາງ",
  "stock.field.toWarehouse": "ໄປສາງ",
  "stock.field.quantity": "ຈຳນວນ",
  "stock.field.delta": "ປ່ຽນແປງ (+/−)",
  "stock.field.note": "ໝາຍເຫດ",
  "stock.field.noteRequired": "ເຫດຜົນ",
  "stock.field.threshold": "ເກນໃກ້ໝົດ",
  "stock.field.thresholdHint": "ເຕືອນເມື່ອຂາຍໄດ້ ≤ ຄ່ານີ້; ເວັ້ນໄວ້ = ບໍ່ເຕືອນ",
  "stock.field.selectWarehouse": "ເລືອກສາງ",
  "stock.picker.placeholder": "ຄົ້ນຫາ SKU, ຊື່ ຫຼື barcode...",
  "stock.picker.none": "ບໍ່ພົບ variant",
  "stock.picker.available": "ຂາຍໄດ້ {count}",
  "stock.picker.change": "ປ່ຽນ",
  "stock.toast.received": "ຮັບສະຕ໋ອກແລ້ວ",
  "stock.toast.adjusted": "ປັບຍອດແລ້ວ",
  "stock.toast.transferred": "ຍ້າຍສະຕ໋ອກແລ້ວ",
  "stock.toast.returned": "ຮັບຄືນແລ້ວ",
  "stock.toast.threshold": "ບັນທຶກເກນໃກ້ໝົດແລ້ວ",
  "stock.shortage": "{sku}: ຕ້ອງການ {requested} ແຕ່ຂາຍໄດ້ {available}",
  "stock.mov.col.time": "ເວລາ",
  "stock.mov.col.type": "ປະເພດ",
  "stock.mov.col.item": "ສິນຄ້າ",
  "stock.mov.col.warehouse": "ສາງ",
  "stock.mov.col.quantity": "ຈຳນວນ",
  "stock.mov.col.order": "ບິນ",
  "stock.mov.col.note": "ໝາຍເຫດ",
  "stock.mov.col.actor": "ຜູ້ເຮັດ",
  "stock.mov.filter.type": "ປະເພດ",
  "stock.mov.filter.allTypes": "ທຸກປະເພດ",
  "stock.mov.filter.from": "ຈາກວັນທີ",
  "stock.mov.filter.to": "ຮອດວັນທີ",
  "stock.mov.filter.variant": "ສິນຄ້າ",
  "stock.mov.filter.clear": "ລ້າງ",
  "stock.mov.empty": "ບໍ່ພົບການເຄື່ອນໄຫວ",
  "stock.mov.system": "ລະບົບ",
  "stock.type.RECEIVE": "ຮັບເຂົ້າ",
  "stock.type.ADJUST": "ປັບຍອດ",
  "stock.type.RESERVE": "ຈອງ",
  "stock.type.RELEASE": "ປ່ອຍຈອງ",
  "stock.type.SHIP": "ຕັດສົ່ງ",
  "stock.type.RETURN": "ຮັບຄືນ",
  "stock.type.TRANSFER_IN": "ຍ້າຍເຂົ້າ",
  "stock.type.TRANSFER_OUT": "ຍ້າຍອອກ",
  "nav.stock": "ສະຕ໋ອກ",
```
`en`:
```ts
  "stock.title": "Stock",
  "stock.description": "Stock levels by warehouse and the movement history",
  "stock.tab.levels": "Levels",
  "stock.tab.movements": "History",
  "stock.search": "Search SKU or product name...",
  "stock.filter.warehouse": "Warehouse",
  "stock.filter.allWarehouses": "All warehouses",
  "stock.filter.lowOnly": "Low stock only",
  "stock.col.item": "Item",
  "stock.col.warehouse": "Warehouse",
  "stock.col.onHand": "On hand",
  "stock.col.reserved": "Reserved",
  "stock.col.available": "Available",
  "stock.col.threshold": "Low-stock level",
  "stock.low": "Low",
  "stock.empty.title": "No stock yet",
  "stock.empty.hint": "Press \"Receive stock\" to bring items into a warehouse for the first time",
  "stock.empty.noResults": "No stock rows match your search",
  "stock.receiveNew": "Receive stock",
  "stock.op.receive": "Receive",
  "stock.op.adjust": "Adjust",
  "stock.op.transfer": "Transfer",
  "stock.op.return": "Return",
  "stock.op.threshold": "Set low-stock level",
  "stock.op.title.receive": "Receive stock into a warehouse",
  "stock.op.title.adjust": "Adjust stock",
  "stock.op.title.transfer": "Transfer stock between warehouses",
  "stock.op.title.return": "Return items to a warehouse",
  "stock.op.desc.receive": "Add the received quantity (works for variants that never had stock)",
  "stock.op.desc.adjust": "Add or remove stock. A reason is required and you cannot go below the reserved quantity",
  "stock.op.desc.transfer": "Move stock from one warehouse to another (reserved stock cannot be moved)",
  "stock.op.desc.return": "Put items returned by a customer back into stock",
  "stock.field.variant": "Item (variant)",
  "stock.field.warehouse": "Warehouse",
  "stock.field.fromWarehouse": "From warehouse",
  "stock.field.toWarehouse": "To warehouse",
  "stock.field.quantity": "Quantity",
  "stock.field.delta": "Change (+/−)",
  "stock.field.note": "Note",
  "stock.field.noteRequired": "Reason",
  "stock.field.threshold": "Low-stock level",
  "stock.field.thresholdHint": "Warn when available ≤ this value; empty = no warning",
  "stock.field.selectWarehouse": "Select warehouse",
  "stock.picker.placeholder": "Search SKU, name or barcode...",
  "stock.picker.none": "No variants found",
  "stock.picker.available": "Available {count}",
  "stock.picker.change": "Change",
  "stock.toast.received": "Stock received",
  "stock.toast.adjusted": "Stock adjusted",
  "stock.toast.transferred": "Stock transferred",
  "stock.toast.returned": "Return recorded",
  "stock.toast.threshold": "Low-stock level saved",
  "stock.shortage": "{sku}: needs {requested} but only {available} available",
  "stock.mov.col.time": "Time",
  "stock.mov.col.type": "Type",
  "stock.mov.col.item": "Item",
  "stock.mov.col.warehouse": "Warehouse",
  "stock.mov.col.quantity": "Quantity",
  "stock.mov.col.order": "Order",
  "stock.mov.col.note": "Note",
  "stock.mov.col.actor": "By",
  "stock.mov.filter.type": "Type",
  "stock.mov.filter.allTypes": "All types",
  "stock.mov.filter.from": "From date",
  "stock.mov.filter.to": "To date",
  "stock.mov.filter.variant": "Item",
  "stock.mov.filter.clear": "Clear",
  "stock.mov.empty": "No movements found",
  "stock.mov.system": "System",
  "stock.type.RECEIVE": "Receive",
  "stock.type.ADJUST": "Adjust",
  "stock.type.RESERVE": "Reserve",
  "stock.type.RELEASE": "Release",
  "stock.type.SHIP": "Ship",
  "stock.type.RETURN": "Return",
  "stock.type.TRANSFER_IN": "Transfer in",
  "stock.type.TRANSFER_OUT": "Transfer out",
  "nav.stock": "Stock",
```

- [ ] **Step 2: ເພີ່ມປະເພດ** ຕໍ່ທ້າຍ `apps/admin/src/lib/types.ts` (ແລະ ເພີ່ມ `StockMovementType` ໃນ import ເທິງສຸດ: `import type { Permission, ProductStatus, StockMovementType } from "@oca/shared";`):

```ts
export interface StockLevelDto {
  id: string;
  variantId: string;
  sku: string;
  variantName: string | null;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number | null;
  isLow: boolean;
}

export interface StockMovementDto {
  id: string;
  type: StockMovementType;
  quantity: number;
  variantId: string;
  sku: string;
  warehouseId: string;
  warehouseCode: string;
  orderId: string | null;
  orderNumber: string | null;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

/** ສ່ວນຂອງ body 409 INSUFFICIENT_STOCK */
export interface Shortage {
  variantId: string;
  warehouseId: string;
  sku: string | null;
  requested: number;
  available: number;
}
```

- [ ] **Step 3: ຂຽນ test ທີ່ຈະລົ້ມ** — ຕໍ່ທ້າຍ `apps/admin/src/lib/errors.test.ts`:

```ts
import { extractShortages, shortageLines } from "./errors";

describe("shortages", () => {
  const shortage = { variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 5, available: 2 };

  it("extractShortages ອ່ານ body.shortages ຂອງ INSUFFICIENT_STOCK; ຢ່າງອື່ນຄືນ []", () => {
    const error = new ApiError(409, "x", [], "INSUFFICIENT_STOCK", { shortages: [shortage] });
    expect(extractShortages(error)).toEqual([shortage]);
    expect(extractShortages(new ApiError(409, "x", [], "CONFLICT"))).toEqual([]);
    expect(extractShortages(new Error("x"))).toEqual([]);
    expect(extractShortages(new ApiError(409, "x", [], "INSUFFICIENT_STOCK", { shortages: "bad" }))).toEqual([]);
  });

  it("shortageLines ແປເປັນຂໍ້ຄວາມ (ໃຊ້ variantId ຖ້າ sku ເປັນ null)", () => {
    const error = new ApiError(409, "x", [], "INSUFFICIENT_STOCK", {
      shortages: [shortage, { ...shortage, sku: null, variantId: "v9" }],
    });
    expect(shortageLines(error, t)).toEqual([
      "TEE-R: needs 5 but only 2 available",
      "v9: needs 5 but only 2 available",
    ]);
  });
});
```

(ໄຟລ໌ມີ `import { describe, expect, it }` ແລະ `t` ປະກາດຢູ່ແລ້ວຈາກ Plan A4 Task 1; ໃຫ້ຍ້າຍ `import { extractShortages, shortageLines } from "./errors";` ໄປລວມກັບ `import { errorMessage } from "./errors";` ເທິງສຸດ.)

- [ ] **Step 4: ຣັນໃຫ້ລົ້ມ** — `pnpm --filter @oca/admin exec vitest run src/lib/errors.test.ts` → FAIL.

- [ ] **Step 5: ຕໍ່ທ້າຍ `apps/admin/src/lib/errors.ts`**

```ts
import type { Shortage } from "./types";

/** ລາຍການທີ່ສະຕ໋ອກບໍ່ພໍ ຈາກ body ຂອງ 409 INSUFFICIENT_STOCK; ຢ່າງອື່ນ = [] */
export function extractShortages(error: unknown): Shortage[] {
  if (!(error instanceof ApiError) || error.code !== "INSUFFICIENT_STOCK") return [];
  const shortages = error.body?.shortages;
  return Array.isArray(shortages) ? (shortages as Shortage[]) : [];
}

export function shortageLines(error: unknown, t: Translate): string[] {
  return extractShortages(error).map((shortage) =>
    t("stock.shortage", {
      sku: shortage.sku ?? shortage.variantId,
      requested: shortage.requested,
      available: shortage.available,
    }),
  );
}
```
(ຍ້າຍ `import type { Shortage } from "./types";` ໄປລວມກັບ import ເທິງສຸດຂອງໄຟລ໌.)

- [ ] **Step 6: ຂຽນ test hooks** `apps/admin/src/lib/queries.stock.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { useSetThreshold, useStockLevels, useStockMovements, useStockOperation, useVariantSearch } from "./queries";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: vi.fn() }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("stock hooks", () => {
  it("useStockLevels / useStockMovements ສົ່ງ query string (ຂ້າມຄ່າຫວ່າງ)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    const { Wrapper } = wrapper();
    renderHook(() => useStockLevels({ q: "tee", warehouseId: "", lowStock: true, page: 1, pageSize: 10 }), { wrapper: Wrapper });
    renderHook(() => useStockMovements({ type: "RECEIVE", from: "2026-10-01", to: "", variantId: "", page: 2, pageSize: 30 }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(apiFetch).mock.calls.map((call) => call[0]);
    expect(calls).toContain("/stock?q=tee&lowStock=true&page=1&pageSize=10");
    expect(calls).toContain("/stock/movements?type=RECEIVE&from=2026-10-01&page=2&pageSize=30");
  });

  it("useVariantSearch ບໍ່ຍິງເມື່ອ q ເປົ່າ; ຍິງ /variants?q=...&includeInactive=true ເມື່ອມີ q", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 8 });
    const { Wrapper } = wrapper();
    renderHook(() => useVariantSearch({ q: "", includeInactive: true }), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
    renderHook(() => useVariantSearch({ q: "tee", includeInactive: true }), { wrapper: Wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/variants?q=tee&includeInactive=true&page=1&pageSize=8"));
  });

  it("useStockOperation POST /stock/:mode ແລ້ວ invalidate stock/products/variants", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useStockOperation(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ mode: "receive", input: { variantId: "v", warehouseId: "w", quantity: 3 } }));
    expect(apiFetch).toHaveBeenCalledWith("/stock/receive", { method: "POST", body: { variantId: "v", warehouseId: "w", quantity: 3 } });
    for (const key of ["stock", "products", "variants"]) expect(spy).toHaveBeenCalledWith({ queryKey: [key] });
  });

  it("useSetThreshold PATCH /stock/:id/threshold", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSetThreshold(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync({ id: "s1", lowStockThreshold: null }));
    expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", { method: "PATCH", body: { lowStockThreshold: null } });
  });
});
```

- [ ] **Step 7: ຣັນໃຫ້ລົ້ມ** — FAIL (hooks ບໍ່ມີ).

- [ ] **Step 8: ແກ້ `apps/admin/src/lib/queries.ts`**

ເພີ່ມ import `ReceiveStockInput, AdjustStockInput, TransferStockInput, ReturnStockInput` ຈາກ `@oca/shared` ແລະ `StockLevelDto, StockMovementDto, VariantSearchItemDto` ຈາກ `./types`. ເພີ່ມໃນ `queryKeys`: `stock: ["stock"] as const, variants: ["variants"] as const,`. ຕໍ່ທ້າຍໄຟລ໌:

```ts
// ---------------------------------------------------------------------------
// ສະຕ໋ອກ
// ---------------------------------------------------------------------------
export interface StockListParams {
  q?: string;
  warehouseId?: string;
  lowStock?: boolean;
  page: number;
  pageSize: number;
}

export function useStockLevels(params: StockListParams) {
  return useQuery({
    queryKey: [...queryKeys.stock, "levels", params],
    queryFn: () => apiFetch<Page<StockLevelDto>>(`/stock${toQueryString({ ...params, lowStock: params.lowStock ? true : undefined })}`),
    placeholderData: keepPreviousData,
  });
}

export interface StockMovementParams {
  type?: string;
  variantId?: string;
  warehouseId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export function useStockMovements(params: StockMovementParams) {
  return useQuery({
    queryKey: [...queryKeys.stock, "movements", params],
    queryFn: () => apiFetch<Page<StockMovementDto>>(`/stock/movements${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

/** ຄົ້ນຫາ variant (autocomplete): ບໍ່ຍິງເມື່ອ q ເປົ່າ */
export function useVariantSearch(params: { q: string; includeInactive?: boolean }) {
  const q = params.q.trim();
  return useQuery({
    queryKey: [...queryKeys.variants, "search", q, params.includeInactive ?? false],
    queryFn: () =>
      apiFetch<Page<VariantSearchItemDto>>(
        `/variants${toQueryString({ q, includeInactive: params.includeInactive ? true : undefined, page: 1, pageSize: 8 })}`,
      ),
    enabled: q !== "",
  });
}

export type StockOpMode = "receive" | "adjust" | "transfer" | "return";
export type StockOpInput = ReceiveStockInput | AdjustStockInput | TransferStockInput | ReturnStockInput;

export function useStockOperation() {
  const invalidate = useInvalidate(queryKeys.stock, queryKeys.products, queryKeys.variants);
  return useMutation({
    mutationFn: ({ mode, input }: { mode: StockOpMode; input: StockOpInput }) =>
      apiFetch<unknown>(`/stock/${mode}`, { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useSetThreshold() {
  const invalidate = useInvalidate(queryKeys.stock);
  return useMutation({
    mutationFn: ({ id, lowStockThreshold }: { id: string; lowStockThreshold: number | null }) =>
      apiFetch<StockLevelDto>(`/stock/${id}/threshold`, { method: "PATCH", body: { lowStockThreshold } }),
    onSuccess: invalidate,
  });
}
```

(`StockOpMode` ຈະຖືກ import ຈາກ `@/lib/queries` ໂດຍ component ຂອງ Task 3.)

- [ ] **Step 9: ຣັນໃຫ້ຜ່ານ + typecheck**

Run: `pnpm --filter @oca/admin exec vitest run src/lib && pnpm --filter @oca/admin typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/admin/src/lib
git commit -m "feat(admin): stock types, hooks, shortage helpers and strings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/lib
```

---

### Task 2: `VariantPicker`

**Files:** Create `apps/admin/src/components/common/variant-picker.tsx`, `variant-picker.test.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { VariantPicker } from "./variant-picker";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const found: VariantSearchItemDto = {
  id: "v1",
  sku: "TEE-R",
  barcode: null,
  name: "Red",
  productId: "p1",
  productName: "Tee",
  productStatus: "ACTIVE",
  imageUrl: null,
  price: "100.00",
  isActive: true,
  availableTotal: 7,
  stock: [],
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ items: [found], total: 1, page: 1, pageSize: 8 });
});

describe("VariantPicker", () => {
  it("ພິມຄົ້ນຫາ (debounce) ແລ້ວສະແດງຜົນ: ຊື່ສິນຄ້າ, variant, SKU, ລາຄາ, ຂາຍໄດ້", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item (variant)" onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item (variant)"), "tee");
    expect(await screen.findByRole("option", { name: /Tee/ })).toBeInTheDocument();
    const option = screen.getByRole("option", { name: /TEE-R/ });
    expect(option).toHaveTextContent("Red");
    expect(option).toHaveTextContent("100.00");
    expect(option).toHaveTextContent("Available 7");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/variants?q=tee&page=1&pageSize=8"));
  });

  it("includeInactive ຖືກສົ່ງຕໍ່ໃຫ້ API", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" includeInactive onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "t");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/variants?q=t&includeInactive=true&page=1&pageSize=8"));
  });

  it("ເລືອກຜົນ: ເອີ້ນ onSelect ແລະ ລ້າງຜົນ", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" onSelect={onSelect} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    await user.click(await screen.findByRole("option", { name: /TEE-R/ }));
    expect(onSelect).toHaveBeenCalledWith(found);
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByLabelText("Item")).toHaveValue("");
  });

  it("ບໍ່ພົບ: ສະແດງ 'ບໍ່ພົບ variant'; excludeIds ຕັດຜົນທີ່ເລືອກແລ້ວ", async () => {
    const { user } = renderWithProviders(<VariantPicker id="vp" label="Item" excludeIds={["v1"]} onSelect={vi.fn()} />);
    await user.type(screen.getByLabelText("Item"), "tee");
    expect(await screen.findByText("No variants found")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `variant-picker.tsx`**

```tsx
"use client";

import { Field, Input } from "@oca/ui";
import { useState } from "react";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useVariantSearch } from "@/lib/queries";
import type { VariantSearchItemDto } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

export interface VariantPickerProps {
  id: string;
  label: string;
  onSelect: (variant: VariantSearchItemDto) => void;
  /** ຮວມ variant ທີ່ປິດ/ສິນຄ້າ DRAFT-ARCHIVED (ໃຊ້ຕອນຮັບສະຕ໋ອກ); ຄ່າເລີ່ມຕົ້ນ = ສະເພາະທີ່ຂາຍໄດ້ (ຟອມບິນ) */
  includeInactive?: boolean;
  /** variant ທີ່ເລືອກແລ້ວ (ບໍ່ສະແດງໃນຜົນ) */
  excludeIds?: string[];
  disabled?: boolean;
}

/** autocomplete variant ຜ່ານ GET /variants (SKU / barcode / ຊື່) ພ້ອມລາຄາ ແລະ ສະຕ໋ອກຂາຍໄດ້ */
export function VariantPicker({ id, label, onSelect, includeInactive, excludeIds = [], disabled }: VariantPickerProps) {
  const { t } = useT();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const search = useVariantSearch({ q, includeInactive });
  const results = (search.data?.items ?? []).filter((item) => !excludeIds.includes(item.id));
  const showList = q !== "" && text.trim() === q && !search.isPending;

  return (
    <div className="relative">
      <Field label={label} htmlFor={id}>
        <Input
          id={id}
          value={text}
          disabled={disabled}
          autoComplete="off"
          placeholder={t("stock.picker.placeholder")}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      {showList ? (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted">{t("stock.picker.none")}</li>
          ) : (
            results.map((item) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-subtle focus:bg-subtle focus:outline-none"
                  onClick={() => {
                    onSelect(item);
                    setText("");
                  }}
                >
                  <span>
                    <span className="font-medium text-ink">{item.productName}</span>
                    {item.name ? <span className="text-ink-secondary"> — {item.name}</span> : null}
                    <span className="block font-mono text-xs text-ink-muted">{item.sku}</span>
                  </span>
                  <span className="text-right text-xs text-ink-secondary">
                    <span className="block tabular-nums">{formatMoney(item.price)}</span>
                    <span className="block">{t("stock.picker.available", { count: formatQuantity(item.availableTotal) })}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
```

ໝາຍເຫດ: ບັນທັດ `showList` ກັນບໍ່ໃຫ້ສະແດງຜົນເກົ່າຂະນະຜູ້ໃຊ້ກຳລັງພິມຕໍ່ (text ຍັງບໍ່ເທົ່າ debounced `q`). ຖ້າ test "ພິມຄົ້ນຫາ" ກຳລັງໃຊ້ເວລານານເກີນ (`findBy` default 1000ms) ຍັງພໍເພາະ debounce 300ms.

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/components/common/variant-picker.test.tsx && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

```bash
git add apps/admin/src/components/common/variant-picker.tsx apps/admin/src/components/common/variant-picker.test.tsx
git commit -m "feat(admin): VariantPicker autocomplete" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/common/variant-picker.tsx apps/admin/src/components/common/variant-picker.test.tsx
```

---

### Task 3: `StockOpDialog` (receive / adjust / transfer / return)

**Files:** Create `apps/admin/src/components/stock/stock-op-dialog.tsx`, `stock-op-dialog.test.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { StockOpDialog } from "./stock-op-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const warehouses = [
  { id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true },
  { id: "w2", code: "B2", name: "Branch 2", address: null, isDefault: false, isActive: true },
  { id: "w3", code: "OLD", name: "Old", address: null, isDefault: false, isActive: false },
];
const target = { variantId: "v1", label: "Tee — Red (TEE-R)", warehouseId: "w1" };

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === "/warehouses") return warehouses;
    return {};
  }) as typeof apiFetch);
});

const posted = () => vi.mocked(apiFetch).mock.calls.find((call) => call[0].startsWith("/stock/"));

describe("StockOpDialog", () => {
  it("receive: ສາງ (ສະເພາະທີ່ເປີດ) + ຈຳນວນ + ໝາຍເຫດ → POST /stock/receive", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={onOpenChange} mode="receive" target={target} />);
    expect(screen.getByText("Tee — Red (TEE-R)")).toBeInTheDocument();
    const select = await screen.findByLabelText("Warehouse");
    await waitFor(() => expect(screen.getByRole("option", { name: "MAIN — Main" })).toBeInTheDocument());
    expect(screen.queryByRole("option", { name: /OLD/ })).toBeNull();
    expect(select).toHaveValue("w1");
    await user.type(screen.getByLabelText("Quantity"), "12");
    await user.type(screen.getByLabelText("Note"), "PO-1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/receive", { method: "POST", body: { variantId: "v1", warehouseId: "w1", quantity: 12, note: "PO-1" } }]),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("adjust: ຕ້ອງມີເຫດຜົນ ແລະ ຄ່າປ່ຽນແປງ ≠ 0; ລົບໄດ້", async () => {
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={vi.fn()} mode="adjust" target={target} />);
    await screen.findByLabelText("Warehouse");
    await user.type(screen.getByLabelText("Change (+/−)"), "-3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument(); // ຂາດເຫດຜົນ
    expect(posted()).toBeUndefined();

    await user.type(screen.getByLabelText("Reason"), "damaged");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/adjust", { method: "POST", body: { variantId: "v1", warehouseId: "w1", delta: -3, note: "damaged" } }]),
    );
  });

  it("transfer: ຈາກ/ໄປ ຕ້ອງຕ່າງກັນ; ສົ່ງ fromWarehouseId/toWarehouseId", async () => {
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={vi.fn()} mode="transfer" target={target} />);
    await screen.findByLabelText("From warehouse");
    await user.type(screen.getByLabelText("Quantity"), "2");
    await user.selectOptions(screen.getByLabelText("To warehouse"), "w1"); // ຊ້ຳກັບຕົ້ນທາງ
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(posted()).toBeUndefined();

    await user.selectOptions(screen.getByLabelText("To warehouse"), "w2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/transfer", { method: "POST", body: { variantId: "v1", fromWarehouseId: "w1", toWarehouseId: "w2", quantity: 2 } }]),
    );
  });

  it("return: POST /stock/return", async () => {
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={vi.fn()} mode="return" target={target} />);
    await screen.findByLabelText("Warehouse");
    await user.type(screen.getByLabelText("Quantity"), "1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/return", { method: "POST", body: { variantId: "v1", warehouseId: "w1", quantity: 1 } }]),
    );
  });

  it("INSUFFICIENT_STOCK: ສະແດງຂໍ້ຄວາມແປ + ລາຍການ shortages ແລະ dialog ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path === "/warehouses") return warehouses;
      throw new ApiError(409, "x", [], "INSUFFICIENT_STOCK", {
        shortages: [{ variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 9, available: 2 }],
      });
    }) as typeof apiFetch);
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={onOpenChange} mode="adjust" target={target} />);
    await screen.findByLabelText("Warehouse");
    await user.type(screen.getByLabelText("Change (+/−)"), "-9");
    await user.type(screen.getByLabelText("Reason"), "x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not enough stock");
    expect(alert).toHaveTextContent("TEE-R: needs 9 but only 2 available");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("receive ໂດຍບໍ່ມີ target: ມີ VariantPicker (includeInactive) ໃຫ້ເລືອກ variant ກ່ອນ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path === "/warehouses") return warehouses;
      if (path.startsWith("/variants")) {
        return { items: [{ id: "v9", sku: "NEW-1", barcode: null, name: null, productId: "p9", productName: "New", productStatus: "DRAFT", imageUrl: null, price: "1.00", isActive: true, availableTotal: 0, stock: [] }], total: 1, page: 1, pageSize: 8 };
      }
      return {};
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<StockOpDialog open onOpenChange={vi.fn()} mode="receive" target={null} />);
    await user.type(screen.getByLabelText("Item (variant)"), "new");
    await user.click(await screen.findByRole("option", { name: /NEW-1/ }));
    expect(screen.getByText(/NEW-1/)).toBeInTheDocument();
    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some((call) => call[0] === "/variants?q=new&includeInactive=true&page=1&pageSize=8")).toBe(true),
    );
    await user.selectOptions(await screen.findByLabelText("Warehouse"), "w1");
    await user.type(screen.getByLabelText("Quantity"), "5");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted()).toEqual(["/stock/receive", { method: "POST", body: { variantId: "v9", warehouseId: "w1", quantity: 5 } }]),
    );
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `stock-op-dialog.tsx`**

```tsx
"use client";

import {
  adjustStockSchema,
  receiveStockSchema,
  returnStockSchema,
  transferStockSchema,
} from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Select, toast } from "@oca/ui";
import { useState } from "react";
import { VariantPicker } from "@/components/common/variant-picker";
import { errorMessage, shortageLines } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { formatIssues } from "@/lib/product-form";
import { type StockOpMode, useStockOperation, useWarehouses } from "@/lib/queries";

/** variant + ສາງ ທີ່ກຳນົດໄວ້ກ່ອນ (ກົດຈາກແຖວຂອງຕາຕະລາງ). null = ໃຫ້ເລືອກ variant ເອງ (ຮັບສະຕ໋ອກຄັ້ງທຳອິດ) */
export interface StockOpTarget {
  variantId: string;
  label: string;
  warehouseId?: string;
}

export interface StockOpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: StockOpMode;
  target: StockOpTarget | null;
}

export function StockOpDialog({ open, onOpenChange, mode, target }: StockOpDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        <StockOpForm
          key={`${mode}:${target?.variantId ?? "none"}:${target?.warehouseId ?? ""}`}
          mode={mode}
          target={target}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const SCHEMAS = {
  receive: receiveStockSchema,
  adjust: adjustStockSchema,
  transfer: transferStockSchema,
  return: returnStockSchema,
} as const;

const SUCCESS_KEYS = {
  receive: "stock.toast.received",
  adjust: "stock.toast.adjusted",
  transfer: "stock.toast.transferred",
  return: "stock.toast.returned",
} as const;

function StockOpForm({ mode, target, onDone }: { mode: StockOpMode; target: StockOpTarget | null; onDone: () => void }) {
  const { t } = useT();
  const warehouses = useWarehouses();
  const operate = useStockOperation();
  const active = (warehouses.data ?? []).filter((warehouse) => warehouse.isActive);

  const [picked, setPicked] = useState<{ variantId: string; label: string } | null>(target);
  const [warehouseId, setWarehouseId] = useState(target?.warehouseId ?? "");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ສາງເລີ່ມຕົ້ນ = ສາງຫຼັກ ເມື່ອບໍ່ໄດ້ກຳນົດມາ
  const defaultWarehouse = active.find((warehouse) => warehouse.isDefault)?.id ?? "";
  const effectiveWarehouse = warehouseId || defaultWarehouse;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const variantId = picked?.variantId ?? "";
    const number = amount.trim() === "" ? Number.NaN : Number(amount);
    const trimmedNote = note.trim();
    const raw =
      mode === "adjust"
        ? { variantId, warehouseId: effectiveWarehouse, delta: number, note: trimmedNote }
        : mode === "transfer"
          ? {
              variantId,
              fromWarehouseId: effectiveWarehouse,
              toWarehouseId,
              quantity: number,
              ...(trimmedNote ? { note: trimmedNote } : {}),
            }
          : { variantId, warehouseId: effectiveWarehouse, quantity: number, ...(trimmedNote ? { note: trimmedNote } : {}) };
    const parsed = SCHEMAS[mode].safeParse(raw);
    if (!parsed.success) {
      setIssues(formatIssues(parsed.error.issues));
      return;
    }
    setIssues([]);
    setSaving(true);
    try {
      await operate.mutateAsync({ mode, input: parsed.data });
      toast.success(t(SUCCESS_KEYS[mode]));
      onDone();
    } catch (error) {
      setIssues([errorMessage(error, t), ...shortageLines(error, t)]);
    } finally {
      setSaving(false);
    }
  }

  const warehouseOptions = (
    <>
      <option value="">{t("stock.field.selectWarehouse")}</option>
      {active.map((warehouse) => (
        <option key={warehouse.id} value={warehouse.id}>
          {`${warehouse.code} — ${warehouse.name}`}
        </option>
      ))}
    </>
  );

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t(`stock.op.title.${mode}`)} description={t(`stock.op.desc.${mode}`)} />
      <DialogBody>
        {issues.length > 0 ? (
          <ul role="alert" className="list-inside list-disc rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {issues.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}

        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-ink-secondary">{t("stock.field.variant")}</p>
              <p className="text-sm font-medium text-ink">{picked.label}</p>
            </div>
            {target === null ? (
              <Button type="button" variant="ghost" className="rounded-lg" onClick={() => setPicked(null)}>
                {t("stock.picker.change")}
              </Button>
            ) : null}
          </div>
        ) : (
          <VariantPicker
            id="stock-op-variant"
            label={t("stock.field.variant")}
            includeInactive
            onSelect={(variant) =>
              setPicked({
                variantId: variant.id,
                label: `${variant.productName}${variant.name ? ` — ${variant.name}` : ""} (${variant.sku})`,
              })
            }
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t(mode === "transfer" ? "stock.field.fromWarehouse" : "stock.field.warehouse")} htmlFor="stock-op-warehouse">
            <Select id="stock-op-warehouse" value={effectiveWarehouse} onChange={(event) => setWarehouseId(event.target.value)}>
              {warehouseOptions}
            </Select>
          </Field>
          {mode === "transfer" ? (
            <Field label={t("stock.field.toWarehouse")} htmlFor="stock-op-to">
              <Select id="stock-op-to" value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)}>
                {warehouseOptions}
              </Select>
            </Field>
          ) : null}
          <Field label={t(mode === "adjust" ? "stock.field.delta" : "stock.field.quantity")} htmlFor="stock-op-amount" required>
            <Input
              id="stock-op-amount"
              type="number"
              inputMode="numeric"
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field
            label={t(mode === "adjust" ? "stock.field.noteRequired" : "stock.field.note")}
            htmlFor="stock-op-note"
            required={mode === "adjust"}
            className={mode === "transfer" ? "sm:col-span-2" : undefined}
          >
            <Input id="stock-op-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

ຂໍ້ສັງເກດ: ສຳລັບ `receive`/`return` ທີ່ບໍ່ມີ `note` schema ຮັບ `note` optional ຈຶ່ງບໍ່ສົ່ງເມື່ອເປົ່າ. test "receive ໂດຍບໍ່ມີ target" ຄາດ body ບໍ່ມີ `note`. ເລກທີ່ເປັນ `NaN` ຈະຖືກ schema ປະຕິເສດ (`z.number()`), ສະແດງ issue.

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ + typecheck + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/stock/stock-op-dialog.test.tsx && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS. ຖ້າ test ໃດລົ້ມເພາະຂໍ້ຄວາມ `en` ຕ່າງ ("Change (+/−)" ໃຊ້ອັກຂະ U+2212) ໃຫ້ copy ຈາກ dictionary.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/stock/stock-op-dialog.tsx apps/admin/src/components/stock/stock-op-dialog.test.tsx
git commit -m "feat(admin): stock operation dialog (receive/adjust/transfer/return)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/stock/stock-op-dialog.tsx apps/admin/src/components/stock/stock-op-dialog.test.tsx
```

---

### Task 4: `ThresholdDialog`

**Files:** Create `apps/admin/src/components/stock/threshold-dialog.tsx`, `threshold-dialog.test.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { StockLevelDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ThresholdDialog } from "./threshold-dialog";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const level: StockLevelDto = {
  id: "s1", variantId: "v1", sku: "TEE-R", variantName: "Red", productName: "Tee", warehouseId: "w1", warehouseCode: "MAIN",
  onHand: 5, reserved: 0, available: 5, lowStockThreshold: 3, isLow: false,
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(level);
});

describe("ThresholdDialog", () => {
  it("ໂຫຼດຄ່າເກົ່າ ແລະ ບັນທຶກຄ່າໃໝ່ເປັນຕົວເລກ", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={onOpenChange} />);
    const input = screen.getByLabelText("Low-stock level");
    expect(input).toHaveValue(3);
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", { method: "PATCH", body: { lowStockThreshold: 10 } }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ເວັ້ນວ່າງ = null (ບໍ່ເຕືອນ)", async () => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    await user.clear(screen.getByLabelText("Low-stock level"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/stock/s1/threshold", { method: "PATCH", body: { lowStockThreshold: null } }),
    );
  });

  it("ຄ່າລົບ/ທົດສະນິຍົມ: ບໍ່ສົ່ງ; level = null: ບໍ່ render", async () => {
    const { user } = renderWithProviders(<ThresholdDialog level={level} onOpenChange={vi.fn()} />);
    await user.clear(screen.getByLabelText("Low-stock level"));
    await user.type(screen.getByLabelText("Low-stock level"), "-2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `threshold-dialog.tsx`**

```tsx
"use client";

import { stockThresholdSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { formatIssues } from "@/lib/product-form";
import { useSetThreshold } from "@/lib/queries";
import type { StockLevelDto } from "@/lib/types";

export interface ThresholdDialogProps {
  /** null = ປິດ dialog */
  level: StockLevelDto | null;
  onOpenChange: (open: boolean) => void;
}

export function ThresholdDialog({ level, onOpenChange }: ThresholdDialogProps) {
  const { t } = useT();
  return (
    <Dialog open={level !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t("common.close")}>
        {level ? <ThresholdForm key={level.id} level={level} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ThresholdForm({ level, onDone }: { level: StockLevelDto; onDone: () => void }) {
  const { t } = useT();
  const save = useSetThreshold();
  const [value, setValue] = useState(level.lowStockThreshold === null ? "" : String(level.lowStockThreshold));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const raw = { lowStockThreshold: value.trim() === "" ? null : Number(value) };
    const parsed = stockThresholdSchema.safeParse(raw);
    if (!parsed.success) {
      setMessage(formatIssues(parsed.error.issues).join("; "));
      return;
    }
    setMessage(null);
    setSaving(true);
    try {
      await save.mutateAsync({ id: level.id, lowStockThreshold: parsed.data.lowStockThreshold });
      toast.success(t("stock.toast.threshold"));
      onDone();
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("stock.op.threshold")} description={`${level.productName}${level.variantName ? ` — ${level.variantName}` : ""} (${level.sku}) · ${level.warehouseCode}`} />
      <DialogBody>
        {message ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {message}
          </p>
        ) : null}
        <Field label={t("stock.field.threshold")} htmlFor="threshold-value">
          <Input id="threshold-value" type="number" min={0} step={1} value={value} onChange={(event) => setValue(event.target.value)} />
          <p className="mt-1 text-xs text-ink-muted">{t("stock.field.thresholdHint")}</p>
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ + Commit**

Run: `pnpm --filter @oca/admin exec vitest run src/components/stock/threshold-dialog.test.tsx && pnpm --filter @oca/admin typecheck` → PASS.

```bash
git add apps/admin/src/components/stock/threshold-dialog.tsx apps/admin/src/components/stock/threshold-dialog.test.tsx
git commit -m "feat(admin): low-stock threshold dialog" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/stock/threshold-dialog.tsx apps/admin/src/components/stock/threshold-dialog.test.tsx
```

---

### Task 5: ແຖບ "ຍອດສະຕ໋ອກ" (`StockLevels`)

**Files:** Create `apps/admin/src/components/stock/stock-levels.tsx`, `stock-levels.test.tsx`

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { Page, StockLevelDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StockLevels } from "./stock-levels";

const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => auth.canWrite }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const level = (patch: Partial<StockLevelDto> = {}): StockLevelDto => ({
  id: "s1", variantId: "v1", sku: "TEE-R", variantName: "Red", productName: "Tee", warehouseId: "w1", warehouseCode: "MAIN",
  onHand: 10, reserved: 3, available: 7, lowStockThreshold: null, isLow: false, ...patch,
});
const rows = [level(), level({ id: "s2", variantId: "v2", sku: "TEE-B", variantName: "Blue", onHand: 2, reserved: 0, available: 2, lowStockThreshold: 5, isLow: true })];

function mockApi(page: Page<StockLevelDto> = { items: rows, total: 2, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.startsWith("/stock")) return page;
    if (path === "/warehouses") return [{ id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true }];
    return {};
  }) as typeof apiFetch);
}
const lastStockUrl = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]).filter((path) => path.startsWith("/stock")).at(-1);

beforeEach(() => {
  auth.canWrite = true;
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("StockLevels", () => {
  it("ສະແດງ ສິນຄ້າ/SKU, ສາງ, ໃນສາງ, ຈອງ, ຂາຍໄດ້ ແລະ ປ້າຍ 'ໃກ້ໝົດ' ສະເພາະແຖວທີ່ isLow", async () => {
    renderWithProviders(<StockLevels initialQuery="" />);
    const first = await screen.findByTestId("row-stock-s1");
    expect(within(first).getByText("Tee — Red")).toBeInTheDocument();
    expect(within(first).getByText("TEE-R")).toBeInTheDocument();
    expect(within(first).getByText("MAIN")).toBeInTheDocument();
    expect(within(first).getByText("10")).toBeInTheDocument();
    expect(within(first).getByText("7")).toBeInTheDocument();
    expect(within(first).queryByText("Low")).toBeNull();
    expect(within(screen.getByTestId("row-stock-s2")).getByText("Low")).toBeInTheDocument();
  });

  it("initialQuery ຖືກໃຊ້ເປັນຄ່າຄົ້ນຫາເລີ່ມຕົ້ນ ແລະ ສົ່ງ q ໄປ API", async () => {
    renderWithProviders(<StockLevels initialQuery="TEE-R" />);
    await screen.findByTestId("row-stock-s1");
    expect(screen.getByPlaceholderText("Search SKU or product name...")).toHaveValue("TEE-R");
    expect(lastStockUrl()).toContain("q=TEE-R");
  });

  it("filter ສາງ ແລະ 'ສະເພາະໃກ້ໝົດ' ຖືກສົ່ງເປັນ query", async () => {
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByTestId("row-stock-s1");
    await user.selectOptions(await screen.findByLabelText("Warehouse"), "w1");
    await waitFor(() => expect(lastStockUrl()).toContain("warehouseId=w1"));
    await user.click(screen.getByRole("checkbox", { name: "Low stock only" }));
    await waitFor(() => expect(lastStockUrl()).toContain("lowStock=true"));
  });

  it("ປຸ່ມຕໍ່ແຖວ ເປີດ dialog ຕາມປະເພດ (receive/adjust/transfer/return) ແລະ ຕັ້ງເກນ", async () => {
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    const row = await screen.findByTestId("row-stock-s1");
    await user.click(within(row).getByRole("button", { name: "Adjust TEE-R" }));
    expect(await screen.findByText("Adjust stock")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(within(row).getByRole("button", { name: "Set low-stock level TEE-R" }));
    expect(await screen.findByLabelText("Low-stock level")).toBeInTheDocument();
  });

  it("ປຸ່ມ 'ຮັບສະຕ໋ອກ' ດ້ານເທິງ ເປີດ dialog ທີ່ມີ variant picker", async () => {
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByTestId("row-stock-s1");
    await user.click(screen.getByRole("button", { name: "Receive stock" }));
    expect(await screen.findByText("Receive stock into a warehouse")).toBeInTheDocument();
    expect(screen.getByLabelText("Item (variant)")).toBeInTheDocument();
  });

  it("ບໍ່ມີ inventory:write: ບໍ່ມີປຸ່ມຮັບສະຕ໋ອກ/ຕໍ່ແຖວ", async () => {
    auth.canWrite = false;
    renderWithProviders(<StockLevels initialQuery="" />);
    await screen.findByTestId("row-stock-s1");
    expect(screen.queryByRole("button", { name: "Receive stock" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Adjust/ })).toBeNull();
  });

  it("ວ່າງ: empty state ພ້ອມຄຳແນະນຳ; ມີ filter: ບໍ່ພົບ", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<StockLevels initialQuery="" />);
    expect(await screen.findByText("No stock yet")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search SKU or product name..."), "zzz");
    expect(await screen.findByText("No stock rows match your search")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `stock-levels.tsx`**

```tsx
"use client";

import {
  Button,
  Card,
  EmptyState,
  Select,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from "@oca/ui";
import { AlertCircle, AlertTriangle, ArrowLeftRight, BellRing, Boxes, PackagePlus, Search, SlidersHorizontal, Undo2 } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { formatQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { type StockOpMode, useStockLevels, useWarehouses } from "@/lib/queries";
import type { StockLevelDto } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { StockOpDialog, type StockOpTarget } from "./stock-op-dialog";
import { ThresholdDialog } from "./threshold-dialog";

const COLUMNS = 7;

interface OpState {
  mode: StockOpMode;
  target: StockOpTarget | null;
}

export function StockLevels({ initialQuery }: { initialQuery: string }) {
  const { t } = useT();
  const canWrite = useCan("inventory:write");
  const [search, setSearch] = useState(initialQuery);
  const [warehouseId, setWarehouseId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [op, setOp] = useState<OpState | null>(null);
  const [thresholdLevel, setThresholdLevel] = useState<StockLevelDto | null>(null);
  const q = useDebounced(search.trim(), 300);

  const query = useStockLevels({ q, warehouseId, lowStock: lowOnly, page, pageSize });
  const warehouses = useWarehouses();
  const rows = query.data?.items ?? [];
  const filtered = q !== "" || warehouseId !== "" || lowOnly;

  const reset = () => setPage(1);
  const targetOf = (level: StockLevelDto): StockOpTarget => ({
    variantId: level.variantId,
    warehouseId: level.warehouseId,
    label: `${level.productName}${level.variantName ? ` — ${level.variantName}` : ""} (${level.sku})`,
  });

  const receiveButton = canWrite ? (
    <Button className="rounded-xl" onClick={() => setOp({ mode: "receive", target: null })}>
      <PackagePlus aria-hidden="true" />
      {t("stock.receiveNew")}
    </Button>
  ) : null;

  const actions: { mode: StockOpMode; icon: typeof PackagePlus }[] = [
    { mode: "receive", icon: PackagePlus },
    { mode: "adjust", icon: SlidersHorizontal },
    { mode: "transfer", icon: ArrowLeftRight },
    { mode: "return", icon: Undo2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{receiveButton}</div>
      <Card className="overflow-hidden rounded-[20px]">
        <div className="flex flex-wrap items-center gap-3 px-3 py-4 sm:px-6">
          <div className="relative min-w-[240px] max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                reset();
              }}
              placeholder={t("stock.search")}
              aria-label={t("stock.search")}
              className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Select
            aria-label={t("stock.filter.warehouse")}
            className="w-48"
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
              reset();
            }}
          >
            <option value="">{t("stock.filter.allWarehouses")}</option>
            {(warehouses.data ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {`${warehouse.code} — ${warehouse.name}`}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 rounded border-line accent-[var(--color-brand)]"
              checked={lowOnly}
              onChange={(event) => {
                setLowOnly(event.target.checked);
                reset();
              }}
            />
            {t("stock.filter.lowOnly")}
          </label>
        </div>

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
                  <TableHead>{t("stock.col.item")}</TableHead>
                  <TableHead>{t("stock.col.warehouse")}</TableHead>
                  <TableHead className="text-right">{t("stock.col.onHand")}</TableHead>
                  <TableHead className="text-right">{t("stock.col.reserved")}</TableHead>
                  <TableHead className="text-right">{t("stock.col.available")}</TableHead>
                  <TableHead className="text-right">{t("stock.col.threshold")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                {rows.map((level) => (
                  <TableRow key={level.id} data-testid={`row-stock-${level.id}`}>
                    <TableCell>
                      <p className="font-medium text-ink">
                        {level.productName}
                        {level.variantName ? ` — ${level.variantName}` : ""}
                      </p>
                      <p className="font-mono text-xs text-ink-muted">{level.sku}</p>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{level.warehouseCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQuantity(level.onHand)}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-secondary">{formatQuantity(level.reserved)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-2">
                        {level.isLow ? (
                          <StatusPill tone="warning" icon={AlertTriangle}>
                            {t("stock.low")}
                          </StatusPill>
                        ) : null}
                        <span className="font-semibold text-ink">{formatQuantity(level.available)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ink-secondary">
                      {level.lowStockThreshold === null ? "—" : formatQuantity(level.lowStockThreshold)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canWrite ? (
                          <>
                            {actions.map(({ mode, icon: Icon }) => (
                              <Button
                                key={mode}
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={`${t(`stock.op.${mode}`)} ${level.sku}`}
                                title={t(`stock.op.${mode}`)}
                                onClick={() => setOp({ mode, target: targetOf(level) })}
                              >
                                <Icon aria-hidden="true" />
                              </Button>
                            ))}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-lg"
                              aria-label={`${t("stock.op.threshold")} ${level.sku}`}
                              title={t("stock.op.threshold")}
                              onClick={() => setThresholdLevel(level)}
                            >
                              <BellRing aria-hidden="true" />
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
              <EmptyState
                icon={Boxes}
                title={filtered ? t("stock.empty.noResults") : t("stock.empty.title")}
                description={filtered ? undefined : t("stock.empty.hint")}
                action={filtered ? undefined : receiveButton}
              />
            ) : null}
            <ServerPager
              page={page}
              pageSize={pageSize}
              total={query.data?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </Card>

      {op ? (
        <StockOpDialog
          open
          onOpenChange={(open) => {
            if (!open) setOp(null);
          }}
          mode={op.mode}
          target={op.target}
        />
      ) : null}
      <ThresholdDialog level={thresholdLevel} onOpenChange={(open) => (open ? undefined : setThresholdLevel(null))} />
    </div>
  );
}
```

- [ ] **Step 4: ຣັນໃຫ້ຜ່ານ + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/stock/stock-levels.test.tsx && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS. ໝາຍເຫດ: test "ປຸ່ມຕໍ່ແຖວ" ກົດ "Cancel" ໃນ dialog ປິດ; ຫຼັງຈາກ `setOp(null)` dialog ຖືກ unmount.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/stock/stock-levels.tsx apps/admin/src/components/stock/stock-levels.test.tsx
git commit -m "feat(admin): stock levels tab" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/stock/stock-levels.tsx apps/admin/src/components/stock/stock-levels.test.tsx
```

---

### Task 6: ແຖບ "ປະຫວັດ" (`StockMovements`)

**Files:** Create `apps/admin/src/components/stock/stock-movements.tsx`, `stock-movements.test.tsx`; ບວກຟັງຊັນ `formatMovementQuantity` ໃນ `apps/admin/src/lib/format.ts` (+ test ໃນ `format.test.ts`).

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ**

ຕໍ່ທ້າຍ `apps/admin/src/lib/format.test.ts`:

```ts
import { formatMovementQuantity } from "./format";

describe("formatMovementQuantity", () => {
  it("ປະເພດທີ່ເພີ່ມ onHand ມີ +; ທີ່ລົດ onHand ມີ −; ADJUST ໃຊ້ເຄື່ອງໝາຍຂອງຄ່າ; RESERVE/RELEASE ເປັນຈຳນວນລ້ວນ", () => {
    expect(formatMovementQuantity("RECEIVE", 5)).toBe("+5");
    expect(formatMovementQuantity("RETURN", 1)).toBe("+1");
    expect(formatMovementQuantity("TRANSFER_IN", 2)).toBe("+2");
    expect(formatMovementQuantity("SHIP", 3)).toBe("−3");
    expect(formatMovementQuantity("TRANSFER_OUT", 4)).toBe("−4");
    expect(formatMovementQuantity("ADJUST", -7)).toBe("−7");
    expect(formatMovementQuantity("ADJUST", 7)).toBe("+7");
    expect(formatMovementQuantity("RESERVE", 2)).toBe("2");
    expect(formatMovementQuantity("RELEASE", 2)).toBe("2");
    expect(formatMovementQuantity("RECEIVE", 1200)).toBe("+1,200");
  });
});
```
(ຍ້າຍ `import` ໄປລວມກັບ import ເທິງສຸດ ແລະ ໃຊ້ `describe` ທີ່ມີຢູ່ແລ້ວ.)

`apps/admin/src/components/stock/stock-movements.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { Page, StockMovementDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { StockMovements } from "./stock-movements";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const mv = (patch: Partial<StockMovementDto> = {}): StockMovementDto => ({
  id: "m1", type: "RECEIVE", quantity: 5, variantId: "v1", sku: "TEE-R", warehouseId: "w1", warehouseCode: "MAIN",
  orderId: null, orderNumber: null, note: "PO-1", actorId: "u1", actorName: "Owner", createdAt: "2026-10-05T05:30:00.000Z", ...patch,
});
const rows = [
  mv(),
  mv({ id: "m2", type: "SHIP", quantity: 3, orderId: "o1", orderNumber: "SO-000001", note: null }),
  mv({ id: "m3", type: "RELEASE", quantity: 2, actorId: null, actorName: null, note: null }),
];

function mockApi(page: Page<StockMovementDto> = { items: rows, total: 3, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path.startsWith("/stock/movements")) return page;
    if (path.startsWith("/variants")) return { items: [], total: 0, page: 1, pageSize: 8 };
    return {};
  }) as typeof apiFetch);
}
const lastUrl = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]).filter((path) => path.startsWith("/stock/movements")).at(-1);

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("StockMovements", () => {
  it("ສະແດງເວລາລາວ, ປະເພດ, SKU, ສາງ, ຈຳນວນມີເຄື່ອງໝາຍ, ລິ້ງບິນ, ໝາຍເຫດ ແລະ ຜູ້ເຮັດ (ລະບົບເມື່ອບໍ່ມີ)", async () => {
    renderWithProviders(<StockMovements />);
    const first = await screen.findByTestId("row-movement-m1");
    expect(within(first).getByText("05/10/2026 12:30")).toBeInTheDocument();
    expect(within(first).getByText("Receive")).toBeInTheDocument();
    expect(within(first).getByText("+5")).toBeInTheDocument();
    expect(within(first).getByText("PO-1")).toBeInTheDocument();
    expect(within(first).getByText("Owner")).toBeInTheDocument();
    const ship = screen.getByTestId("row-movement-m2");
    expect(within(ship).getByText("−3")).toBeInTheDocument();
    expect(within(ship).getByRole("link", { name: "SO-000001" })).toHaveAttribute("href", "/orders/o1");
    const release = screen.getByTestId("row-movement-m3");
    expect(within(release).getByText("System")).toBeInTheDocument();
    expect(within(release).getByText("2")).toBeInTheDocument();
  });

  it("filter ປະເພດ ແລະ ວັນທີ ຖືກສົ່ງຕາມຄ່າ date-only (ບໍ່ແປງເປັນ ISO)", async () => {
    const { user } = renderWithProviders(<StockMovements />);
    await screen.findByTestId("row-movement-m1");
    await user.selectOptions(screen.getByLabelText("Type"), "SHIP");
    await waitFor(() => expect(lastUrl()).toContain("type=SHIP"));
    await user.type(screen.getByLabelText("From date"), "2026-10-01");
    await user.type(screen.getByLabelText("To date"), "2026-10-05");
    await waitFor(() => expect(lastUrl()).toContain("from=2026-10-01"));
    expect(lastUrl()).toContain("to=2026-10-05");
    expect(lastUrl()).not.toContain("T");
  });

  it("ວ່າງ: ສະແດງ 'ບໍ່ພົບການເຄື່ອນໄຫວ'", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    renderWithProviders(<StockMovements />);
    expect(await screen.findByText("No movements found")).toBeInTheDocument();
  });

  it("load ລົ້ມ: ມີປຸ່ມລອງໃໝ່", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    renderWithProviders(<StockMovements />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ເພີ່ມ `formatMovementQuantity` ໃນ `apps/admin/src/lib/format.ts`**

```ts
import type { StockMovementType } from "@oca/shared";

const MINUS = "−";

/** ຈຳນວນຂອງ movement ພ້ອມເຄື່ອງໝາຍຕາມຜົນຕໍ່ `onHand`; RESERVE/RELEASE (ກະທົບ reserved) ເປັນຈຳນວນລ້ວນ */
export function formatMovementQuantity(type: StockMovementType, quantity: number): string {
  const abs = formatQuantity(Math.abs(quantity));
  if (type === "RECEIVE" || type === "RETURN" || type === "TRANSFER_IN") return `+${abs}`;
  if (type === "SHIP" || type === "TRANSFER_OUT") return `${MINUS}${abs}`;
  if (type === "ADJUST") return quantity < 0 ? `${MINUS}${abs}` : `+${abs}`;
  return abs;
}
```
(ຍ້າຍ import ໄປເທິງສຸດຂອງໄຟລ໌.)

- [ ] **Step 4: ຂຽນ `stock-movements.tsx`**

```tsx
"use client";

import { STOCK_MOVEMENT_TYPES, type StockMovementType } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  Select,
  StatusPill,
  type StatusTone,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from "@oca/ui";
import { AlertCircle, History, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ServerPager } from "@/components/common/server-pager";
import { VariantPicker } from "@/components/common/variant-picker";
import { formatDateTime, formatMovementQuantity } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useStockMovements, useWarehouses } from "@/lib/queries";

const COLUMNS = 8;

const TONES: Record<StockMovementType, StatusTone> = {
  RECEIVE: "success",
  RETURN: "success",
  TRANSFER_IN: "info",
  TRANSFER_OUT: "info",
  ADJUST: "warning",
  RESERVE: "brand",
  RELEASE: "neutral",
  SHIP: "neutral",
};

export function StockMovements() {
  const { t } = useT();
  const [type, setType] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [variant, setVariant] = useState<{ id: string; label: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useStockMovements({ type, warehouseId, variantId: variant?.id ?? "", from, to, page, pageSize });
  const warehouses = useWarehouses();
  const rows = query.data?.items ?? [];

  const reset = () => setPage(1);

  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
        <Select
          aria-label={t("stock.mov.filter.type")}
          className="w-44"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            reset();
          }}
        >
          <option value="">{t("stock.mov.filter.allTypes")}</option>
          {STOCK_MOVEMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`stock.type.${value}`)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t("stock.filter.warehouse")}
          className="w-48"
          value={warehouseId}
          onChange={(event) => {
            setWarehouseId(event.target.value);
            reset();
          }}
        >
          <option value="">{t("stock.filter.allWarehouses")}</option>
          {(warehouses.data ?? []).map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {`${warehouse.code} — ${warehouse.name}`}
            </option>
          ))}
        </Select>
        <label className="text-xs font-semibold text-ink-secondary">
          {t("stock.mov.filter.from")}
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              reset();
            }}
            className="mt-1 block h-9 rounded-xl border border-input bg-background px-3 text-sm text-ink"
          />
        </label>
        <label className="text-xs font-semibold text-ink-secondary">
          {t("stock.mov.filter.to")}
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => {
              setTo(event.target.value);
              reset();
            }}
            className="mt-1 block h-9 rounded-xl border border-input bg-background px-3 text-sm text-ink"
          />
        </label>
        <div className="min-w-[260px] flex-1">
          {variant ? (
            <div className="flex h-9 items-center justify-between gap-2 rounded-xl border border-line bg-subtle px-3 text-sm">
              <span className="truncate">
                <span className="text-xs font-semibold text-ink-secondary">{t("stock.mov.filter.variant")}: </span>
                {variant.label}
              </span>
              <button
                type="button"
                aria-label={t("stock.mov.filter.clear")}
                className="rounded p-0.5 hover:bg-hover"
                onClick={() => {
                  setVariant(null);
                  reset();
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <VariantPicker
              id="movement-variant"
              label={t("stock.mov.filter.variant")}
              includeInactive
              onSelect={(item) => {
                setVariant({ id: item.id, label: `${item.sku}${item.name ? ` — ${item.name}` : ""}` });
                reset();
              }}
            />
          )}
        </div>
      </div>

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
                <TableHead>{t("stock.mov.col.time")}</TableHead>
                <TableHead>{t("stock.mov.col.type")}</TableHead>
                <TableHead>{t("stock.mov.col.item")}</TableHead>
                <TableHead>{t("stock.mov.col.warehouse")}</TableHead>
                <TableHead className="text-right">{t("stock.mov.col.quantity")}</TableHead>
                <TableHead>{t("stock.mov.col.order")}</TableHead>
                <TableHead>{t("stock.mov.col.note")}</TableHead>
                <TableHead>{t("stock.mov.col.actor")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
              {rows.map((movement) => (
                <TableRow key={movement.id} data-testid={`row-movement-${movement.id}`}>
                  <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(movement.createdAt)}</TableCell>
                  <TableCell>
                    <StatusPill tone={TONES[movement.type]}>{t(`stock.type.${movement.type}`)}</StatusPill>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{movement.sku}</TableCell>
                  <TableCell className="font-mono text-sm">{movement.warehouseCode}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMovementQuantity(movement.type, movement.quantity)}
                  </TableCell>
                  <TableCell>
                    {movement.orderId && movement.orderNumber ? (
                      <Link href={`/orders/${movement.orderId}`} className="font-medium text-brand-ink hover:underline">
                        {movement.orderNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-ink-secondary">{movement.note ?? "—"}</TableCell>
                  <TableCell className="text-ink-secondary">{movement.actorName ?? t("stock.mov.system")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!query.isPending && rows.length === 0 ? <EmptyState icon={History} title={t("stock.mov.empty")} /> : null}
          <ServerPager
            page={page}
            pageSize={pageSize}
            total={query.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </Card>
  );
}
```

ໝາຍເຫດ: `useStockMovements` ສົ່ງ `type/warehouseId/variantId/from/to` ເປັນ string ເປົ່າໄດ້ (`toQueryString` ຂ້າມ). test "to ... not.toContain('T')" ກວດບໍ່ມີ `T` ໃນ URL ເຊິ່ງໃນ path `/stock/movements?...` ບໍ່ມີຕົວ `T` ໃຫຍ່ ຖ້າ `type=SHIP` ບໍ່ຢູ່ (ມີ `SHIP` ບໍ່ມີ T... "SHIP" ບໍ່ມີ T; ແຕ່ `type=SHIP` ມີ "type" ຕົວນ້ອຍ ຈຶ່ງບໍ່ກະທົບ). ຖ້າຍັງສົງໄສ ໃຫ້ປ່ຽນ assert ເປັນ `expect(lastUrl()).not.toMatch(/\d{4}-\d{2}-\d{2}T/)`.

- [ ] **Step 5: ຣັນໃຫ້ຜ່ານ + lint**

Run: `pnpm --filter @oca/admin exec vitest run src/components/stock/stock-movements.test.tsx src/lib/format.test.ts && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/stock/stock-movements.tsx apps/admin/src/components/stock/stock-movements.test.tsx apps/admin/src/lib/format.ts apps/admin/src/lib/format.test.ts
git commit -m "feat(admin): stock movements history tab" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/stock/stock-movements.tsx apps/admin/src/components/stock/stock-movements.test.tsx apps/admin/src/lib/format.ts apps/admin/src/lib/format.test.ts
```

---

### Task 7: ໜ້າ `/stock` (tabs) + route + nav

**Files:** Create `apps/admin/src/components/stock/stock-page.tsx`, `stock-page.test.tsx`, `apps/admin/src/app/(app)/stock/page.tsx`; Modify `apps/admin/src/lib/nav.ts`, `nav.test.ts`.

- [ ] **Step 1: ຂຽນ test ທີ່ຈະລົ້ມ** `stock-page.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { StockPage } from "./stock-page";

vi.mock("@/components/auth/auth-provider", () => ({ useCan: () => true }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
});

describe("StockPage", () => {
  it("ເລີ່ມທີ່ແຖບຍອດ ແລະ ສະຫຼັບໄປແຖບປະຫວັດໄດ້", async () => {
    const { user } = renderWithProviders(<StockPage initialQuery="" initialTab="levels" />);
    expect(screen.getByRole("tab", { name: "Levels", selected: true })).toBeInTheDocument();
    expect(await screen.findByText("No stock yet")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("tab", { name: "History", selected: true })).toBeInTheDocument();
    expect(await screen.findByText("No movements found")).toBeInTheDocument();
  });

  it("initialTab=movements ເປີດແຖບປະຫວັດ; initialQuery ສົ່ງໃຫ້ແຖບຍອດ", async () => {
    renderWithProviders(<StockPage initialQuery="TEE" initialTab="movements" />);
    expect(screen.getByRole("tab", { name: "History", selected: true })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: ຣັນໃຫ້ລົ້ມ** — FAIL.

- [ ] **Step 3: ຂຽນ `stock-page.tsx`**

```tsx
"use client";

import { PageHeader, cn } from "@oca/ui";
import { useState } from "react";
import { useT } from "@/lib/i18n/language-provider";
import { StockLevels } from "./stock-levels";
import { StockMovements } from "./stock-movements";

export type StockTab = "levels" | "movements";

export function StockPage({ initialQuery, initialTab }: { initialQuery: string; initialTab: StockTab }) {
  const { t } = useT();
  const [tab, setTab] = useState<StockTab>(initialTab);
  const tabs: { id: StockTab; label: string }[] = [
    { id: "levels", label: t("stock.tab.levels") },
    { id: "movements", label: t("stock.tab.movements") },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("stock.title")]}
        title={t("stock.title")}
        description={t("stock.description")}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <div role="tablist" aria-label={t("stock.title")} className="flex gap-1 border-b border-line">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === item.id ? "border-brand text-brand-ink" : "border-transparent text-ink-secondary hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "levels" ? <StockLevels initialQuery={initialQuery} /> : <StockMovements />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ໜ້າ** `apps/admin/src/app/(app)/stock/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { StockPage } from "@/components/stock/stock-page";

export default async function StockRoute({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const { q, tab } = await searchParams;
  return (
    <PermissionGate permission="inventory:read">
      <StockPage initialQuery={q ?? ""} initialTab={tab === "movements" ? "movements" : "levels"} />
    </PermissionGate>
  );
}
```

- [ ] **Step 5: nav** — ໃນ `nav.ts` ເພີ່ມ `Boxes` ໃນ import icon ແລະ ແຊກລາຍການ **ຖັດຈາກ `/products`**:

```ts
      { href: "/stock", labelKey: "nav.stock", icon: Boxes, permission: "inventory:read" },
```
ແກ້ `nav.test.ts` ກໍລະນີ `inventory:read`: `["/products", "/stock", "/warehouses", "/categories"]`. (key `nav.stock` ເພີ່ມແລ້ວໃນ Task 1.)

- [ ] **Step 6: ຣັນທັງ admin + lint + build**

Run: `pnpm --filter @oca/admin test && pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin lint && pnpm --filter @oca/admin build`
Expected: PASS ທັງໝົດ. (`next build` ຈະບອກວ່າ `/stock` ເປັນ dynamic ເພາະ `searchParams`; ປົກກະຕິ.)

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/stock/stock-page.tsx apps/admin/src/components/stock/stock-page.test.tsx "apps/admin/src/app/(app)/stock" apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts
git commit -m "feat(admin): stock page with levels and history tabs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/admin/src/components/stock/stock-page.tsx apps/admin/src/components/stock/stock-page.test.tsx "apps/admin/src/app/(app)/stock" apps/admin/src/lib/nav.ts apps/admin/src/lib/nav.test.ts
```

---

### Task 8: ກວດທັງ repo + smoke

- [ ] **Step 1:** `pnpm lint && pnpm build && pnpm test` → ຂຽວທັງໝົດ.
- [ ] **Step 2: smoke** (ເປີດ API :3002 + admin :3100 ຕາມ Plan A4 Task 11; ຫ້າມແຕະ 5432/6379):
  1. ຖ້າຍັງບໍ່ມີສິນຄ້າ ສ້າງຈາກ `/products/new` (A5) ໃຫ້ມີ 2 variant (ສະຖານະ DRAFT ກໍໄດ້).
  2. `/stock`: ຍັງບໍ່ມີແຖວ → ກົດ "ຮັບສະຕ໋ອກ" → ພິມ SKU → **ເຫັນ variant ຂອງສິນຄ້າ DRAFT** (`includeInactive`) → ເລືອກສາງ + ຈຳນວນ 10 → ແຖວໃໝ່ເກີດຂຶ້ນ.
  2b. ປັບຍອດ −3 ໂດຍມີເຫດຜົນ; ປັບ −99 → ເຫັນຂໍ້ຄວາມ "ສະຕ໋ອກບໍ່ພໍ" ພ້ອມລາຍການ shortage; ຍ້າຍ 2 ຊິ້ນໄປສາງ B (ສ້າງຈາກ `/warehouses`); ຮັບຄືນ 1; ຕັ້ງເກນໃກ້ໝົດ = 20 → ແຖວຂຶ້ນປ້າຍ "ໃກ້ໝົດ"; filter "ສະເພາະໃກ້ໝົດ" ເຫຼືອແຖວນັ້ນ.
  3. ແຖບ "ປະຫວັດ": ເຫັນ RECEIVE/ADJUST/TRANSFER_OUT/TRANSFER_IN/RETURN ຕາມລຳດັບ ໃໝ່→ເກົ່າ, ເຄື່ອງໝາຍ +/− ຖືກ; ກັ່ນຕອງວັນທີ "ຮອດວັນທີ" = ມື້ນີ້ ຍັງເຫັນລາຍການຂອງມື້ນີ້ (ກວດກົດ date-only + UTC+7); ເລືອກ variant ໃນ filter.
  4. ເປີດ `http://localhost:3100/stock?q=<SKU>` ຕົງ ແລະ `?tab=movements`.
  5. ຜູ້ໃຊ້ role ACCOUNTANT (ອ່ານຢ່າງດຽວ): ບໍ່ເຫັນປຸ່ມຮັບ/ປັບ/ຍ້າຍ/ຮັບຄືນ/ຕັ້ງເກນ.
- [ ] **Step 3:** ກວາດຂໍ້ມູນທົດສອບ ແລະ ຢຸດ process ທີ່ເຮົາເປີດ. ອັບເດດ memory `phase1-progress` (A6 ສຳເລັດ; ຕໍ່ໄປ A7).

---

## Self-review

* **Spec §10 `/stock`:** ແຖບຍອດ (ຕາຕະລາງ, ໄອຄອນໃກ້ໝົດ, filter ສາງ + ໃກ້ໝົດ, ປຸ່ມຮັບ/ປັບ (ເຫດຜົນບັງຄັບ)/ຍ້າຍ/ຮັບຄືນ ເປັນ dialog) ແລະ ແຖບປະຫວັດ (filter type/variant/ວັນທີ, ລິ້ງໄປບິນ) ຄົບ. ຮັບສະຕ໋ອກຄັ້ງທຳອິດ = `VariantPicker` + `includeInactive` (Task 2/3).
* **Contract ຂອງ API:** `to` ເປັນວັນທີລ້ວນ (Task 6 test), `INSUFFICIENT_STOCK` shortages (Task 1/3), 404 ຂອງ id ໃນ body ສະແດງຜ່ານ `error.*_NOT_FOUND` (errorMessage).
* **ຊື່ສອດຄ່ອງ:** `StockOpMode`/`useStockOperation` (Task 1) ໃຊ້ໃນ Task 3 ແລະ 5; `StockOpTarget` (Task 3) ໃຊ້ໃນ Task 5; `VariantPicker` (Task 2) ໃຊ້ໃນ Task 3, 6 ແລະຈະໃຊ້ໃນ A7; `formatMovementQuantity` (Task 6); `shortageLines` (Task 1) ໃຊ້ໃນ Task 3 ແລະຈະໃຊ້ໃນ A7.
* **ບໍ່ມີ placeholder.**
