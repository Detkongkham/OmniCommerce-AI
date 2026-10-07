# Phase 1-A1: Inventory Foundation (migration, seed, shared schemas, stock engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ວາງພື້ນຖານຂອງໂມດູນ Inventory: migration (`reservationMinutes`, sequence ເລກບິນ), seed (`StoreSetting` + ສາງ default), Zod schema + ສູດຄຳນວນເງິນໃນ `@oca/shared`, ແລະ **ເຄື່ອງຈັກສະຕ໋ອກແບບ atomic** + ຕົວຄືນສະຕ໋ອກຕອນໝົດເວລາ ໃນ `@oca/database` ພ້ອມ test ກັບ Postgres ຈິງ.

**Architecture:** ເຄື່ອງຈັກຢູ່ `packages/database/src/inventory/` (ບໍ່ຮູ້ຈັກ Nest/HTTP, ຮັບ `Prisma.TransactionClient`) ເພື່ອໃຫ້ທັງ `apps/api` ແລະ `apps/worker` ໃຊ້ໄດ້. ທຸກການປ່ຽນ `StockLevel` ເປັນ conditional `UPDATE` (raw SQL) + INSERT `StockMovement` ໃນ transaction ຂອງຜູ້ເອີ້ນ. Test concurrency ຢູ່ `apps/api/test` ເພາະມີ infra ຂອງ DB `oca_test` ຢູ່ແລ້ວ.

**Tech Stack:** Prisma 7 (driver adapter pg), PostgreSQL, Zod 4, decimal.js, Vitest 5.

**ອ້າງອີງ spec:** [2026-10-04-phase1-a-inventory-design.md](../specs/2026-10-04-phase1-a-inventory-design.md) §3, §4, §5, §7.2, §8 (ສ່ວນ logic ການໝົດເວລາ). ແຜນຕໍ່ໄປ: **1a-2** (API), **1a-3** (worker + docs), **1a-ui**.

## ຂໍ້ຕົກລົງສຳຄັນ (ອ່ານກ່ອນເລີ່ມ)

* **Branch:** ເຮັດໃນ `phase1-inventory` (ມີຢູ່ແລ້ວ). ທຸກ commit ລົງທ້າຍດ້ວຍ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
* **ຫ້າມແຕະ Postgres 5432 ຂອງຜູ້ໃຊ້.** DB ຂອງໂປຣເຈັກຢູ່ພອດ 5433 (`DATABASE_URL` ໃນ `.env`); test ໃຊ້ DB `oca_test` ໃນເຊີບເວີດຽວກັນ (`apps/api/test/global-setup.ts` ສ້າງ ແລະ ລັນ migration ໃຫ້). ຖ້າ Postgres 5433 ບໍ່ແລ່ນ (ເຄື່ອງບໍ່ມີ Docker): ເບິ່ງ `docs/DEPLOYMENT-NOTES.md` ແລະ memory `dev-database-isolation` ເພື່ອເປີດ embedded-postgres ແຍກ.
* **`@oca/database` ແລະ `@oca/shared` ຖືກ import ຜ່ານ `dist/`.** ຫຼັງແກ້ສອງ package ນີ້ ຕ້ອງ build ກ່ອນຮັນ test ຂອງ `apps/api`:
  `pnpm --filter @oca/shared build && pnpm --filter @oca/database build`
* **ເງິນ = `Decimal` ສະເໝີ**, DTO/ Zod ໃຊ້ string `"12500.00"`. ຫ້າມ `number`.
* **Raw SQL:** ໃຊ້ `tx.$executeRaw` / `tx.$queryRaw` ແບບ tagged template (parameterized) ເທົ່ານັ້ນ, ຫ້າມ `$executeRawUnsafe` ກັບຄ່າຈາກ input. ຊື່ຕາຕະລາງ/ຖັນໃນ Prisma ຕ້ອງໃສ່ເຄື່ອງໝາຍ `"` (ເຊັ່ນ `"StockLevel"`).
* **Test ຕ້ອງ run ໄດ້ຊ້ຳ:** ທຸກ test ທີ່ແຕະ DB ເອີ້ນ `resetDb(db)` ໃນ `beforeEach`.

---

## File Structure

```
packages/database/
├── prisma/schema.prisma                       (ແກ້: StoreSetting.reservationMinutes)
├── prisma/migrations/20261005000000_inventory/migration.sql   (ໃໝ່)
├── prisma/seed.ts                             (ແກ້: ເອີ້ນ seedStore)
└── src/
    ├── index.ts                               (ແກ້: export ./inventory)
    ├── seed/seed-store.ts (+test)             (ໃໝ່)
    └── inventory/
        ├── index.ts
        ├── errors.ts (+test)
        ├── stock-engine.ts
        └── expire-reservations.ts
packages/shared/
├── package.json                               (ແກ້: decimal.js)
└── src/
    ├── index.ts                               (ແກ້)
    ├── slug.ts (+test)
    ├── order-totals.ts (+test)
    └── schemas/inventory.ts (+test)
apps/api/test/
├── helpers.ts                                 (ແກ້: resetDb ຄົບ + seedCatalog)
├── inventory-migration.test.ts
├── stock-engine.test.ts
└── expire-reservations.test.ts
.env.example                                   (ແກ້: SEED_STORE_NAME)
```

---

### Task 1: Migration + schema + resetDb

**Files:**
- Modify: `apps/api/test/helpers.ts` (`resetDb`)
- Create: `apps/api/test/inventory-migration.test.ts`
- Modify: `packages/database/prisma/schema.prisma` (model `StoreSetting`)
- Create: `packages/database/prisma/migrations/20261005000000_inventory/migration.sql`

- [ ] **Step 1: ແກ້ `resetDb` ໃຫ້ລ້າງຕາຕະລາງ inventory ນຳ**

ໃນ `apps/api/test/helpers.ts` ແທນ `$executeRawUnsafe(...)` ໃນ `resetDb` ດ້ວຍ:

```ts
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "RefreshToken", "User", "RolePermission", "Role", ' +
      '"OrderItem", "Order", "Customer", "StockMovement", "StockLevel", "ProductImage", ' +
      '"ProductVariant", "ProductOptionValue", "ProductOption", "Product", "Category", ' +
      '"Warehouse", "ExchangeRate", "StoreSetting" RESTART IDENTITY CASCADE',
  );
  // sequence ເລກບິນບໍ່ຖືກ RESTART IDENTITY ແຕະ (ບໍ່ໄດ້ເປັນຂອງຖັນໃດ); ມີເງື່ອນໄຂເພາະ sequence ເກີດຈາກ migration inventory
  await db.$executeRawUnsafe(
    `DO $$ BEGIN
       IF to_regclass('"Order_number_seq"') IS NOT NULL THEN
         ALTER SEQUENCE "Order_number_seq" RESTART WITH 1;
       END IF;
     END $$`,
  );
```

ແລະເພີ່ມທ້າຍໄຟລ໌ helper ສຳລັບ fixture ສິນຄ້າ/ສາງ:

```ts
/** ສາງ A (default) + B, ສິນຄ້າ 1 ໂຕ ມີ 2 variants (SKU-1, SKU-2). ຍັງບໍ່ມີສະຕ໋ອກ. */
export async function seedCatalog(db: PrismaClient) {
  const whA = await db.warehouse.create({ data: { code: "A", name: "Warehouse A", isDefault: true } });
  const whB = await db.warehouse.create({ data: { code: "B", name: "Warehouse B" } });
  const product = await db.product.create({ data: { name: "Product", slug: "product", status: "ACTIVE" } });
  const makeVariant = (sku: string) =>
    db.productVariant.create({
      data: { productId: product.id, sku, price: "100.00", costPrice: "60.00" },
    });
  const v1 = await makeVariant("SKU-1");
  const v2 = await makeVariant("SKU-2");
  return { whA, whB, product, v1, v2 };
}
```

- [ ] **Step 2: ຂຽນ test ທີ່ຈະ fail**

`apps/api/test/inventory-migration.test.ts`:

```ts
import { type PrismaClient, createPrismaClient } from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

describe("inventory migration", () => {
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

  it("StoreSetting.reservationMinutes ມີຄ່າເລີ່ມຕົ້ນ 30", async () => {
    const row = await db.storeSetting.create({ data: { name: "Test" } });
    expect(row.reservationMinutes).toBe(30);
  });

  it("reservationMinutes ຕ້ອງຢູ່ໃນ 1..10080", async () => {
    await expect(db.storeSetting.create({ data: { name: "T", reservationMinutes: 0 } })).rejects.toThrow();
    await resetDb(db);
    await expect(db.storeSetting.create({ data: { name: "T", reservationMinutes: 10081 } })).rejects.toThrow();
    await resetDb(db);
    const ok = await db.storeSetting.create({ data: { name: "T", reservationMinutes: 10080 } });
    expect(ok.reservationMinutes).toBe(10080);
  });

  it("sequence Order_number_seq ເພີ່ມຂຶ້ນເທື່ອລະ 1", async () => {
    const [a] = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('"Order_number_seq"') AS n`;
    const [b] = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('"Order_number_seq"') AS n`;
    expect(a).toBeDefined();
    expect(b?.n).toBe((a?.n ?? 0n) + 1n);
  });
});
```

- [ ] **Step 3: ຮັນ ແລະ ຢືນຢັນວ່າ fail**

Run: `pnpm --filter @oca/api test -- inventory-migration`
Expected: FAIL (ຖັນ `reservationMinutes` / sequence ຍັງບໍ່ມີ).

- [ ] **Step 4: ແກ້ `schema.prisma`**

ໃນ model `StoreSetting` ເພີ່ມຕໍ່ຈາກ `pricesIncludeVat`:

```prisma
  reservationMinutes Int      @default(30) // ເວລາຈອງສະຕ໋ອກເລີ່ມຕົ້ນຂອງຄຳສັ່ງຊື້ (ນາທີ), 1..10080
```

- [ ] **Step 5: ສ້າງ migration (ຂຽນດ້ວຍມື)**

`packages/database/prisma/migrations/20261005000000_inventory/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN "reservationMinutes" INTEGER NOT NULL DEFAULT 30;

-- ຂຽນເພີ່ມດ້ວຍມື: Prisma schema ບໍ່ຮອງຮັບ CHECK constraint ແລະ sequence
ALTER TABLE "StoreSetting" ADD CONSTRAINT "StoreSetting_reservation_check"
  CHECK ("reservationMinutes" BETWEEN 1 AND 10080);

-- ເລກບິນ: "SO-" + lpad(nextval, 6, '0') ສ້າງໃນ OrdersService
CREATE SEQUENCE "Order_number_seq" START 1;
```

- [ ] **Step 6: Validate, generate, build, ແລ້ວຮັນ test**

Run:
```bash
pnpm --filter @oca/database db:validate
pnpm --filter @oca/database build
pnpm --filter @oca/api test -- inventory-migration
```
Expected: validate "The schema ... is valid"; test PASS (3 tests). `global-setup` ລັນ migration ໃຫ້ `oca_test` ອັດຕະໂນມັດ.

- [ ] **Step 7: ຢືນຢັນວ່າ test ເກົ່າຍັງຜ່ານ**

Run: `pnpm --filter @oca/api test`
Expected: PASS ທັງໝົດ (ຈຳນວນ test ເກົ່າ + 3).

- [ ] **Step 8: Commit**

```bash
git add apps/api/test/helpers.ts apps/api/test/inventory-migration.test.ts packages/database/prisma
git commit -m "feat(db): add reservationMinutes and order number sequence

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Seed ການຕັ້ງຄ່າຮ້ານ ແລະ ສາງ default (TDD)

**Files:**
- Create: `packages/database/src/seed/seed-store.ts`, `packages/database/src/seed/seed-store.test.ts`
- Modify: `packages/database/prisma/seed.ts`, `.env.example`

- [ ] **Step 1: ຂຽນ test**

`packages/database/src/seed/seed-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type SeedStoreDb, seedStore } from "./seed-store";

interface FakeSetting {
  id: number;
  name: string;
}
interface FakeWarehouse {
  code: string;
  name: string;
  isDefault: boolean;
}

function createFakeDb(initial: { settings?: FakeSetting[]; warehouses?: FakeWarehouse[] } = {}) {
  const settings: FakeSetting[] = [...(initial.settings ?? [])];
  const warehouses: FakeWarehouse[] = [...(initial.warehouses ?? [])];

  const db = {
    storeSetting: {
      upsert: async ({ where, create }: { where: { id: number }; create: FakeSetting }) => {
        const found = settings.find((s) => s.id === where.id);
        if (found) return found;
        settings.push(create);
        return create;
      },
    },
    warehouse: {
      findFirst: async ({ where }: { where: { isDefault: boolean } }) =>
        warehouses.find((w) => w.isDefault === where.isDefault) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { code: string };
        create: FakeWarehouse;
        update: Partial<FakeWarehouse>;
      }) => {
        const found = warehouses.find((w) => w.code === where.code);
        if (found) {
          Object.assign(found, update);
          return found;
        }
        warehouses.push(create);
        return create;
      },
    },
  } as unknown as SeedStoreDb;

  return { db, settings, warehouses };
}

describe("seedStore", () => {
  it("ສ້າງ StoreSetting (id=1) ແລະ ສາງ MAIN ເປັນ default ເມື່ອຍັງບໍ່ມີ", async () => {
    const { db, settings, warehouses } = createFakeDb();
    await seedStore(db, { storeName: "ຮ້ານທົດລອງ" });
    expect(settings).toEqual([{ id: 1, name: "ຮ້ານທົດລອງ" }]);
    expect(warehouses).toEqual([{ code: "MAIN", name: "ສາງຫຼັກ", isDefault: true }]);
  });

  it("run ຊ້ຳບໍ່ສ້າງຊ້ຳ ແລະ ບໍ່ຂຽນທັບຊື່ຮ້ານທີ່ແກ້ແລ້ວ", async () => {
    const { db, settings, warehouses } = createFakeDb();
    await seedStore(db, { storeName: "ຊື່ເດີມ" });
    await seedStore(db, { storeName: "ຊື່ໃໝ່" });
    expect(settings).toHaveLength(1);
    expect(settings[0]?.name).toBe("ຊື່ເດີມ");
    expect(warehouses).toHaveLength(1);
  });

  it("ຖ້າມີສາງ default ຢູ່ແລ້ວ (code ອື່ນ) ບໍ່ສ້າງ MAIN", async () => {
    const { db, warehouses } = createFakeDb({
      warehouses: [{ code: "KV", name: "ສາງວຽງຈັນ", isDefault: true }],
    });
    await seedStore(db, { storeName: "S" });
    expect(warehouses).toEqual([{ code: "KV", name: "ສາງວຽງຈັນ", isDefault: true }]);
  });

  it("ຖ້າມີ MAIN ແຕ່ບໍ່ແມ່ນ default ແລະ ບໍ່ມີ default ອື່ນ ໃຫ້ຕັ້ງ MAIN ເປັນ default", async () => {
    const { db, warehouses } = createFakeDb({
      warehouses: [{ code: "MAIN", name: "ສາງຫຼັກ", isDefault: false }],
    });
    await seedStore(db, { storeName: "S" });
    expect(warehouses[0]?.isDefault).toBe(true);
  });
});
```

- [ ] **Step 2: ຮັນ ແລະ ຢືນຢັນວ່າ fail**

Run: `pnpm --filter @oca/database test -- seed-store`
Expected: FAIL (`Cannot find module './seed-store'`).

- [ ] **Step 3: ຂຽນ implementation**

`packages/database/src/seed/seed-store.ts`:

```ts
import type { PrismaClient } from "../generated/client";

export type SeedStoreDb = Pick<PrismaClient, "storeSetting" | "warehouse">;

export interface SeedStoreInput {
  storeName: string;
}

export const DEFAULT_WAREHOUSE_CODE = "MAIN";

/** Run ຊ້ຳໄດ້: ບໍ່ຂຽນທັບຊື່ຮ້ານ ແລະ ບໍ່ສ້າງສາງ default ຊ້ຳ. */
export async function seedStore(db: SeedStoreDb, input: SeedStoreInput): Promise<void> {
  await db.storeSetting.upsert({
    where: { id: 1 },
    create: { id: 1, name: input.storeName },
    update: {},
  });

  const existingDefault = await db.warehouse.findFirst({ where: { isDefault: true } });
  if (existingDefault) return;

  await db.warehouse.upsert({
    where: { code: DEFAULT_WAREHOUSE_CODE },
    create: { code: DEFAULT_WAREHOUSE_CODE, name: "ສາງຫຼັກ", isDefault: true },
    update: { isDefault: true },
  });
}
```

- [ ] **Step 4: ຮັນ test ໃຫ້ຜ່ານ**

Run: `pnpm --filter @oca/database test -- seed-store`
Expected: PASS (4 tests).

- [ ] **Step 5: ເຊື່ອມໃສ່ `prisma/seed.ts` ແລະ `.env.example`**

ແທນເນື້ອຫາ `packages/database/prisma/seed.ts` ດ້ວຍ:

```ts
import { hash } from "@node-rs/argon2";
import { emailSchema, passwordSchema } from "@oca/shared";
import { createPrismaClient } from "../src/index";
import { seedAuth } from "../src/seed/seed-auth";
import { seedStore } from "../src/seed/seed-store";

async function main(): Promise<void> {
  const ownerEmail = emailSchema.parse(process.env.SEED_OWNER_EMAIL);
  const ownerPassword = passwordSchema.parse(process.env.SEED_OWNER_PASSWORD);
  const storeName = process.env.SEED_STORE_NAME?.trim() || "OCA Store";

  const db = createPrismaClient();
  try {
    await seedAuth(db, { ownerEmail, ownerPasswordHash: await hash(ownerPassword) });
    await seedStore(db, { storeName });
    console.log(`Seed ok: owner ${ownerEmail}, store "${storeName}"`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

ໃນ `.env.example` ເພີ່ມຕໍ່ຈາກ `SEED_OWNER_PASSWORD=...`:

```
# Seed: ຊື່ຮ້ານເລີ່ມຕົ້ນ (ບໍ່ຂຽນທັບຖ້າມີ StoreSetting ແລ້ວ)
SEED_STORE_NAME=OCA Store
```

- [ ] **Step 6: Lint + commit**

Run: `pnpm --filter @oca/database lint`
Expected: ບໍ່ມີ error.

```bash
git add packages/database/src/seed packages/database/prisma/seed.ts .env.example
git commit -m "feat(db): seed StoreSetting and default warehouse

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `slugify` ແລະ `calculateOrderTotals` ໃນ `@oca/shared` (TDD)

**Files:**
- Modify: `packages/shared/package.json`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/slug.ts`, `packages/shared/src/slug.test.ts`, `packages/shared/src/order-totals.ts`, `packages/shared/src/order-totals.test.ts`

- [ ] **Step 1: ຕິດຕັ້ງ decimal.js**

Run: `pnpm --filter @oca/shared add decimal.js@10.6.0`
Expected: `package.json` ມີ `"decimal.js": "10.6.0"` (ຫຼື `^10.6.0`), lockfile ອັບເດດ. (ເວີຊັນນີ້ຢູ່ໃນ lockfile ແລ້ວຜ່ານ Prisma.)

- [ ] **Step 2: ຂຽນ test ຂອງ `slugify`**

`packages/shared/src/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, slugify } from "./slug";

describe("slugify", () => {
  it("ປ່ຽນເປັນຕົວນ້ອຍ ແລະ ໃຊ້ - ຄັ່ນ", () => {
    expect(slugify("  Black T-Shirt (M) ")).toBe("black-t-shirt-m");
  });
  it("ຍຸບ - ຕິດກັນ ແລະ ຕັດ - ທ້າຍ/ໜ້າ", () => {
    expect(slugify("--a__b--")).toBe("a-b");
  });
  it("ຊື່ລາວລ້ວນໄດ້ສະຕຣິງວ່າງ (ຜູ້ເອີ້ນຕ້ອງມີ fallback)", () => {
    expect(slugify("ເສື້ອຍືດ")).toBe("");
  });
  it("ຜົນລັບ non-empty ຜ່ານ SLUG_PATTERN", () => {
    expect(SLUG_PATTERN.test(slugify("Hello World 2"))).toBe(true);
  });
  it("ຕັດຄວາມຍາວບໍ່ເກີນ 100", () => {
    expect(slugify("a".repeat(300)).length).toBe(100);
  });
});
```

- [ ] **Step 3: ຮັນ → fail; ຂຽນ `slug.ts`; ຮັນ → pass**

Run: `pnpm --filter @oca/shared test -- slug` → FAIL (module ບໍ່ມີ).

`packages/shared/src/slug.ts`:

```ts
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 100;

/** ສ້າງ slug ຈາກຊື່ (ASCII ເທົ່ານັ້ນ). ຊື່ທີ່ບໍ່ມີ a-z/0-9 ເລີຍຈະໄດ້ "" - ຜູ້ເອີ້ນຕ້ອງມີ fallback. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}
```

Run: `pnpm --filter @oca/shared test -- slug` → PASS (5 tests).

- [ ] **Step 4: ຂຽນ test ຂອງ `calculateOrderTotals`**

`packages/shared/src/order-totals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateOrderTotals } from "./order-totals";

describe("calculateOrderTotals", () => {
  it("ລາຄາລວມ VAT (ຕົວຢ່າງໃນ spec §7.2)", () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: "12500.00", quantity: 2, discount: "500.00" }],
      shippingFee: "15000.00",
      vatRate: "10",
      pricesIncludeVat: true,
    });
    expect(result).toEqual({
      lines: [{ lineTotal: "24500.00" }],
      subtotal: "24500.00",
      discountTotal: "500.00",
      vatAmount: "3590.91",
      total: "39500.00",
    });
  });

  it("ລາຄາບໍ່ລວມ VAT: ບວກ VAT ເຂົ້າ total", () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: "100.00", quantity: 3, discount: "0" }],
      shippingFee: "0",
      vatRate: "10",
      pricesIncludeVat: false,
    });
    expect(result.subtotal).toBe("300.00");
    expect(result.vatAmount).toBe("30.00");
    expect(result.total).toBe("330.00");
  });

  it("ປັດເສດແບບ half-up ທີ່ 2 ຫຼັກ", () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: "0.05", quantity: 1, discount: "0" }],
      shippingFee: "0",
      vatRate: "10",
      pricesIncludeVat: false,
    });
    expect(result.vatAmount).toBe("0.01"); // 0.005 -> 0.01
    expect(result.total).toBe("0.06");
  });

  it("ຫຼາຍລາຍການ: ລວມ subtotal ແລະ discountTotal", () => {
    const result = calculateOrderTotals({
      lines: [
        { unitPrice: "10.00", quantity: 2, discount: "1.00" },
        { unitPrice: "5.50", quantity: 1, discount: "0" },
      ],
      shippingFee: "2.00",
      vatRate: "0",
      pricesIncludeVat: true,
    });
    expect(result.lines).toEqual([{ lineTotal: "19.00" }, { lineTotal: "5.50" }]);
    expect(result.subtotal).toBe("24.50");
    expect(result.discountTotal).toBe("1.00");
    expect(result.vatAmount).toBe("0.00");
    expect(result.total).toBe("26.50");
  });

  it("ສ່ວນຫຼຸດ = ລາຄາເຕັມ ໄດ້ lineTotal 0", () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: "100.00", quantity: 1, discount: "100.00" }],
      shippingFee: "0",
      vatRate: "10",
      pricesIncludeVat: true,
    });
    expect(result.lines[0]?.lineTotal).toBe("0.00");
    expect(result.total).toBe("0.00");
  });

  it("ສ່ວນຫຼຸດເກີນລາຄາ throw RangeError", () => {
    expect(() =>
      calculateOrderTotals({
        lines: [{ unitPrice: "100.00", quantity: 1, discount: "100.01" }],
        shippingFee: "0",
        vatRate: "10",
        pricesIncludeVat: true,
      }),
    ).toThrow(RangeError);
  });
});
```

- [ ] **Step 5: ຮັນ → fail; ຂຽນ `order-totals.ts`; ຮັນ → pass**

Run: `pnpm --filter @oca/shared test -- order-totals` → FAIL.

`packages/shared/src/order-totals.ts`:

```ts
import { Decimal } from "decimal.js";

// Decimal ສະເພາະຂອງໂມດູນນີ້: ປັດເສດ half-up ໂດຍບໍ່ແຕະ config ທົ່ວໂລກ
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface TotalsLineInput {
  unitPrice: string;
  quantity: number;
  discount: string;
}

export interface OrderTotalsInput {
  lines: TotalsLineInput[];
  shippingFee: string;
  vatRate: string;
  pricesIncludeVat: boolean;
}

export interface OrderTotals {
  lines: { lineTotal: string }[];
  subtotal: string;
  discountTotal: string;
  vatAmount: string;
  total: string;
}

const money = (value: Decimal): string => value.toDecimalPlaces(2).toFixed(2);

/**
 * ສູດຕາມ spec §7.2:
 *   lineTotal = unitPrice x quantity - discount (ຕ້ອງ >= 0)
 *   subtotal = sum(lineTotal) (ຫຼັງຫັກສ່ວນຫຼຸດລາຍການ); vatBase = subtotal + shippingFee
 *   ລວມ VAT: vat = vatBase x r / (100 + r), total = vatBase
 *   ບໍ່ລວມ VAT: vat = vatBase x r / 100, total = vatBase + vat
 */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const lines = input.lines.map((line) => {
    const lineTotal = new D(line.unitPrice).mul(line.quantity).minus(line.discount);
    if (lineTotal.isNegative()) {
      throw new RangeError("discount exceeds line amount");
    }
    return { lineTotal, discount: new D(line.discount) };
  });

  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new D(0));
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discount), new D(0));
  const vatBase = subtotal.plus(input.shippingFee);
  const rate = new D(input.vatRate);

  const vatAmount = input.pricesIncludeVat
    ? vatBase.mul(rate).div(rate.plus(100)).toDecimalPlaces(2)
    : vatBase.mul(rate).div(100).toDecimalPlaces(2);
  const total = input.pricesIncludeVat ? vatBase : vatBase.plus(vatAmount);

  return {
    lines: lines.map((line) => ({ lineTotal: money(line.lineTotal) })),
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    vatAmount: money(vatAmount),
    total: money(total),
  };
}
```

Run: `pnpm --filter @oca/shared test -- order-totals` → PASS (6 tests).

- [ ] **Step 6: Export ແລະ commit**

ໃນ `packages/shared/src/index.ts` ເພີ່ມ:

```ts
export * from "./order-totals";
export * from "./slug";
```

Run: `pnpm --filter @oca/shared lint && pnpm --filter @oca/shared build`
Expected: ບໍ່ມີ error.

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add slugify and order totals calculation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Zod schemas ຂອງ Inventory (TDD)

**Files:**
- Create: `packages/shared/src/schemas/inventory.ts`, `packages/shared/src/schemas/inventory.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: ຂຽນ test**

`packages/shared/src/schemas/inventory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  adjustStockSchema,
  createCategorySchema,
  createOrderSchema,
  createProductSchema,
  createWarehouseSchema,
  moneySchema,
  orderListQuerySchema,
  productListQuerySchema,
  transferStockSchema,
  updateProductSchema,
  updateStoreSettingsSchema,
  variantName,
} from "./inventory";

const simpleProduct = {
  name: "ແກ້ວນ້ຳ",
  variants: [{ sku: "CUP-1", price: "25000" }],
};

const shirt = {
  name: "ເສື້ອຍືດ",
  options: [
    { name: "ສີ", values: ["ດຳ", "ຂາວ"] },
    { name: "ໄຊສ໌", values: ["M", "L"] },
  ],
  variants: [
    { sku: "TS-BK-M", price: "100000", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
    { sku: "TS-BK-L", price: "100000", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "L" } },
  ],
};

describe("moneySchema", () => {
  it.each(["0", "12500", "12500.5", "12500.50"])("ຮັບ %s", (value) => {
    expect(moneySchema.safeParse(value).success).toBe(true);
  });
  it.each(["-1", "1.234", "abc", "", "1e3", "12500.", ".5"])("ປະຕິເສດ %s", (value) => {
    expect(moneySchema.safeParse(value).success).toBe(false);
  });
});

describe("createProductSchema", () => {
  it("ສິນຄ້າບໍ່ມີ option ມີ 1 variant: ໃສ່ຄ່າເລີ່ມຕົ້ນ", () => {
    const parsed = createProductSchema.parse(simpleProduct);
    expect(parsed.status).toBe("DRAFT");
    expect(parsed.options).toEqual([]);
    expect(parsed.images).toEqual([]);
    expect(parsed.variants[0]).toMatchObject({ costPrice: "0", isActive: true, optionValues: {} });
  });

  it("ສິນຄ້າບໍ່ມີ option ແຕ່ມີ 2 variants ຜິດ", () => {
    const result = createProductSchema.safeParse({
      ...simpleProduct,
      variants: [
        { sku: "A", price: "1" },
        { sku: "B", price: "1" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("ສິນຄ້າທີ່ມີ options ຖືກຕ້ອງ", () => {
    expect(createProductSchema.safeParse(shirt).success).toBe(true);
  });

  it("variant ລະບຸ option ບໍ່ຄົບ ຜິດ", () => {
    const result = createProductSchema.safeParse({
      ...shirt,
      variants: [{ sku: "X", price: "1", optionValues: { ສີ: "ດຳ" } }],
    });
    expect(result.success).toBe(false);
  });

  it("ຄ່າ option ທີ່ບໍ່ຢູ່ໃນລາຍການ ຜິດ", () => {
    const result = createProductSchema.safeParse({
      ...shirt,
      variants: [{ sku: "X", price: "1", optionValues: { ສີ: "ແດງ", ໄຊສ໌: "M" } }],
    });
    expect(result.success).toBe(false);
  });

  it("ຊຸດຄ່າ option ຊ້ຳ ຜິດ", () => {
    const result = createProductSchema.safeParse({
      ...shirt,
      variants: [
        { sku: "A", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
        { sku: "B", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("SKU ຫຼື barcode ຊ້ຳໃນ request ຜິດ", () => {
    expect(
      createProductSchema.safeParse({
        ...shirt,
        variants: [
          { sku: "A", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
          { sku: "A", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "L" } },
        ],
      }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...shirt,
        variants: [
          { sku: "A", barcode: "885", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
          { sku: "B", barcode: "885", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "L" } },
        ],
      }).success,
    ).toBe(false);
  });

  it("option ເກີນ 3 ຫຼື ຊື່ option ຊ້ຳ ຜິດ", () => {
    const four = ["a", "b", "c", "d"].map((name) => ({ name, values: ["1"] }));
    expect(createProductSchema.safeParse({ ...shirt, options: four }).success).toBe(false);
    const dup = [
      { name: "ສີ", values: ["ດຳ"] },
      { name: "ສີ", values: ["ຂາວ"] },
    ];
    expect(createProductSchema.safeParse({ ...shirt, options: dup }).success).toBe(false);
  });

  it("compareAtPrice ຕ້ອງ >= price", () => {
    const bad = { ...simpleProduct, variants: [{ sku: "A", price: "100", compareAtPrice: "99.99" }] };
    expect(createProductSchema.safeParse(bad).success).toBe(false);
    const ok = { ...simpleProduct, variants: [{ sku: "A", price: "100", compareAtPrice: "100" }] };
    expect(createProductSchema.safeParse(ok).success).toBe(true);
  });

  it("SKU ຮັບສະເພາະ A-Z a-z 0-9 . _ -", () => {
    const bad = { ...simpleProduct, variants: [{ sku: "has space", price: "1" }] };
    expect(createProductSchema.safeParse(bad).success).toBe(false);
  });

  it("ຮູບ: URL ຕ້ອງ http/https ແລະ variantSku ຕ້ອງມີຢູ່", () => {
    const base = { ...simpleProduct };
    expect(
      createProductSchema.safeParse({ ...base, images: [{ url: "https://cdn.test/a.jpg" }] }).success,
    ).toBe(true);
    expect(createProductSchema.safeParse({ ...base, images: [{ url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...base,
        images: [{ url: "https://cdn.test/a.jpg", variantSku: "NOPE" }],
      }).success,
    ).toBe(false);
  });

  it("ປະຕິເສດ field ແປກ (strict)", () => {
    expect(createProductSchema.safeParse({ ...simpleProduct, hacked: true }).success).toBe(false);
  });
});

describe("variantName", () => {
  it("ຕໍ່ຄ່າຕາມລຳດັບ option ດ້ວຍ ' / '", () => {
    expect(variantName(["ສີ", "ໄຊສ໌"], { ໄຊສ໌: "M", ສີ: "ດຳ" })).toBe("ດຳ / M");
  });
  it("ບໍ່ມີ option ໄດ້ null", () => {
    expect(variantName([], {})).toBeNull();
  });
});

describe("updateProductSchema / category / warehouse", () => {
  it("update ຕ້ອງມີຢ່າງໜ້ອຍ 1 field", () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
    expect(updateProductSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
  });
  it("category slug ຕ້ອງຖືກຮູບແບບ", () => {
    expect(createCategorySchema.safeParse({ name: "A", slug: "Bad Slug" }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: "A", slug: "good-slug" }).success).toBe(true);
  });
  it("warehouse code ຕ້ອງເປັນຕົວໃຫຍ່", () => {
    expect(createWarehouseSchema.safeParse({ code: "main", name: "x" }).success).toBe(false);
    const ok = createWarehouseSchema.parse({ code: "MAIN", name: "x" });
    expect(ok.isActive).toBe(true);
  });
});

describe("stock operation schemas", () => {
  it("adjust: delta ≠ 0 ແລະ ຕ້ອງມີ note", () => {
    const base = { variantId: "v", warehouseId: "w", delta: -2, note: "ນັບສະຕ໋ອກ" };
    expect(adjustStockSchema.safeParse(base).success).toBe(true);
    expect(adjustStockSchema.safeParse({ ...base, delta: 0 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ ...base, note: "" }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ ...base, delta: 1.5 }).success).toBe(false);
  });
  it("transfer: ສາງຕົ້ນທາງ ≠ ປາຍທາງ", () => {
    const base = { variantId: "v", fromWarehouseId: "a", toWarehouseId: "b", quantity: 1 };
    expect(transferStockSchema.safeParse(base).success).toBe(true);
    expect(transferStockSchema.safeParse({ ...base, toWarehouseId: "a" }).success).toBe(false);
  });
});

describe("createOrderSchema", () => {
  const item = { variantId: "v1", quantity: 2 };
  it("ຄ່າເລີ່ມຕົ້ນ: discount 0, shippingFee 0", () => {
    const parsed = createOrderSchema.parse({ items: [item] });
    expect(parsed.items[0]?.discount).toBe("0");
    expect(parsed.shippingFee).toBe("0");
  });
  it("items ຫວ່າງ ຜິດ", () => {
    expect(createOrderSchema.safeParse({ items: [] }).success).toBe(false);
  });
  it("customerId ແລະ customer ໃຊ້ພ້ອມກັນບໍ່ໄດ້", () => {
    const result = createOrderSchema.safeParse({
      items: [item],
      customerId: "c1",
      customer: { name: "A", phone: "020555555" },
    });
    expect(result.success).toBe(false);
  });
  it("phone ຕ້ອງເປັນຕົວເລກ 6-15 ຫຼັກ (ມີ + ໜ້າໄດ້)", () => {
    const make = (phone: string) => ({ items: [item], customer: { name: "A", phone } });
    expect(createOrderSchema.safeParse(make("+85620555555")).success).toBe(true);
    expect(createOrderSchema.safeParse(make("12ab")).success).toBe(false);
  });
  it("(variantId, warehouseId) ຊ້ຳ ຜິດ", () => {
    expect(createOrderSchema.safeParse({ items: [item, item] }).success).toBe(false);
    expect(
      createOrderSchema.safeParse({ items: [item, { ...item, warehouseId: "w2" }] }).success,
    ).toBe(true);
  });
  it("reservationMinutes ຢູ່ໃນ 1..10080", () => {
    expect(createOrderSchema.safeParse({ items: [item], reservationMinutes: 0 }).success).toBe(false);
    expect(createOrderSchema.safeParse({ items: [item], reservationMinutes: 45 }).success).toBe(true);
  });
});

describe("query schemas", () => {
  it("ໃສ່ຄ່າເລີ່ມຕົ້ນ page=1 pageSize=20 ແລະ coerce ຈາກ string", () => {
    expect(productListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(productListQuerySchema.parse({ page: "3", pageSize: "50" })).toMatchObject({ page: 3, pageSize: 50 });
  });
  it("pageSize ເກີນ 100 ຜິດ", () => {
    expect(productListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
  it("order list: status ຕ້ອງເປັນ enum, from/to ເປັນ Date", () => {
    expect(orderListQuerySchema.safeParse({ status: "NOPE" }).success).toBe(false);
    const parsed = orderListQuerySchema.parse({ status: "PAID", from: "2026-10-01" });
    expect(parsed.from).toBeInstanceOf(Date);
  });
});

describe("updateStoreSettingsSchema", () => {
  it("vatRate 0-100, reservationMinutes 1-10080, ບໍ່ມີ baseCurrency", () => {
    expect(updateStoreSettingsSchema.safeParse({ vatRate: 10 }).success).toBe(true);
    expect(updateStoreSettingsSchema.safeParse({ vatRate: 101 }).success).toBe(false);
    expect(updateStoreSettingsSchema.safeParse({ reservationMinutes: 0 }).success).toBe(false);
    expect(updateStoreSettingsSchema.safeParse({ baseCurrency: "USD" }).success).toBe(false);
    expect(updateStoreSettingsSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: ຮັນ → fail**

Run: `pnpm --filter @oca/shared test -- inventory`
Expected: FAIL (`Cannot find module './inventory'`).

- [ ] **Step 3: ຂຽນ `packages/shared/src/schemas/inventory.ts`**

```ts
import { Decimal } from "decimal.js";
import { z } from "zod";
import { SLUG_PATTERN } from "../slug";

// ---------------------------------------------------------------------------
// ຄ່າຄົງທີ່ (ກົງກັບ enum ໃນ Prisma schema)
// ---------------------------------------------------------------------------
export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PACKING",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;
export const SALES_CHANNELS = ["STOREFRONT", "FACEBOOK", "INSTAGRAM", "TIKTOK", "LINE", "OFFLINE"] as const;
export const STOCK_MOVEMENT_TYPES = [
  "RECEIVE",
  "ADJUST",
  "RESERVE",
  "RELEASE",
  "SHIP",
  "RETURN",
  "TRANSFER_IN",
  "TRANSFER_OUT",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type SalesChannel = (typeof SALES_CHANNELS)[number];
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const MAX_RESERVATION_MINUTES = 10080;

// ---------------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------------
const idSchema = z.string().min(1);
const text = (max: number) => z.string().trim().min(1).max(max);

/** ຈຳນວນເງິນເປັນ string: ບວກ, ສູງສຸດ 2 ທົດສະນິຍົມ. */
export const moneySchema = z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, "ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ");

export const quantitySchema = z.number().int().min(1).max(1_000_000);

export const deltaSchema = z
  .number()
  .int()
  .min(-1_000_000)
  .max(1_000_000)
  .refine((value) => value !== 0, "delta ຕ້ອງບໍ່ເປັນ 0");

export const slugSchema = z
  .string()
  .trim()
  .max(100)
  .regex(SLUG_PATTERN, "slug ໃຊ້ໄດ້ສະເພາະ a-z 0-9 ແລະ - ຄັ່ນ");

const reservationMinutesSchema = z.number().int().min(1).max(MAX_RESERVATION_MINUTES);

const requireNonEmpty = <T extends object>(value: T) => Object.keys(value).length > 0;
const NON_EMPTY_MESSAGE = "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
const imageUrlSchema = z.string().trim().max(2048).refine(isHttpUrl, "URL ຕ້ອງເປັນ http ຫຼື https");

// ---------------------------------------------------------------------------
// pagination + query
// ---------------------------------------------------------------------------
const pageShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const boolQuery = z.enum(["true", "false"]).transform((value) => value === "true");
const optionalDate = z.coerce.date().optional();
const optionalText = z.string().trim().max(100).optional();

export const productListQuerySchema = z.object({
  ...pageShape,
  q: optionalText,
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: idSchema.optional(),
});

export const stockListQuerySchema = z.object({
  ...pageShape,
  q: optionalText,
  warehouseId: idSchema.optional(),
  variantId: idSchema.optional(),
  lowStock: boolQuery.optional(),
});

export const stockMovementQuerySchema = z.object({
  ...pageShape,
  variantId: idSchema.optional(),
  warehouseId: idSchema.optional(),
  orderId: idSchema.optional(),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  from: optionalDate,
  to: optionalDate,
});

export const orderListQuerySchema = z.object({
  ...pageShape,
  q: optionalText,
  status: z.enum(ORDER_STATUSES).optional(),
  channel: z.enum(SALES_CHANNELS).optional(),
  from: optionalDate,
  to: optionalDate,
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type StockListQuery = z.infer<typeof stockListQuerySchema>;
export type StockMovementQuery = z.infer<typeof stockMovementQuerySchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

// ---------------------------------------------------------------------------
// category
// ---------------------------------------------------------------------------
export const createCategorySchema = z.strictObject({
  name: text(100),
  slug: slugSchema.optional(),
  parentId: idSchema.nullable().optional(),
  position: z.number().int().min(0).default(0),
});

export const updateCategorySchema = z
  .strictObject({
    name: text(100).optional(),
    slug: slugSchema.optional(),
    parentId: idSchema.nullable().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ---------------------------------------------------------------------------
// product / variant / images
// ---------------------------------------------------------------------------
const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "SKU ໃຊ້ໄດ້ສະເພາະ A-Z a-z 0-9 . _ -");
const barcodeSchema = z.string().trim().min(1).max(64);
const weightSchema = z.number().int().min(0).max(1_000_000);

const compareAtMessage = { message: "compareAtPrice ຕ້ອງ >= price", path: ["compareAtPrice"] };
const compareAtOk = (value: { price: string; compareAtPrice?: string | null }) =>
  value.compareAtPrice == null || new Decimal(value.compareAtPrice).gte(value.price);

export const productOptionInputSchema = z.strictObject({
  name: text(50),
  values: z.array(text(30)).min(1).max(50),
});

export const variantInputSchema = z
  .strictObject({
    sku: skuSchema,
    barcode: barcodeSchema.nullable().optional(),
    price: moneySchema,
    compareAtPrice: moneySchema.nullable().optional(),
    costPrice: moneySchema.default("0"),
    weightGrams: weightSchema.nullable().optional(),
    isActive: z.boolean().default(true),
    /** { [ຊື່ option]: ຄ່າ } */
    optionValues: z.record(z.string(), z.string()).default({}),
  })
  .refine(compareAtOk, compareAtMessage);

export const updateVariantSchema = z
  .strictObject({
    sku: skuSchema.optional(),
    barcode: barcodeSchema.nullable().optional(),
    price: moneySchema.optional(),
    compareAtPrice: moneySchema.nullable().optional(),
    costPrice: moneySchema.optional(),
    weightGrams: weightSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export const productImageInputSchema = z.strictObject({
  url: imageUrlSchema,
  alt: z.string().trim().max(200).optional(),
  /** ໃຊ້ຕອນສ້າງສິນຄ້າ (ອ້າງ variant ຜ່ານ SKU ເພາະ id ຍັງບໍ່ມີ) */
  variantSku: skuSchema.optional(),
});

export const putProductImagesSchema = z.strictObject({
  images: z
    .array(
      z.strictObject({
        url: imageUrlSchema,
        alt: z.string().trim().max(200).optional(),
        variantId: idSchema.optional(),
      }),
    )
    .max(20),
});

export const createProductSchema = z
  .strictObject({
    name: text(200),
    slug: slugSchema.optional(),
    description: z.string().trim().max(10_000).optional(),
    status: z.enum(PRODUCT_STATUSES).default("DRAFT"),
    categoryId: idSchema.nullable().optional(),
    options: z.array(productOptionInputSchema).max(3).default([]),
    variants: z.array(variantInputSchema).min(1).max(100),
    images: z.array(productImageInputSchema).max(20).default([]),
  })
  .superRefine((value, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const optionNames = value.options.map((option) => option.name);
    if (new Set(optionNames).size !== optionNames.length) issue(["options"], "ຊື່ option ຊ້ຳກັນ");
    value.options.forEach((option, index) => {
      if (new Set(option.values).size !== option.values.length) {
        issue(["options", index, "values"], "ຄ່າຂອງ option ຊ້ຳກັນ");
      }
    });

    if (value.options.length === 0) {
      if (value.variants.length !== 1) issue(["variants"], "ສິນຄ້າທີ່ບໍ່ມີ option ຕ້ອງມີ 1 variant");
      value.variants.forEach((variant, index) => {
        if (Object.keys(variant.optionValues).length > 0) {
          issue(["variants", index, "optionValues"], "ສິນຄ້ານີ້ບໍ່ມີ option");
        }
      });
    } else {
      const seen = new Set<string>();
      value.variants.forEach((variant, index) => {
        const path = ["variants", index, "optionValues"];
        const keys = Object.keys(variant.optionValues);
        const complete = keys.length === optionNames.length && optionNames.every((name) => name in variant.optionValues);
        if (!complete) {
          issue(path, "ຕ້ອງລະບຸຄ່າຂອງທຸກ option");
          return;
        }
        for (const option of value.options) {
          if (!option.values.includes(variant.optionValues[option.name] ?? "")) {
            issue(path, `ຄ່າຂອງ ${option.name} ບໍ່ຢູ່ໃນລາຍການ`);
          }
        }
        const combo = JSON.stringify(value.options.map((option) => variant.optionValues[option.name]));
        if (seen.has(combo)) issue(path, "ຊຸດຄ່າ option ຊ້ຳກັນ");
        seen.add(combo);
      });
    }

    const skus = value.variants.map((variant) => variant.sku);
    if (new Set(skus).size !== skus.length) issue(["variants"], "SKU ຊ້ຳກັນ");
    const barcodes = value.variants.flatMap((variant) => (variant.barcode ? [variant.barcode] : []));
    if (new Set(barcodes).size !== barcodes.length) issue(["variants"], "barcode ຊ້ຳກັນ");

    value.images.forEach((image, index) => {
      if (image.variantSku !== undefined && !skus.includes(image.variantSku)) {
        issue(["images", index, "variantSku"], "ບໍ່ພົບ SKU ນີ້ໃນ variants");
      }
    });
  });

export const updateProductSchema = z
  .strictObject({
    name: text(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    categoryId: idSchema.nullable().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type PutProductImagesInput = z.infer<typeof putProductImagesSchema>;

/** ຊື່ variant = ຄ່າຕາມລຳດັບ option ຕໍ່ດ້ວຍ " / "; null ຖ້າບໍ່ມີ option. */
export function variantName(optionNames: readonly string[], optionValues: Record<string, string>): string | null {
  const name = optionNames.map((optionName) => optionValues[optionName] ?? "").join(" / ");
  return name === "" ? null : name;
}

// ---------------------------------------------------------------------------
// warehouse
// ---------------------------------------------------------------------------
const warehouseCodeSchema = z.string().regex(/^[A-Z0-9_-]{1,20}$/, "code ໃຊ້ A-Z 0-9 _ - (ສູງສຸດ 20)");

export const createWarehouseSchema = z.strictObject({
  code: warehouseCodeSchema,
  name: text(100),
  address: z.string().trim().max(300).optional(),
  isActive: z.boolean().default(true),
});

export const updateWarehouseSchema = z
  .strictObject({
    code: warehouseCodeSchema.optional(),
    name: text(100).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;

// ---------------------------------------------------------------------------
// stock operations
// ---------------------------------------------------------------------------
const noteSchema = z.string().trim().min(1).max(200);

export const receiveStockSchema = z.strictObject({
  variantId: idSchema,
  warehouseId: idSchema,
  quantity: quantitySchema,
  note: noteSchema.optional(),
});

export const adjustStockSchema = z.strictObject({
  variantId: idSchema,
  warehouseId: idSchema,
  delta: deltaSchema,
  note: noteSchema,
});

export const transferStockSchema = z
  .strictObject({
    variantId: idSchema,
    fromWarehouseId: idSchema,
    toWarehouseId: idSchema,
    quantity: quantitySchema,
    note: noteSchema.optional(),
  })
  .refine((value) => value.fromWarehouseId !== value.toWarehouseId, {
    message: "ສາງຕົ້ນທາງແລະປາຍທາງຕ້ອງຕ່າງກັນ",
    path: ["toWarehouseId"],
  });

export const returnStockSchema = z.strictObject({
  variantId: idSchema,
  warehouseId: idSchema,
  quantity: quantitySchema,
  orderId: idSchema.optional(),
  note: noteSchema.optional(),
});

export const stockThresholdSchema = z.strictObject({
  lowStockThreshold: z.number().int().min(0).max(1_000_000).nullable(),
});

export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type ReturnStockInput = z.infer<typeof returnStockSchema>;
export type StockThresholdInput = z.infer<typeof stockThresholdSchema>;

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------
export const orderItemInputSchema = z.strictObject({
  variantId: idSchema,
  warehouseId: idSchema.optional(),
  quantity: quantitySchema,
  discount: moneySchema.default("0"),
});

export const orderCustomerInputSchema = z.strictObject({
  name: text(100),
  phone: z.string().regex(/^\+?[0-9]{6,15}$/, "ເບີໂທບໍ່ຖືກຕ້ອງ"),
  email: z.string().trim().email().max(200).optional(),
});

export const createOrderSchema = z
  .strictObject({
    customerId: idSchema.optional(),
    customer: orderCustomerInputSchema.optional(),
    items: z.array(orderItemInputSchema).min(1).max(100),
    shippingFee: moneySchema.default("0"),
    shippingName: z.string().trim().max(100).optional(),
    shippingPhone: z.string().trim().max(30).optional(),
    shippingAddress: z.string().trim().max(300).optional(),
    note: z.string().trim().max(500).optional(),
    reservationMinutes: reservationMinutesSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.customerId !== undefined && value.customer !== undefined) {
      ctx.addIssue({ code: "custom", path: ["customer"], message: "ໃຊ້ customerId ຫຼື customer ຢ່າງໃດຢ່າງໜຶ່ງ" });
    }
    const keys = value.items.map((item) => `${item.variantId}|${item.warehouseId ?? ""}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "ມີລາຍການ (variant, ສາງ) ຊ້ຳກັນ" });
    }
  });

export const cancelOrderSchema = z.strictObject({
  reason: z.string().trim().max(200).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// ---------------------------------------------------------------------------
// store settings
// ---------------------------------------------------------------------------
export const updateStoreSettingsSchema = z
  .strictObject({
    name: text(100).optional(),
    vatRate: z.number().min(0).max(100).multipleOf(0.01).optional(),
    pricesIncludeVat: z.boolean().optional(),
    reservationMinutes: reservationMinutesSchema.optional(),
  })
  .refine(requireNonEmpty, NON_EMPTY_MESSAGE);

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;
```

- [ ] **Step 4: Export ແລະ ຮັນ test**

ໃນ `packages/shared/src/index.ts` ເພີ່ມ `export * from "./schemas/inventory";`

Run: `pnpm --filter @oca/shared test`
Expected: PASS ທັງໝົດ. ຖ້າ `multipleOf(0.01)` ໃຫ້ຜົນ floating-point ຜິດກັບ test `vatRate: 10` ໃຫ້ແກ້ເປັນ `.refine((v) => Number.isInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9)` ແລ້ວຮັນຊ້ຳ.

- [ ] **Step 5: Lint, build, commit**

Run: `pnpm --filter @oca/shared lint && pnpm --filter @oca/shared build`
Expected: ບໍ່ມີ error.

```bash
git add packages/shared
git commit -m "feat(shared): add inventory zod schemas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Errors ຂອງເຄື່ອງຈັກສະຕ໋ອກ (TDD)

**Files:**
- Create: `packages/database/src/inventory/errors.ts`, `packages/database/src/inventory/errors.test.ts`

- [ ] **Step 1: ຂຽນ test**

`packages/database/src/inventory/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InsufficientStockError, isStockCheckViolation } from "./errors";

describe("InsufficientStockError", () => {
  it("ເກັບລາຍການທີ່ບໍ່ພໍ ແລະ ເປັນ Error", () => {
    const shortages = [{ variantId: "v1", warehouseId: "w1", requested: 5, available: 2 }];
    const error = new InsufficientStockError(shortages);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InsufficientStockError");
    expect(error.shortages).toEqual(shortages);
    expect(error.message).toContain("1");
  });
});

describe("isStockCheckViolation", () => {
  it("ຈັບຈາກ message", () => {
    expect(isStockCheckViolation(new Error('violates check constraint "StockLevel_stock_check"'))).toBe(true);
  });
  it("ຈັບຈາກ meta (driver adapter)", () => {
    const error = Object.assign(new Error("Raw query failed"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { constraint: "StockLevel_stock_check" } } },
    });
    expect(isStockCheckViolation(error)).toBe(true);
  });
  it("error ອື່ນ ແລະ ຄ່າທີ່ບໍ່ແມ່ນ object ຄືນ false", () => {
    expect(isStockCheckViolation(new Error("connection reset"))).toBe(false);
    expect(isStockCheckViolation(null)).toBe(false);
    expect(isStockCheckViolation("StockLevel_stock_check")).toBe(false);
  });
  it("meta ທີ່ stringify ບໍ່ໄດ້ (BigInt) ບໍ່ throw", () => {
    const error = Object.assign(new Error("x"), { meta: { n: 1n } });
    expect(isStockCheckViolation(error)).toBe(false);
  });
});
```

- [ ] **Step 2: ຮັນ → fail**

Run: `pnpm --filter @oca/database test -- errors`
Expected: FAIL (module ບໍ່ມີ).

- [ ] **Step 3: ຂຽນ `errors.ts`**

```ts
export interface StockShortage {
  variantId: string;
  warehouseId: string;
  requested: number;
  available: number;
}

/** ສະຕ໋ອກບໍ່ພໍ. ຜູ້ເອີ້ນຕ້ອງປ່ອຍໃຫ້ transaction rollback. */
export class InsufficientStockError extends Error {
  readonly shortages: StockShortage[];

  constructor(shortages: StockShortage[]) {
    super(`Insufficient stock for ${shortages.length} item(s)`);
    this.name = "InsufficientStockError";
    this.shortages = shortages;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/** CHECK 0 <= reserved <= onHand ຖືກຕີ (ດ່ານສຸດທ້າຍ ຖ້າເງື່ອນໄຂ UPDATE ຖືກຂ້າມ). */
export function isStockCheckViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { message, meta } = error as { message?: unknown; meta?: unknown };
  return `${typeof message === "string" ? message : ""} ${safeJson(meta)}`.includes("StockLevel_stock_check");
}
```

- [ ] **Step 4: ຮັນ → pass; commit**

Run: `pnpm --filter @oca/database test -- errors` → PASS (5 tests).

```bash
git add packages/database/src/inventory
git commit -m "feat(db): add InsufficientStockError

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ເຄື່ອງຈັກສະຕ໋ອກ (TDD ກັບ Postgres ຈິງ)

**Files:**
- Create: `packages/database/src/inventory/stock-engine.ts`, `packages/database/src/inventory/index.ts`, `apps/api/test/stock-engine.test.ts`
- Modify: `packages/database/src/index.ts`

- [ ] **Step 1: ຂຽນ test (ຍັງບໍ່ມີ implementation)**

`apps/api/test/stock-engine.test.ts`:

```ts
import {
  InsufficientStockError,
  type Prisma,
  type PrismaClient,
  adjust,
  createPrismaClient,
  receive,
  release,
  releaseMany,
  reserve,
  reserveMany,
  returnStock,
  ship,
  shipMany,
  transfer,
} from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedCatalog } from "./helpers";

type Tx = Prisma.TransactionClient;

describe("stock engine (Postgres ຈິງ)", () => {
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  const run = <T>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn);
  const key = (variantId: string, warehouseId: string) => ({ variantId, warehouseId });

  async function level(variantId: string, warehouseId: string) {
    const row = await db.stockLevel.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
    });
    return row ? { onHand: row.onHand, reserved: row.reserved } : null;
  }

  /** onHand/reserved ຕ້ອງເທົ່າກັບຜົນລວມຂອງ StockMovement (spec §4 invariant). */
  async function expectLedgerMatches() {
    const rows = await db.$queryRaw<
      { onHand: number; reserved: number; expectedOnHand: number; expectedReserved: number }[]
    >`
      SELECT l."onHand", l."reserved",
        COALESCE(SUM(CASE
          WHEN m."type" IN ('RECEIVE','RETURN','TRANSFER_IN','ADJUST') THEN m."quantity"
          WHEN m."type" IN ('SHIP','TRANSFER_OUT') THEN -m."quantity"
          ELSE 0 END), 0)::int AS "expectedOnHand",
        COALESCE(SUM(CASE
          WHEN m."type" = 'RESERVE' THEN m."quantity"
          WHEN m."type" IN ('RELEASE','SHIP') THEN -m."quantity"
          ELSE 0 END), 0)::int AS "expectedReserved"
      FROM "StockLevel" l
      LEFT JOIN "StockMovement" m ON m."variantId" = l."variantId" AND m."warehouseId" = l."warehouseId"
      GROUP BY l."id"`;
    for (const row of rows) {
      expect(row.onHand).toBe(row.expectedOnHand);
      expect(row.reserved).toBe(row.expectedReserved);
    }
  }

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
    f = await seedCatalog(db);
  });

  it("receive ສ້າງແຖວ StockLevel ໃໝ່ ແລະ ເພີ່ມຕໍ່; ຂຽນ movement", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => receive(tx, { ...k, quantity: 10 }, { actorId: "u1", note: "PO-1" }));
    await run((tx) => receive(tx, { ...k, quantity: 5 }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 15, reserved: 0 });

    const movements = await db.stockMovement.findMany({ orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.quantity])).toEqual([
      ["RECEIVE", 10],
      ["RECEIVE", 5],
    ]);
    expect(movements[0]).toMatchObject({ actorId: "u1", note: "PO-1" });
    await expectLedgerMatches();
  });

  it("reserve ສຳເລັດເມື່ອພໍ ແລະ throw InsufficientStockError ເມື່ອບໍ່ພໍ (ພ້ອມ available)", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => receive(tx, { ...k, quantity: 5 }));
    await run((tx) => reserve(tx, { ...k, quantity: 3 }));

    const error = await run((tx) => reserve(tx, { ...k, quantity: 3 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).shortages).toEqual([
      { ...k, requested: 3, available: 2 },
    ]);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 5, reserved: 3 });
    expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(1);
    await expectLedgerMatches();
  });

  it("reserve ໃສ່ variant ທີ່ບໍ່ເຄີຍມີສະຕ໋ອກ → ບໍ່ພໍ (available 0)", async () => {
    const error = await run((tx) => reserve(tx, { ...key(f.v1.id, f.whA.id), quantity: 1 })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).shortages[0]?.available).toBe(0);
  });

  it("release ແລະ ship ປ່ຽນ reserved/onHand ຖືກຕ້ອງ; ເກີນ reserved ບໍ່ໄດ້", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => receive(tx, { ...k, quantity: 10 }));
    await run((tx) => reserve(tx, { ...k, quantity: 6 }));

    await run((tx) => release(tx, { ...k, quantity: 2 }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 10, reserved: 4 });

    await run((tx) => ship(tx, { ...k, quantity: 3 }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 7, reserved: 1 });

    await expect(run((tx) => ship(tx, { ...k, quantity: 2 }))).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(run((tx) => release(tx, { ...k, quantity: 2 }))).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 7, reserved: 1 });
    await expectLedgerMatches();
  });

  it("returnStock ເພີ່ມ onHand ແລະ ຂຽນ RETURN", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => returnStock(tx, { ...k, quantity: 2 }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 2, reserved: 0 });
    expect(await db.stockMovement.count({ where: { type: "RETURN" } })).toBe(1);
    await expectLedgerMatches();
  });

  it("adjust: ບວກສ້າງແຖວໄດ້; ລົບຕ້ອງບໍ່ເຮັດໃຫ້ onHand < reserved; movement ເກັບຄ່າຕິດລົບ", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => adjust(tx, { ...k, delta: 5 }, { note: "ນັບສະຕ໋ອກ" }));
    await run((tx) => reserve(tx, { ...k, quantity: 3 }));

    await expect(run((tx) => adjust(tx, { ...k, delta: -3 }, { note: "x" }))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    await run((tx) => adjust(tx, { ...k, delta: -2 }, { note: "ເສຍຫາຍ" }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 3, reserved: 3 });

    const adjustments = await db.stockMovement.findMany({ where: { type: "ADJUST" }, orderBy: { createdAt: "asc" } });
    expect(adjustments.map((m) => m.quantity)).toEqual([5, -2]);
    await expectLedgerMatches();
  });

  it("adjust ລົບໃສ່ variant ທີ່ບໍ່ມີແຖວ → ບໍ່ພໍ; delta 0 ຫຼື ບໍ່ແມ່ນ integer → RangeError", async () => {
    const k = key(f.v1.id, f.whA.id);
    await expect(run((tx) => adjust(tx, { ...k, delta: -1 }))).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(run((tx) => adjust(tx, { ...k, delta: 0 }))).rejects.toBeInstanceOf(RangeError);
    await expect(run((tx) => adjust(tx, { ...k, delta: 1.5 }))).rejects.toBeInstanceOf(RangeError);
  });

  it("quantity ≤ 0 ຫຼື ບໍ່ແມ່ນ integer → RangeError", async () => {
    const k = key(f.v1.id, f.whA.id);
    await expect(run((tx) => receive(tx, { ...k, quantity: 0 }))).rejects.toBeInstanceOf(RangeError);
    await expect(run((tx) => reserve(tx, { ...k, quantity: -1 }))).rejects.toBeInstanceOf(RangeError);
    await expect(run((tx) => receive(tx, { ...k, quantity: 1.2 }))).rejects.toBeInstanceOf(RangeError);
  });

  it("transfer: ຍ້າຍສະເພາະທີ່ຂາຍໄດ້ (onHand - reserved); ເຮັດ 2 movement", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 5 }));
    await run((tx) => reserve(tx, { ...key(f.v1.id, f.whA.id), quantity: 3 }));
    const t = { variantId: f.v1.id, fromWarehouseId: f.whA.id, toWarehouseId: f.whB.id };

    await expect(run((tx) => transfer(tx, { ...t, quantity: 3 }))).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await level(f.v1.id, f.whB.id)).toBeNull(); // rollback: ປາຍທາງບໍ່ຖືກສ້າງ

    await run((tx) => transfer(tx, { ...t, quantity: 2 }, { actorId: "u1" }));
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 3, reserved: 3 });
    expect(await level(f.v1.id, f.whB.id)).toEqual({ onHand: 2, reserved: 0 });
    const types = (await db.stockMovement.findMany({ where: { type: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } }))
      .map((m) => `${m.type}:${m.warehouseId === f.whA.id ? "A" : "B"}:${m.quantity}`)
      .sort();
    expect(types).toEqual(["TRANSFER_IN:B:2", "TRANSFER_OUT:A:2"]);
    await expectLedgerMatches();
  });

  it("transfer ໄປສາງດຽວກັນ → RangeError", async () => {
    await expect(
      run((tx) => transfer(tx, { variantId: f.v1.id, fromWarehouseId: f.whA.id, toWarehouseId: f.whA.id, quantity: 1 })),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("reserve ພ້ອມກັນ 20 ຄັ້ງໃສ່ສະຕ໋ອກ 1 ຊິ້ນ → ສຳເລັດ 1 ຄັ້ງພໍດີ", async () => {
    const k = key(f.v1.id, f.whA.id);
    await run((tx) => receive(tx, { ...k, quantity: 1 }));

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => run((tx) => reserve(tx, { ...k, quantity: 1 }))),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(19);
    expect(rejected.every((r) => r.reason instanceof InsufficientStockError)).toBe(true);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 1, reserved: 1 });
    expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(1);
    await expectLedgerMatches();
  });

  it("reserveMany: ລາຍການສຸດທ້າຍບໍ່ພໍ → rollback ທັງໝົດ ແລະ ລາຍງານທຸກລາຍການທີ່ບໍ່ພໍ", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 5 }));
    await run((tx) => receive(tx, { ...key(f.v2.id, f.whA.id), quantity: 1 }));
    const lines = [
      { ...key(f.v1.id, f.whA.id), quantity: 2 },
      { ...key(f.v2.id, f.whA.id), quantity: 4 }, // ບໍ່ພໍ (ມີ 1)
      { ...key(f.v1.id, f.whB.id), quantity: 1 }, // ບໍ່ພໍ (ບໍ່ມີແຖວ)
    ];

    const error = await run((tx) => reserveMany(tx, lines)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InsufficientStockError);
    const shortages = (error as InsufficientStockError).shortages;
    expect(shortages.map((s) => [s.variantId, s.warehouseId, s.requested, s.available]).sort()).toEqual(
      [
        [f.v2.id, f.whA.id, 4, 1],
        [f.v1.id, f.whB.id, 1, 0],
      ].sort(),
    );
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 5, reserved: 0 });
    expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(0);
    await expectLedgerMatches();
  });

  it("reserveMany/releaseMany/shipMany ໃສ່ orderId ໃນ movement", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 5 }));
    await run((tx) => receive(tx, { ...key(f.v2.id, f.whA.id), quantity: 5 }));
    const order = await db.order.create({
      data: {
        orderNumber: "SO-T1",
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "0",
        vatRate: "10",
        vatAmount: "0",
        total: "0",
      },
    });
    const lines = [
      { ...key(f.v2.id, f.whA.id), quantity: 2 },
      { ...key(f.v1.id, f.whA.id), quantity: 1 },
    ];
    await run((tx) => reserveMany(tx, lines, { orderId: order.id }));
    await run((tx) => shipMany(tx, [lines[0]!], { orderId: order.id }));
    await run((tx) => releaseMany(tx, [lines[1]!], { orderId: order.id }));

    expect(await level(f.v2.id, f.whA.id)).toEqual({ onHand: 3, reserved: 0 });
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 5, reserved: 0 });
    const movements = await db.stockMovement.findMany({ where: { orderId: order.id } });
    expect(movements.map((m) => m.type).sort()).toEqual(["RELEASE", "RESERVE", "RESERVE", "SHIP"]);
    await expectLedgerMatches();
  });

  it("ບໍ່ deadlock ເມື່ອສອງ transaction ຈອງຊຸດດຽວກັນຄົນລະລຳດັບ (ວົນ 50 ຮອບ)", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 1000 }));
    await run((tx) => receive(tx, { ...key(f.v2.id, f.whA.id), quantity: 1000 }));
    const forward = [
      { ...key(f.v1.id, f.whA.id), quantity: 1 },
      { ...key(f.v2.id, f.whA.id), quantity: 1 },
    ];
    const backward = [...forward].reverse();

    for (let i = 0; i < 50; i += 1) {
      const results = await Promise.allSettled([
        run((tx) => reserveMany(tx, forward)),
        run((tx) => reserveMany(tx, backward)),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    }
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 1000, reserved: 100 });
    expect(await level(f.v2.id, f.whA.id)).toEqual({ onHand: 1000, reserved: 100 });
    await expectLedgerMatches();
  });

  it("transfer ສອງທິດ A→B ແລະ B→A ພ້ອມກັນ ບໍ່ deadlock (ວົນ 30 ຮອບ)", async () => {
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whA.id), quantity: 500 }));
    await run((tx) => receive(tx, { ...key(f.v1.id, f.whB.id), quantity: 500 }));
    const ab = { variantId: f.v1.id, fromWarehouseId: f.whA.id, toWarehouseId: f.whB.id, quantity: 1 };
    const ba = { variantId: f.v1.id, fromWarehouseId: f.whB.id, toWarehouseId: f.whA.id, quantity: 1 };

    for (let i = 0; i < 30; i += 1) {
      const results = await Promise.allSettled([run((tx) => transfer(tx, ab)), run((tx) => transfer(tx, ba))]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    }
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 500, reserved: 0 });
    expect(await level(f.v1.id, f.whB.id)).toEqual({ onHand: 500, reserved: 0 });
    await expectLedgerMatches();
  });
});
```

- [ ] **Step 2: ຮັນ → fail**

Run: `pnpm --filter @oca/api test -- stock-engine`
Expected: FAIL (`receive` ຯລຯ ບໍ່ຖືກ export ຈາກ `@oca/database`).

- [ ] **Step 3: ຂຽນ `packages/database/src/inventory/stock-engine.ts`**

```ts
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/client";
import { InsufficientStockError, type StockShortage, isStockCheckViolation } from "./errors";

/**
 * ເຄື່ອງຈັກສະຕ໋ອກ. ທຸກ function ຕ້ອງຖືກເອີ້ນພາຍໃນ `$transaction` ຂອງຜູ້ເອີ້ນ:
 * ຖ້າ throw (ເຊັ່ນ InsufficientStockError) ຜູ້ເອີ້ນປ່ອຍໃຫ້ transaction rollback ທັງໝົດ.
 * ໂມດູນອື່ນຫ້າມ UPDATE "StockLevel" / INSERT "StockMovement" ນອກຈາກຜ່ານໄຟລ໌ນີ້.
 */
export type Tx = Prisma.TransactionClient;

export interface StockKey {
  variantId: string;
  warehouseId: string;
}

export interface StockLine extends StockKey {
  quantity: number;
}

export interface AdjustLine extends StockKey {
  /** ບວກ ຫຼື ລົບ, ບໍ່ແມ່ນ 0 */
  delta: number;
}

export interface TransferLine {
  variantId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
}

export interface MoveContext {
  orderId?: string | null;
  actorId?: string | null;
  note?: string | null;
}

type MovementType =
  | "RECEIVE"
  | "ADJUST"
  | "RESERVE"
  | "RELEASE"
  | "SHIP"
  | "RETURN"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError("quantity must be a positive integer");
  }
}

function assertDelta(delta: number): void {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new RangeError("delta must be a non-zero integer");
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** ຮຽງແບບ ASCII ຕາມ (variantId, warehouseId) ເພື່ອໃຫ້ທຸກ transaction lock ແຖວຕາມລຳດັບດຽວກັນ (ກັນ deadlock). */
function sortLines<T extends StockKey>(lines: readonly T[]): T[] {
  return [...lines].sort((a, b) => compare(a.variantId, b.variantId) || compare(a.warehouseId, b.warehouseId));
}

async function record(
  tx: Tx,
  key: StockKey,
  type: MovementType,
  quantity: number,
  ctx: MoveContext,
  extraNote?: string,
): Promise<void> {
  const note = [ctx.note, extraNote].filter((part): part is string => Boolean(part)).join(" | ");
  await tx.stockMovement.create({
    data: {
      variantId: key.variantId,
      warehouseId: key.warehouseId,
      type,
      quantity,
      orderId: ctx.orderId ?? null,
      actorId: ctx.actorId ?? null,
      note: note === "" ? null : note,
    },
  });
}

async function shortageOf(tx: Tx, key: StockKey, requested: number): Promise<StockShortage> {
  const rows = await tx.$queryRaw<{ available: number }[]>`
    SELECT "onHand" - "reserved" AS "available" FROM "StockLevel"
    WHERE "variantId" = ${key.variantId} AND "warehouseId" = ${key.warehouseId}`;
  return { variantId: key.variantId, warehouseId: key.warehouseId, requested, available: rows[0]?.available ?? 0 };
}

/**
 * ຣັນ conditional UPDATE: true = ແກ້ 1 ແຖວ (ເງື່ອນໄຂຜ່ານ), false = 0 ແຖວ (ບໍ່ພໍ).
 * ຖ້າ CHECK ຂອງ DB ຖືກຕີ ແປເປັນ InsufficientStockError (transaction ຖືກ abort ແລ້ວ ຈຶ່ງບໍ່ query ຕໍ່).
 */
async function conditional(key: StockKey, requested: number, run: () => Promise<number>): Promise<boolean> {
  try {
    return (await run()) > 0;
  } catch (error) {
    if (isStockCheckViolation(error)) {
      throw new InsufficientStockError([{ ...key, requested, available: 0 }]);
    }
    throw error;
  }
}

async function increaseOnHand(tx: Tx, key: StockKey, quantity: number): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "StockLevel" ("id", "variantId", "warehouseId", "onHand", "reserved", "updatedAt")
    VALUES (${randomUUID()}, ${key.variantId}, ${key.warehouseId}, ${quantity}, 0, now())
    ON CONFLICT ("variantId", "warehouseId")
    DO UPDATE SET "onHand" = "StockLevel"."onHand" + ${quantity}, "updatedAt" = now()`;
}

async function tryDecreaseAvailable(tx: Tx, key: StockKey, quantity: number): Promise<boolean> {
  return conditional(key, quantity, () => tx.$executeRaw`
    UPDATE "StockLevel" SET "onHand" = "onHand" - ${quantity}, "updatedAt" = now()
    WHERE "variantId" = ${key.variantId} AND "warehouseId" = ${key.warehouseId}
      AND "onHand" - "reserved" >= ${quantity}`);
}

async function tryReserve(tx: Tx, key: StockKey, quantity: number): Promise<boolean> {
  return conditional(key, quantity, () => tx.$executeRaw`
    UPDATE "StockLevel" SET "reserved" = "reserved" + ${quantity}, "updatedAt" = now()
    WHERE "variantId" = ${key.variantId} AND "warehouseId" = ${key.warehouseId}
      AND "onHand" - "reserved" >= ${quantity}`);
}

async function fail(tx: Tx, key: StockKey, requested: number): Promise<never> {
  throw new InsufficientStockError([await shortageOf(tx, key, requested)]);
}

// ---------------------------------------------------------------------------
// ການເຄື່ອນໄຫວແບບແຖວດຽວ
// ---------------------------------------------------------------------------
export async function receive(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  await increaseOnHand(tx, line, line.quantity);
  await record(tx, line, "RECEIVE", line.quantity, ctx);
}

export async function returnStock(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  await increaseOnHand(tx, line, line.quantity);
  await record(tx, line, "RETURN", line.quantity, ctx);
}

export async function adjust(tx: Tx, line: AdjustLine, ctx: MoveContext = {}): Promise<void> {
  assertDelta(line.delta);
  if (line.delta > 0) {
    await increaseOnHand(tx, line, line.delta);
  } else {
    const ok = await conditional(line, -line.delta, () => tx.$executeRaw`
      UPDATE "StockLevel" SET "onHand" = "onHand" + ${line.delta}, "updatedAt" = now()
      WHERE "variantId" = ${line.variantId} AND "warehouseId" = ${line.warehouseId}
        AND "onHand" + ${line.delta} >= "reserved"`);
    if (!ok) await fail(tx, line, -line.delta);
  }
  await record(tx, line, "ADJUST", line.delta, ctx);
}

export async function reserve(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  if (!(await tryReserve(tx, line, line.quantity))) await fail(tx, line, line.quantity);
  await record(tx, line, "RESERVE", line.quantity, ctx);
}

export async function release(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  const ok = await conditional(line, line.quantity, () => tx.$executeRaw`
    UPDATE "StockLevel" SET "reserved" = "reserved" - ${line.quantity}, "updatedAt" = now()
    WHERE "variantId" = ${line.variantId} AND "warehouseId" = ${line.warehouseId}
      AND "reserved" >= ${line.quantity}`);
  if (!ok) await fail(tx, line, line.quantity);
  await record(tx, line, "RELEASE", line.quantity, ctx);
}

export async function ship(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  const ok = await conditional(line, line.quantity, () => tx.$executeRaw`
    UPDATE "StockLevel"
    SET "onHand" = "onHand" - ${line.quantity}, "reserved" = "reserved" - ${line.quantity}, "updatedAt" = now()
    WHERE "variantId" = ${line.variantId} AND "warehouseId" = ${line.warehouseId}
      AND "reserved" >= ${line.quantity}`);
  if (!ok) await fail(tx, line, line.quantity);
  await record(tx, line, "SHIP", line.quantity, ctx);
}

/**
 * ຍ້າຍສະຕ໋ອກທີ່ຂາຍໄດ້ (onHand - reserved) ລະຫວ່າງສາງ. ສອງຂັ້ນຕອນເຮັດຕາມລຳດັບ warehouseId
 * ນ້ອຍ→ໃຫຍ່ ເພື່ອກັນ deadlock ເມື່ອມີ A→B ແລະ B→A ພ້ອມກັນ.
 */
export async function transfer(tx: Tx, line: TransferLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  if (line.fromWarehouseId === line.toWarehouseId) {
    throw new RangeError("source and destination warehouse must differ");
  }
  const from: StockKey = { variantId: line.variantId, warehouseId: line.fromWarehouseId };
  const to: StockKey = { variantId: line.variantId, warehouseId: line.toWarehouseId };

  const out = async () => {
    if (!(await tryDecreaseAvailable(tx, from, line.quantity))) await fail(tx, from, line.quantity);
  };
  const into = () => increaseOnHand(tx, to, line.quantity);

  if (line.fromWarehouseId < line.toWarehouseId) {
    await out();
    await into();
  } else {
    await into();
    await out();
  }

  await record(tx, from, "TRANSFER_OUT", line.quantity, ctx, `to ${line.toWarehouseId}`);
  await record(tx, to, "TRANSFER_IN", line.quantity, ctx, `from ${line.fromWarehouseId}`);
}

// ---------------------------------------------------------------------------
// ຫຼາຍລາຍການ (ສຳລັບຄຳສັ່ງຊື້): ຮຽງ lock ສະເໝີ
// ---------------------------------------------------------------------------
/**
 * ຈອງທຸກລາຍການ. ຖ້າບາງລາຍການບໍ່ພໍ ຈະລອງຄົບທຸກລາຍການກ່ອນ ແລ້ວ throw ຄັ້ງດຽວພ້ອມລາຍການທີ່ບໍ່ພໍທັງໝົດ
 * (ເພື່ອໃຫ້ຜູ້ໃຊ້ເຫັນຄົບໃນຄັ້ງດຽວ). ການ throw ເຮັດໃຫ້ transaction ຂອງຜູ້ເອີ້ນ rollback.
 */
export async function reserveMany(tx: Tx, lines: readonly StockLine[], ctx: MoveContext = {}): Promise<void> {
  const sorted = sortLines(lines);
  const reserved: StockLine[] = [];
  const shortages: StockShortage[] = [];
  for (const line of sorted) {
    assertQuantity(line.quantity);
    if (await tryReserve(tx, line, line.quantity)) reserved.push(line);
    else shortages.push(await shortageOf(tx, line, line.quantity));
  }
  if (shortages.length > 0) throw new InsufficientStockError(shortages);
  for (const line of reserved) await record(tx, line, "RESERVE", line.quantity, ctx);
}

export async function releaseMany(tx: Tx, lines: readonly StockLine[], ctx: MoveContext = {}): Promise<void> {
  for (const line of sortLines(lines)) await release(tx, line, ctx);
}

export async function shipMany(tx: Tx, lines: readonly StockLine[], ctx: MoveContext = {}): Promise<void> {
  for (const line of sortLines(lines)) await ship(tx, line, ctx);
}
```

- [ ] **Step 4: Export**

`packages/database/src/inventory/index.ts`:

```ts
export * from "./errors";
export * from "./stock-engine";
```

ໃນ `packages/database/src/index.ts` ເພີ່ມຕໍ່ຈາກ `export * from "./generated/client";`:

```ts
export * from "./inventory";
```

- [ ] **Step 5: Build ແລ້ວຮັນ test**

Run:
```bash
pnpm --filter @oca/database build
pnpm --filter @oca/api test -- stock-engine
```
Expected: PASS ທັງ 14 test. ຖ້າ test ໃດ fail:
  * `could not determine data type of parameter $N`: ເພີ່ມ cast ໃສ່ parameter ນັ້ນໃນ SQL, ເຊັ່ນ `${quantity}::int`.
  * deadlock test fail (`40P01`): ກວດວ່າ `sortLines` ຖືກເອີ້ນກ່ອນ UPDATE ໃນ `reserveMany`.
  * `isStockCheckViolation` ບໍ່ຈັບ error: ພິມ `error.message`/`error.meta` ຈາກ Prisma ແລ້ວປັບ `errors.ts` (ເພີ່ມ test ກໍລະນີນັ້ນໃນ `errors.test.ts`).

- [ ] **Step 6: ຮັນ lint + test ຂອງ database ແລ້ວ commit**

Run: `pnpm --filter @oca/database lint && pnpm --filter @oca/database test`
Expected: PASS.

```bash
git add packages/database/src apps/api/test/stock-engine.test.ts
git commit -m "feat(db): add atomic stock engine with concurrency tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ຄືນສະຕ໋ອກເມື່ອບິນໝົດເວລາ (TDD)

**Files:**
- Create: `packages/database/src/inventory/expire-reservations.ts`, `apps/api/test/expire-reservations.test.ts`
- Modify: `packages/database/src/inventory/index.ts`

- [ ] **Step 1: ຂຽນ test**

`apps/api/test/expire-reservations.test.ts`:

```ts
import {
  type PrismaClient,
  createPrismaClient,
  expireOrder,
  findExpiredOrderIds,
  receive,
  reserveMany,
  runExpireReservations,
} from "@oca/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedCatalog } from "./helpers";

describe("expire reservations (Postgres ຈິງ)", () => {
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let seq = 0;
  const NOW = new Date("2026-10-10T12:00:00.000Z");
  const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

  async function level() {
    const row = await db.stockLevel.findUniqueOrThrow({
      where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } },
    });
    return { onHand: row.onHand, reserved: row.reserved };
  }

  /** ສ້າງບິນ + ຈອງສະຕ໋ອກຈິງດ້ວຍເຄື່ອງຈັກ. */
  async function pendingOrder(options: { reservedUntil: Date; quantity?: number; status?: "PENDING_PAYMENT" | "PAID" }) {
    const quantity = options.quantity ?? 1;
    seq += 1;
    const order = await db.order.create({
      data: {
        orderNumber: `SO-T${seq}`,
        channel: "OFFLINE",
        source: "MANUAL",
        status: options.status ?? "PENDING_PAYMENT",
        currency: "LAK",
        subtotal: "100.00",
        vatRate: "10",
        vatAmount: "9.09",
        total: "100.00",
        reservedUntil: options.reservedUntil,
        items: {
          create: [
            {
              variantId: f.v1.id,
              warehouseId: f.whA.id,
              productName: "Product",
              sku: "SKU-1",
              unitPrice: "100.00",
              unitCost: "60.00",
              quantity,
              lineTotal: "100.00",
            },
          ],
        },
      },
    });
    await db.$transaction((tx) =>
      reserveMany(tx, [{ variantId: f.v1.id, warehouseId: f.whA.id, quantity }], { orderId: order.id }),
    );
    return order;
  }

  beforeAll(() => {
    db = createPrismaClient(process.env.DATABASE_URL);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(db);
    f = await seedCatalog(db);
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 100 }));
  });

  it("expireOrder: ບິນໝົດເວລາ → EXPIRED ແລະ ຄືນສະຕ໋ອກ ພ້ອມ movement RELEASE ຜູກ orderId", async () => {
    const order = await pendingOrder({ reservedUntil: minutes(-1), quantity: 3 });
    expect(await level()).toEqual({ onHand: 100, reserved: 3 });

    expect(await expireOrder(db, order.id, NOW)).toBe(true);

    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("EXPIRED");
    expect(await level()).toEqual({ onHand: 100, reserved: 0 });
    const release = await db.stockMovement.findFirstOrThrow({ where: { orderId: order.id, type: "RELEASE" } });
    expect(release).toMatchObject({ quantity: 3, actorId: null });
  });

  it("expireOrder: ເອີ້ນຊ້ຳ ຫຼື ບິນຍັງບໍ່ໝົດເວລາ ຫຼື ບິນ PAID → false ແລະ ບໍ່ແຕະສະຕ໋ອກ", async () => {
    const expired = await pendingOrder({ reservedUntil: minutes(-1) });
    const fresh = await pendingOrder({ reservedUntil: minutes(30) });
    const paid = await pendingOrder({ reservedUntil: minutes(-5), status: "PAID" });

    expect(await expireOrder(db, expired.id, NOW)).toBe(true);
    expect(await expireOrder(db, expired.id, NOW)).toBe(false);
    expect(await expireOrder(db, fresh.id, NOW)).toBe(false);
    expect(await expireOrder(db, paid.id, NOW)).toBe(false);
    expect(await level()).toEqual({ onHand: 100, reserved: 2 }); // fresh + paid ຍັງຈອງຢູ່
  });

  it("expireOrder ພ້ອມກັນຫຼາຍຄັ້ງ → ຄືນສະຕ໋ອກຄັ້ງດຽວ (ບໍ່ຕິດລົບ)", async () => {
    const order = await pendingOrder({ reservedUntil: minutes(-1), quantity: 4 });
    const results = await Promise.all(Array.from({ length: 10 }, () => expireOrder(db, order.id, NOW)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await level()).toEqual({ onHand: 100, reserved: 0 });
    expect(await db.stockMovement.count({ where: { orderId: order.id, type: "RELEASE" } })).toBe(1);
  });

  it("findExpiredOrderIds: ສະເພາະ PENDING_PAYMENT ທີ່ໝົດເວລາ, ເກົ່າສຸດກ່ອນ, ເຄົາລົບ limit ແລະ excludeIds", async () => {
    const oldest = await pendingOrder({ reservedUntil: minutes(-30) });
    const older = await pendingOrder({ reservedUntil: minutes(-10) });
    await pendingOrder({ reservedUntil: minutes(10) });
    await pendingOrder({ reservedUntil: minutes(-20), status: "PAID" });

    expect(await findExpiredOrderIds(db, NOW, 10)).toEqual([oldest.id, older.id]);
    expect(await findExpiredOrderIds(db, NOW, 1)).toEqual([oldest.id]);
    expect(await findExpiredOrderIds(db, NOW, 10, [oldest.id])).toEqual([older.id]);
  });

  it("runExpireReservations: ລ້າງຫຼາຍບິນ, ວົນຫຼາຍຮອບເມື່ອເກີນ limit", async () => {
    for (let i = 0; i < 5; i += 1) await pendingOrder({ reservedUntil: minutes(-1 - i) });
    await pendingOrder({ reservedUntil: minutes(30) });

    const result = await runExpireReservations(db, { now: NOW, limit: 2 });

    expect(result).toEqual({ expired: 5, skipped: 0, failed: 0 });
    expect(await level()).toEqual({ onHand: 100, reserved: 1 });
    expect(await db.order.count({ where: { status: "EXPIRED" } })).toBe(5);
  });

  it("runExpireReservations: ບິນໜຶ່ງ throw ບໍ່ຢຸດບິນອື່ນ, ນັບ failed, ເອີ້ນ onError, ບໍ່ວົນຊ້ຳບິນທີ່ພັງ", async () => {
    const bad = await pendingOrder({ reservedUntil: minutes(-3) });
    const good = await pendingOrder({ reservedUntil: minutes(-2) });
    const errors: string[] = [];
    let badAttempts = 0;

    const result = await runExpireReservations(db, {
      now: NOW,
      limit: 1,
      onError: (orderId) => errors.push(orderId),
      expire: async (client, orderId, now) => {
        if (orderId === bad.id) {
          badAttempts += 1;
          throw new Error("boom");
        }
        return expireOrder(client, orderId, now);
      },
    });

    expect(result).toEqual({ expired: 1, skipped: 0, failed: 1 });
    expect(errors).toEqual([bad.id]);
    expect(badAttempts).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: good.id } })).status).toBe("EXPIRED");
    expect((await db.order.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("runExpireReservations: ບິນທີ່ expire() ຄືນ false (ຖືກ cancel ກ່ອນ) ນັບເປັນ skipped", async () => {
    const order = await pendingOrder({ reservedUntil: minutes(-1) });
    const result = await runExpireReservations(db, {
      now: NOW,
      expire: async () => false,
    });
    expect(result).toEqual({ expired: 0, skipped: 1, failed: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
  });
});
```

- [ ] **Step 2: ຮັນ → fail**

Run: `pnpm --filter @oca/api test -- expire-reservations`
Expected: FAIL (`expireOrder` ບໍ່ຖືກ export).

- [ ] **Step 3: ຂຽນ `expire-reservations.ts`**

```ts
import type { PrismaClient } from "../generated/client";
import { releaseMany } from "./stock-engine";

/**
 * ປ່ຽນບິນ PENDING_PAYMENT ທີ່ເກີນ reservedUntil ເປັນ EXPIRED ແລະ ຄືນສະຕ໋ອກທີ່ຈອງ ໃນ transaction ດຽວ.
 * guard ໃນ WHERE (status + reservedUntil) ເຮັດໃຫ້ cancel / pay / expire ທີ່ແຂ່ງກັນ ມີຜູ້ຊະນະຄົນດຽວ:
 * ຜູ້ແພ້ໄດ້ 0 ແຖວ ແລະ ບໍ່ຄືນສະຕ໋ອກຊ້ຳ. ຄືນ true ຖ້າບິນນີ້ຖືກ expire ໂດຍການເອີ້ນນີ້.
 */
export async function expireOrder(db: PrismaClient, orderId: string, now: Date = new Date()): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING_PAYMENT", reservedUntil: { lt: now } },
      data: { status: "EXPIRED" },
    });
    if (count === 0) return false;

    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { variantId: true, warehouseId: true, quantity: true },
    });
    await releaseMany(tx, items, { orderId });
    return true;
  });
}

/** ບິນທີ່ໝົດເວລາແລ້ວ ເກົ່າສຸດກ່ອນ (ໃຊ້ index (status, reservedUntil)). */
export async function findExpiredOrderIds(
  db: PrismaClient,
  now: Date,
  limit: number,
  excludeIds: readonly string[] = [],
): Promise<string[]> {
  const rows = await db.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      reservedUntil: { lt: now },
      ...(excludeIds.length > 0 ? { id: { notIn: [...excludeIds] } } : {}),
    },
    orderBy: { reservedUntil: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export interface ExpireReservationsOptions {
  now?: Date;
  /** ຈຳນວນບິນຕໍ່ຮອບ */
  limit?: number;
  /** ຈຳນວນຮອບສູງສຸດຕໍ່ການເອີ້ນ 1 ຄັ້ງ */
  maxRounds?: number;
  onError?: (orderId: string, error: unknown) => void;
  /** ໃຊ້ແທນ expireOrder (ສຳລັບ test) */
  expire?: (db: PrismaClient, orderId: string, now: Date) => Promise<boolean>;
}

export interface ExpireReservationsResult {
  expired: number;
  skipped: number;
  failed: number;
}

/**
 * ລ້າງບິນທີ່ໝົດເວລາທັງໝົດ (ສູງສຸດ maxRounds x limit ບິນ). ບິນໜຶ່ງ throw → ບັນທຶກ ແລະ ຂ້າມ
 * (ບໍ່ລອງຊ້ຳໃນການເອີ້ນນີ້) ເພື່ອບໍ່ໃຫ້ບິນທີ່ພັງຂັດຂວາງບິນອື່ນ.
 */
export async function runExpireReservations(
  db: PrismaClient,
  options: ExpireReservationsOptions = {},
): Promise<ExpireReservationsResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;
  const maxRounds = options.maxRounds ?? 10;
  const expire = options.expire ?? expireOrder;

  const result: ExpireReservationsResult = { expired: 0, skipped: 0, failed: 0 };
  const failedIds: string[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const ids = await findExpiredOrderIds(db, now, limit, failedIds);
    if (ids.length === 0) break;

    for (const id of ids) {
      try {
        if (await expire(db, id, now)) result.expired += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        failedIds.push(id);
        options.onError?.(id, error);
      }
    }
    if (ids.length < limit) break;
  }
  return result;
}
```

> ໝາຍເຫດ: ບິນທີ່ `expire()` ຄືນ `false` (ຖືກ cancel/pay ກ່ອນ) ຈະບໍ່ຢູ່ໃນຜົນ `findExpiredOrderIds` ຮອບຕໍ່ໄປ (status ປ່ຽນແລ້ວ) ຈຶ່ງບໍ່ວົນຊ້ຳ. ໃນ test ທີ່ inject `expire: async () => false` ບິນຍັງເປັນ PENDING_PAYMENT ແຕ່ `ids.length < limit` ຈຶ່ງອອກຈາກ loop ໃນຮອບດຽວ.

- [ ] **Step 4: Export, build, ຮັນ test**

ໃນ `packages/database/src/inventory/index.ts` ເພີ່ມ `export * from "./expire-reservations";`

Run:
```bash
pnpm --filter @oca/database build
pnpm --filter @oca/api test -- expire-reservations
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/inventory apps/api/test/expire-reservations.test.ts
git commit -m "feat(db): release stock when reservations expire

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ກວດທັງ repo

- [ ] **Step 1: Lint + build + test ທັງໝົດ**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: ທຸກ package ຜ່ານ. ຈຳນວນ test ເພີ່ມຂຶ້ນຈາກ baseline (shared 12, database 12, worker 11, api 84+): shared +~40, database +9, api +24.

- [ ] **Step 2: ກວດ `git status` ສະອາດ ແລະ log**

Run: `git status --short && git log --oneline -8`
Expected: working tree ສະອາດ; 7 commit ຂອງ plan ນີ້ຢູ່ເທິງ commit spec.

- [ ] **Step 3: ອັບເດດ memory ຄວາມຄືບໜ້າ**

ອັບເດດ `/Users/ta/.claude/projects/-Users-ta-oca/memory/phase0-progress.md` ຫຼືສ້າງ `phase1-progress.md` ບອກວ່າ: branch `phase1-inventory`, spec ແລະ plan 1a-1 ສຳເລັດ, ຕໍ່ໄປ 1a-2 (API), 1a-3 (worker), 1a-ui; ແລະເພີ່ມບັນທັດຊີ້ໃນ `MEMORY.md`.
