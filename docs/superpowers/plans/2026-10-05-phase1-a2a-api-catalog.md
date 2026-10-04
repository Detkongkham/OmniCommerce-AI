# Phase 1-A2a: Inventory API, Catalog (settings, warehouses, categories, products) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** REST API ຂອງສ່ວນ catalog ໃນ `InventoryModule`: ການຕັ້ງຄ່າຮ້ານ, ສາງ, ໝວດໝູ່, ສິນຄ້າ (options + variants + ຮູບ URL) ພ້ອມສິດ `inventory:read/write`, AuditLog ແລະ e2e test ກັບ Postgres ຈິງ.

**Architecture:** ແຕ່ລະຫົວຂໍ້ = `*.service.ts` + `*.controller.ts` ໃນ `apps/api/src/modules/inventory/` (ຮູບແບບດຽວກັບ `modules/staff`). Validation ດ້ວຍ `ZodValidationPipe` + schema ຈາກ `@oca/shared` (ສ້າງໃນ 1a-1). Service ຮັບ `actor` ແລະ `ip` ແລ້ວເອີ້ນ `AuditService.record`. ເງິນໃນ response ເປັນ string 2 ທົດສະນິຍົມ.

**Tech Stack:** NestJS 11, Prisma 7, Zod 4, Vitest + supertest (e2e).

**ອ້າງອີງ spec:** [2026-10-04-phase1-a-inventory-design.md](../specs/2026-10-04-phase1-a-inventory-design.md) §5, §6, §9. **ຕ້ອງເຮັດ plan [1a-1](2026-10-05-phase1-a1-engine.md) ໃຫ້ສຳເລັດກ່ອນ.** ແຜນຕໍ່ໄປ: **1a-2b** (ສະຕ໋ອກ + ຄຳສັ່ງຊື້).

## ຂໍ້ຕົກລົງສຳຄັນ (ອ່ານກ່ອນເລີ່ມ)

* **ທຸກ constructor ໃຊ້ `@Inject(Token)` ຢ່າງຊັດເຈນ** (vitest ບໍ່ emit decorator metadata) — ເບິ່ງ `staff.service.ts`.
* **Guard ເປັນ global** (`JwtAuthGuard`, `PermissionsGuard` ລົງທະບຽນຜ່ານ `AuthModule` ເປັນ `APP_GUARD`). Controller ໃສ່ແຕ່ `@RequirePermissions("inventory:read" | "inventory:write")`.
* **ຫຼັງແກ້ `@oca/shared` / `@oca/database` ຕ້ອງ build ກ່ອນ test ຂອງ api:** `pnpm --filter @oca/shared build && pnpm --filter @oca/database build`.
* **ເງິນ:** DTO ໃຊ້ `money(decimal)` → `"12500.00"`; ຫ້າມ `Number(decimal)` ກັບລາຄາ/ຕົ້ນທຶນ.
* **Error:** ຊ້ຳ unique → `ConflictException` (409); ບໍ່ພົບ → `NotFoundException`; ຂໍ້ມູນອ້າງອີງບໍ່ມີ (ເຊັ່ນ `categoryId`) → `BadRequestException`; ຖືກອ້າງອີງຢູ່ ລຶບບໍ່ໄດ້ → 409.
* **Audit:** ຂຽນຫຼັງ mutation ສຳເລັດ (ຄືກັບ `StaffService`), `entity` = ຊື່ model, snapshot ເປັນ JSON ທີ່ບໍ່ມີ `Date`/`Decimal` (ໃຊ້ string).
* ຫ້າມແຕະ Postgres 5432 ຂອງຜູ້ໃຊ້ (ເບິ່ງ plan 1a-1).

---

## File Structure

```
apps/api/src/
├── common/
│   ├── prisma-errors.ts (+test)        ຍ້າຍມາຈາກ staff.service.ts
│   ├── pagination.ts (+test)
│   ├── money.ts (+test)
│   └── unique-slug.ts (+test)
└── modules/
    ├── staff/staff.service.ts          (ແກ້: re-export ຈາກ common/prisma-errors)
    └── inventory/
        ├── inventory.module.ts         (ແກ້ທຸກ task)
        ├── insufficient-stock.filter.ts
        ├── store-settings.service.ts / .controller.ts
        ├── warehouses.service.ts / .controller.ts
        ├── categories.service.ts / .controller.ts
        ├── products.mapper.ts
        └── products.service.ts / .controller.ts
apps/api/test/
├── helpers.ts                          (ແກ້: seedInventoryUsers, bearerFor)
├── store-settings.e2e.test.ts
├── warehouses.e2e.test.ts
├── categories.e2e.test.ts
└── products.e2e.test.ts
```

---

### Task 1: Helpers ກາງ (TDD)

**Files:**
- Create: `apps/api/src/common/prisma-errors.ts`, `pagination.ts`, `money.ts`, `unique-slug.ts` ແລະ `*.test.ts` ຂອງແຕ່ລະອັນ
- Modify: `apps/api/src/modules/staff/staff.service.ts`

- [ ] **Step 1: ຂຽນ test ທັງ 4 ໄຟລ໌**

`apps/api/src/common/pagination.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pageArgs, toPage } from "./pagination";

describe("pagination", () => {
  it("pageArgs ຄຳນວນ skip/take", () => {
    expect(pageArgs(1, 20)).toEqual({ skip: 0, take: 20 });
    expect(pageArgs(3, 50)).toEqual({ skip: 100, take: 50 });
  });
  it("toPage ຫໍ່ຜົນລັບ", () => {
    expect(toPage(["a"], 7, 2, 5)).toEqual({ items: ["a"], total: 7, page: 2, pageSize: 5 });
  });
});
```

`apps/api/src/common/money.test.ts`:

```ts
import { Prisma } from "@oca/database";
import { describe, expect, it } from "vitest";
import { money, moneyOrNull } from "./money";

describe("money", () => {
  it("ສະແດງ 2 ທົດສະນິຍົມສະເໝີ", () => {
    expect(money(new Prisma.Decimal("12500"))).toBe("12500.00");
    expect(money(new Prisma.Decimal("0.5"))).toBe("0.50");
  });
  it("moneyOrNull ຮັບ null", () => {
    expect(moneyOrNull(null)).toBeNull();
    expect(moneyOrNull(new Prisma.Decimal("1"))).toBe("1.00");
  });
});
```

`apps/api/src/common/unique-slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { uniqueSlug } from "./unique-slug";

describe("uniqueSlug", () => {
  it("ໃຊ້ slug ຈາກຊື່ຖ້າຍັງບໍ່ມີ", async () => {
    expect(await uniqueSlug("Black Shirt", "product", async () => false)).toBe("black-shirt");
  });
  it("ຊື່ລາວລ້ວນໃຊ້ fallback", async () => {
    expect(await uniqueSlug("ເສື້ອຍືດ", "product", async () => false)).toBe("product");
  });
  it("ຊ້ຳແລ້ວຕໍ່ -2, -3 ...", async () => {
    const taken = new Set(["black-shirt", "black-shirt-2"]);
    expect(await uniqueSlug("Black Shirt", "product", async (slug) => taken.has(slug))).toBe("black-shirt-3");
  });
  it("ຊ້ຳຫຼາຍເກີນໄປໃຊ້ suffix ສຸ່ມ", async () => {
    const slug = await uniqueSlug("a", "product", async (candidate) => candidate === "a" || /-\d+$/.test(candidate));
    expect(slug).toMatch(/^a-[0-9a-f]{8}$/);
  });
});
```

`apps/api/src/common/prisma-errors.test.ts` (ຍ້າຍ test ເດີມຈາກ `roles.service.test.ts` ບໍ່ຕ້ອງ — ເພີ່ມ test ໃໝ່ຂອງໄຟລ໌ໃໝ່):

```ts
import { describe, expect, it } from "vitest";
import { isUniqueViolation, prismaErrorCode, uniqueViolationFields } from "./prisma-errors";

describe("prisma-errors", () => {
  it("prismaErrorCode / isUniqueViolation", () => {
    expect(prismaErrorCode({ code: "P2002" })).toBe("P2002");
    expect(prismaErrorCode(null)).toBeUndefined();
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "P2003" })).toBe(false);
  });
  it("uniqueViolationFields ອ່ານ meta.target", () => {
    expect(uniqueViolationFields({ code: "P2002", meta: { target: ["sku"] } })).toEqual(["sku"]);
    expect(uniqueViolationFields({ code: "P2003" })).toBeUndefined();
  });
});
```

- [ ] **Step 2: ຮັນ → fail**

Run: `pnpm --filter @oca/api test -- common/`
Expected: FAIL (modules ບໍ່ມີ).

- [ ] **Step 3: ຂຽນ implementation**

`apps/api/src/common/prisma-errors.ts` (ຍ້າຍເນື້ອຫາຈາກ `staff.service.ts` ບັນທັດ `prismaErrorCode`, `isUniqueViolation`, `UniqueMeta`, `uniqueViolationFields` ມາຢູ່ນີ້ ໂດຍບໍ່ປ່ຽນ logic):

```ts
export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return prismaErrorCode(error) === "P2002";
}

interface UniqueMeta {
  target?: unknown;
  driverAdapterError?: { cause?: { constraint?: { index?: unknown; fields?: unknown } } };
}

/**
 * Fields/constraint named by a P2002 error: `meta.target`, or (driver adapters) the constraint
 * in `meta.driverAdapterError.cause.constraint`. [] when unknown; undefined when not a P2002.
 */
export function uniqueViolationFields(error: unknown): string[] | undefined {
  if (!isUniqueViolation(error)) return undefined;
  const meta = (error as { meta?: UniqueMeta }).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  if (typeof constraint?.index === "string") return [constraint.index];
  if (Array.isArray(constraint?.fields)) return constraint.fields.map(String);
  return [];
}
```

ໃນ `apps/api/src/modules/staff/staff.service.ts`: **ລຶບ** ການນິຍາມ 4 ອັນຂ້າງເທິງ ແລ້ວເພີ່ມທີ່ຫົວໄຟລ໌ (ໃຕ້ imports ອື່ນ):

```ts
import { isUniqueViolation } from "../../common/prisma-errors";

// roles.service.ts ແລະ test ເດີມ import ຈາກໄຟລ໌ນີ້
export { isUniqueViolation, prismaErrorCode, uniqueViolationFields } from "../../common/prisma-errors";
```

`apps/api/src/common/pagination.ts`:

```ts
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, total, page, pageSize };
}
```

`apps/api/src/common/money.ts`:

```ts
interface DecimalLike {
  toFixed(decimalPlaces: number): string;
}

/** Prisma Decimal -> "12500.00" */
export const money = (value: DecimalLike): string => value.toFixed(2);

export const moneyOrNull = (value: DecimalLike | null): string | null => (value === null ? null : money(value));
```

`apps/api/src/common/unique-slug.ts`:

```ts
import { randomUUID } from "node:crypto";
import { slugify } from "@oca/shared";

/** slug ຈາກຊື່ ແລະ ຕໍ່ -2, -3 ... ຈົນບໍ່ຊ້ຳ; `fallback` ໃຊ້ເມື່ອຊື່ບໍ່ມີ a-z/0-9 (ເຊັ່ນ ຊື່ລາວລ້ວນ). */
export async function uniqueSlug(
  name: string,
  fallback: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name) || fallback;
  if (!(await exists(base))) return base;
  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${base.slice(0, 90)}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base.slice(0, 80)}-${randomUUID().slice(0, 8)}`;
}
```

- [ ] **Step 4: ຮັນ → pass (ຮວມ test ເດີມຂອງ staff/roles)**

Run: `pnpm --filter @oca/api test -- common/ staff roles`
Expected: PASS ທັງໝົດ.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common apps/api/src/modules/staff/staff.service.ts
git commit -m "refactor(api): extract prisma error helpers, add pagination/money/slug helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Test helpers, filter ສະຕ໋ອກບໍ່ພໍ, ການຕັ້ງຄ່າຮ້ານ (TDD e2e)

**Files:**
- Modify: `apps/api/test/helpers.ts`, `apps/api/src/modules/inventory/inventory.module.ts`
- Create: `apps/api/src/modules/inventory/insufficient-stock.filter.ts`, `store-settings.service.ts`, `store-settings.controller.ts`, `apps/api/test/store-settings.e2e.test.ts`

- [ ] **Step 1: ເພີ່ມ helper ຜູ້ໃຊ້ inventory**

ທ້າຍ `apps/api/test/helpers.ts` ເພີ່ມ:

```ts
/**
 * inv-write@test.local (inventory:read+write), inv-read@test.local (inventory:read),
 * noinv@test.local (staff:read ເທົ່ານັ້ນ). ຄວນເອີ້ນຫຼັງ resetDb.
 */
export async function seedInventoryUsers(db: PrismaClient) {
  const passwordHash = await hash(TEST_PASSWORD);
  const makeUser = async (email: string, roleName: string, permissions: string[]) => {
    const role = await db.role.create({
      data: { name: roleName, permissions: { create: permissions.map((permission) => ({ permission })) } },
    });
    return db.user.create({ data: { email, name: roleName, passwordHash, roleId: role.id } });
  };
  const writer = await makeUser("inv-write@test.local", "INV_WRITE", ["inventory:read", "inventory:write"]);
  const reader = await makeUser("inv-read@test.local", "INV_READ", ["inventory:read"]);
  const none = await makeUser("noinv@test.local", "NO_INV", ["staff:read"]);
  return { writer, reader, none };
}

/** { Authorization: "Bearer ..." } ຂອງຜູ້ໃຊ້ */
export async function bearerFor(app: INestApplication, email: string): Promise<{ Authorization: string }> {
  const { accessToken } = await loginAs(app, email);
  return { Authorization: `Bearer ${accessToken}` };
}
```

- [ ] **Step 2: ຂຽນ e2e test ຂອງການຕັ້ງຄ່າຮ້ານ**

`apps/api/test/store-settings.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedInventoryUsers } from "./helpers";

describe("store settings (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
  });

  it("ຕ້ອງ login; ບໍ່ມີ inventory:read → 403", async () => {
    await request(server()).get("/settings/store").expect(401);
    await request(server()).get("/settings/store").set(await bearerFor(app, "noinv@test.local")).expect(403);
  });

  it("GET ສ້າງແຖວເລີ່ມຕົ້ນຖ້າຍັງບໍ່ມີ (ບໍ່ຕ້ອງ seed)", async () => {
    const res = await request(server()).get("/settings/store").set(await bearerFor(app, "inv-read@test.local")).expect(200);
    expect(res.body).toEqual({
      name: "OCA Store",
      baseCurrency: "LAK",
      vatRate: 10,
      pricesIncludeVat: true,
      reservationMinutes: 30,
    });
    expect(await db.storeSetting.count()).toBe(1);
  });

  it("PATCH ແກ້ໄດ້ດ້ວຍ inventory:write ແລະ ຂຽນ audit; inventory:read ແກ້ບໍ່ໄດ້", async () => {
    const writer = await bearerFor(app, "inv-write@test.local");
    const res = await request(server())
      .patch("/settings/store")
      .set(writer)
      .send({ name: "ຮ້ານນ້ອງ", vatRate: 7, reservationMinutes: 45, pricesIncludeVat: false })
      .expect(200);
    expect(res.body).toMatchObject({ name: "ຮ້ານນ້ອງ", vatRate: 7, reservationMinutes: 45, pricesIncludeVat: false });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "settings.store.update" } });
    expect(audit.entity).toBe("StoreSetting");

    await request(server())
      .patch("/settings/store")
      .set(await bearerFor(app, "inv-read@test.local"))
      .send({ name: "x" })
      .expect(403);
  });

  it("PATCH: body ວ່າງ / ຄ່າຜິດ / baseCurrency → 400", async () => {
    const writer = await bearerFor(app, "inv-write@test.local");
    await request(server()).patch("/settings/store").set(writer).send({}).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ vatRate: 101 }).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ reservationMinutes: 0 }).expect(400);
    await request(server()).patch("/settings/store").set(writer).send({ baseCurrency: "USD" }).expect(400);
  });
});
```

- [ ] **Step 3: ຮັນ → fail**

Run: `pnpm --filter @oca/api test -- store-settings`
Expected: FAIL (404 ເພາະ route ຍັງບໍ່ມີ).

- [ ] **Step 4: ຂຽນ filter, service, controller, module**

`apps/api/src/modules/inventory/insufficient-stock.filter.ts`:

```ts
import { type ArgumentsHost, Catch, type ExceptionFilter, Inject } from "@nestjs/common";
import { InsufficientStockError, type PrismaClient } from "@oca/database";
import type { Response } from "express";
import { PRISMA } from "../../prisma/prisma.module";

/** InsufficientStockError -> 409 { message, shortages: [{ variantId, warehouseId, sku, requested, available }] } */
@Catch(InsufficientStockError)
export class InsufficientStockFilter implements ExceptionFilter<InsufficientStockError> {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async catch(error: InsufficientStockError, host: ArgumentsHost): Promise<void> {
    const variantIds = [...new Set(error.shortages.map((shortage) => shortage.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, sku: true },
    });
    const skuById = new Map(variants.map((variant) => [variant.id, variant.sku]));

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(409)
      .json({
        statusCode: 409,
        error: "Conflict",
        message: error.message,
        shortages: error.shortages.map((shortage) => ({ ...shortage, sku: skuById.get(shortage.variantId) ?? null })),
      });
  }
}
```

`apps/api/src/modules/inventory/store-settings.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { UpdateStoreSettingsInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { PRISMA } from "../../prisma/prisma.module";

export interface StoreSettingsDto {
  name: string;
  baseCurrency: string;
  vatRate: number;
  pricesIncludeVat: boolean;
  reservationMinutes: number;
}

type SettingsRow = Awaited<ReturnType<PrismaClient["storeSetting"]["upsert"]>>;

export function toStoreSettingsDto(row: SettingsRow): StoreSettingsDto {
  return {
    name: row.name,
    baseCurrency: row.baseCurrency,
    vatRate: Number(row.vatRate.toString()),
    pricesIncludeVat: row.pricesIncludeVat,
    reservationMinutes: row.reservationMinutes,
  };
}

@Injectable()
export class StoreSettingsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** ສ້າງແຖວເລີ່ມຕົ້ນຖ້າຍັງບໍ່ມີ (ກໍລະນີຍັງບໍ່ໄດ້ run seed). */
  async get(): Promise<StoreSettingsDto> {
    return toStoreSettingsDto(await this.ensure());
  }

  async update(input: UpdateStoreSettingsInput, actor: AuthUser, ip: string | undefined): Promise<StoreSettingsDto> {
    const before = await this.ensure();
    const after = await this.prisma.storeSetting.update({
      where: { id: 1 },
      data: {
        name: input.name,
        vatRate: input.vatRate === undefined ? undefined : input.vatRate.toFixed(2),
        pricesIncludeVat: input.pricesIncludeVat,
        reservationMinutes: input.reservationMinutes,
      },
    });
    await this.audit.record({
      userId: actor.id,
      action: "settings.store.update",
      entity: "StoreSetting",
      entityId: "1",
      before: { ...toStoreSettingsDto(before) },
      after: { ...toStoreSettingsDto(after) },
      ip,
    });
    return toStoreSettingsDto(after);
  }

  private ensure(): Promise<SettingsRow> {
    return this.prisma.storeSetting.upsert({
      where: { id: 1 },
      create: { id: 1, name: "OCA Store" },
      update: {},
    });
  }
}
```

`apps/api/src/modules/inventory/store-settings.controller.ts`:

```ts
import { Body, Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import { type UpdateStoreSettingsInput, updateStoreSettingsSchema } from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StoreSettingsService } from "./store-settings.service";

@Controller("settings/store")
export class StoreSettingsController {
  constructor(@Inject(StoreSettingsService) private readonly settings: StoreSettingsService) {}

  @Get()
  @RequirePermissions("inventory:read")
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermissions("inventory:write")
  update(
    @Body(new ZodValidationPipe(updateStoreSettingsSchema)) body: UpdateStoreSettingsInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.settings.update(body, actor, req.ip);
  }
}
```

ແທນ `apps/api/src/modules/inventory/inventory.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { InsufficientStockFilter } from "./insufficient-stock.filter";
import { StoreSettingsController } from "./store-settings.controller";
import { StoreSettingsService } from "./store-settings.service";

@Module({
  controllers: [StoreSettingsController],
  providers: [{ provide: APP_FILTER, useClass: InsufficientStockFilter }, StoreSettingsService],
})
export class InventoryModule {}
```

- [ ] **Step 5: ຮັນ → pass**

Run: `pnpm --filter @oca/api test -- store-settings`
Expected: PASS (4 tests). ຖ້າ `vatRate: 7` ຄືນເປັນ `7` ✓ (`Number("7")`).

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): add store settings endpoints and insufficient-stock filter

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ສາງ (TDD e2e)

**Files:**
- Create: `apps/api/src/modules/inventory/warehouses.service.ts`, `warehouses.controller.ts`, `apps/api/test/warehouses.e2e.test.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

- [ ] **Step 1: ຂຽນ e2e test**

`apps/api/test/warehouses.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";

describe("warehouses (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();
  let writer: { Authorization: string };
  let reader: { Authorization: string };

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  it("ສ້າງ + ລາຍການ (default ຂຶ້ນກ່ອນ) + ສິດ", async () => {
    await request(server()).get("/warehouses").expect(401);
    await request(server()).post("/warehouses").set(reader).send({ code: "VTE", name: "ວຽງຈັນ" }).expect(403);

    const created = await request(server())
      .post("/warehouses")
      .set(writer)
      .send({ code: "VTE", name: "ສາງວຽງຈັນ", address: "Vientiane" })
      .expect(201);
    expect(created.body).toMatchObject({ code: "VTE", name: "ສາງວຽງຈັນ", isDefault: false, isActive: true });

    await db.warehouse.create({ data: { code: "MAIN", name: "Main", isDefault: true } });
    const list = await request(server()).get("/warehouses").set(reader).expect(200);
    expect(list.body.map((w: { code: string }) => w.code)).toEqual(["MAIN", "VTE"]);
    expect(await db.auditLog.count({ where: { action: "warehouse.create" } })).toBe(1);
  });

  it("code ຊ້ຳ → 409; code ຜິດຮູບແບບ → 400", async () => {
    const body = { code: "DUP", name: "x" };
    await request(server()).post("/warehouses").set(writer).send(body).expect(201);
    await request(server()).post("/warehouses").set(writer).send(body).expect(409);
    await request(server()).post("/warehouses").set(writer).send({ code: "lower", name: "x" }).expect(400);
  });

  it("PATCH ແກ້ຊື່ ແລະ ທີ່ຢູ່; ບໍ່ມີ id → 404", async () => {
    const { whB } = await seedCatalog(db);
    const res = await request(server())
      .patch(`/warehouses/${whB.id}`)
      .set(writer)
      .send({ name: "ຊື່ໃໝ່", address: null })
      .expect(200);
    expect(res.body).toMatchObject({ name: "ຊື່ໃໝ່", address: null });
    await request(server()).patch("/warehouses/nope").set(writer).send({ name: "x" }).expect(404);
  });

  it("POST /:id/default ປ່ຽນ default ຄັ້ງດຽວ ແລະ ບໍ່ເຮັດໃຫ້ມີສອງອັນ", async () => {
    const { whA, whB } = await seedCatalog(db);
    const res = await request(server()).post(`/warehouses/${whB.id}/default`).set(writer).expect(200);
    expect(res.body.isDefault).toBe(true);
    expect(await db.warehouse.findMany({ where: { isDefault: true }, select: { id: true } })).toEqual([{ id: whB.id }]);
    expect((await db.warehouse.findUniqueOrThrow({ where: { id: whA.id } })).isDefault).toBe(false);
  });

  it("ຕັ້ງສາງທີ່ປິດແລ້ວເປັນ default → 409", async () => {
    const { whB } = await seedCatalog(db);
    await db.warehouse.update({ where: { id: whB.id }, data: { isActive: false } });
    await request(server()).post(`/warehouses/${whB.id}/default`).set(writer).expect(409);
  });

  it("ປິດສາງ: ສາງ default → 409; ສາງທີ່ມີສະຕ໋ອກ → 409; ສາງວ່າງ → ສຳເລັດ", async () => {
    const { whA, whB, v1 } = await seedCatalog(db);
    await request(server()).patch(`/warehouses/${whA.id}`).set(writer).send({ isActive: false }).expect(409);

    await db.stockLevel.create({ data: { variantId: v1.id, warehouseId: whB.id, onHand: 2, reserved: 0 } });
    await request(server()).patch(`/warehouses/${whB.id}`).set(writer).send({ isActive: false }).expect(409);

    await db.stockLevel.deleteMany();
    const res = await request(server()).patch(`/warehouses/${whB.id}`).set(writer).send({ isActive: false }).expect(200);
    expect(res.body.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: ຮັນ → fail** (`pnpm --filter @oca/api test -- warehouses` → 404 ທຸກ route)

- [ ] **Step 3: ຂຽນ service**

`apps/api/src/modules/inventory/warehouses.service.ts`:

```ts
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

type WarehouseRow = Awaited<ReturnType<PrismaClient["warehouse"]["findUniqueOrThrow"]>>;

export function toWarehouseDto(row: WarehouseRow): WarehouseDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    isDefault: row.isDefault,
    isActive: row.isActive,
  };
}

@Injectable()
export class WarehousesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<WarehouseDto[]> {
    const rows = await this.prisma.warehouse.findMany({ orderBy: [{ isDefault: "desc" }, { code: "asc" }] });
    return rows.map(toWarehouseDto);
  }

  async create(input: CreateWarehouseInput, actor: AuthUser, ip: string | undefined): Promise<WarehouseDto> {
    try {
      const row = await this.prisma.warehouse.create({
        data: { code: input.code, name: input.name, address: input.address, isActive: input.isActive },
      });
      await this.record(actor, "warehouse.create", row.id, null, row, ip);
      return toWarehouseDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Warehouse code already in use");
      throw error;
    }
  }

  async update(id: string, input: UpdateWarehouseInput, actor: AuthUser, ip: string | undefined): Promise<WarehouseDto> {
    const before = await this.require(id);
    if (input.isActive === false && before.isActive) {
      if (before.isDefault) throw new ConflictException("Cannot deactivate the default warehouse");
      const stocked = await this.prisma.stockLevel.findFirst({
        where: { warehouseId: id, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] },
        select: { id: true },
      });
      if (stocked) throw new ConflictException("Cannot deactivate a warehouse that still holds stock");
    }
    try {
      const after = await this.prisma.warehouse.update({
        where: { id },
        data: { code: input.code, name: input.name, address: input.address, isActive: input.isActive },
      });
      await this.record(actor, "warehouse.update", id, before, after, ip);
      return toWarehouseDto(after);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Warehouse code already in use");
      throw error;
    }
  }

  async setDefault(id: string, actor: AuthUser, ip: string | undefined): Promise<WarehouseDto> {
    const before = await this.require(id);
    if (!before.isActive) throw new ConflictException("Cannot make an inactive warehouse the default");
    try {
      const after = await this.prisma.$transaction(async (tx) => {
        await tx.warehouse.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
        return tx.warehouse.update({ where: { id }, data: { isDefault: true } });
      });
      await this.record(actor, "warehouse.setDefault", id, before, after, ip);
      return toWarehouseDto(after);
    } catch (error) {
      // ສອງຄໍາຂໍຕັ້ງ default ພ້ອມກັນ: partial unique index ກັນໄວ້ ຜູ້ແພ້ໄດ້ 409
      if (isUniqueViolation(error)) throw new ConflictException("Default warehouse changed concurrently, retry");
      throw error;
    }
  }

  private async require(id: string): Promise<WarehouseRow> {
    const row = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Warehouse not found");
    return row;
  }

  private record(actor: AuthUser, action: string, id: string, before: WarehouseRow | null, after: WarehouseRow, ip: string | undefined) {
    return this.audit.record({
      userId: actor.id,
      action,
      entity: "Warehouse",
      entityId: id,
      before: before ? { ...toWarehouseDto(before) } : undefined,
      after: { ...toWarehouseDto(after) },
      ip,
    });
  }
}
```

`apps/api/src/modules/inventory/warehouses.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import {
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
  createWarehouseSchema,
  updateWarehouseSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { WarehousesService } from "./warehouses.service";

@Controller("warehouses")
export class WarehousesController {
  constructor(@Inject(WarehousesService) private readonly warehouses: WarehousesService) {}

  @Get()
  @RequirePermissions("inventory:read")
  list() {
    return this.warehouses.list();
  }

  @Post()
  @RequirePermissions("inventory:write")
  create(
    @Body(new ZodValidationPipe(createWarehouseSchema)) body: CreateWarehouseInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.warehouses.create(body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("inventory:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) body: UpdateWarehouseInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.warehouses.update(id, body, actor, req.ip);
  }

  @Post(":id/default")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  setDefault(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.warehouses.setDefault(id, actor, req.ip);
  }
}
```

ແກ້ `inventory.module.ts`: ເພີ່ມ `WarehousesController` ໃນ `controllers` ແລະ `WarehousesService` ໃນ `providers` (ພ້ອມ import).

- [ ] **Step 4: ຮັນ → pass; commit**

Run: `pnpm --filter @oca/api test -- warehouses`
Expected: PASS (6 tests).

```bash
git add apps/api
git commit -m "feat(api): add warehouses endpoints

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ໝວດໝູ່ (TDD e2e)

**Files:**
- Create: `apps/api/src/modules/inventory/categories.service.ts`, `categories.controller.ts`, `apps/api/test/categories.e2e.test.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

- [ ] **Step 1: ຂຽນ e2e test**

`apps/api/test/categories.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedInventoryUsers } from "./helpers";

describe("categories (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();
  let writer: { Authorization: string };
  let reader: { Authorization: string };
  const create = (body: object) => request(server()).post("/categories").set(writer).send(body);

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  it("ສ້າງ: slug ຈາກຊື່ ອັດຕະໂນມັດ, ຊ້ຳແລ້ວຕໍ່ -2; ຊື່ລາວໃຊ້ fallback", async () => {
    const a = await create({ name: "Shirts" }).expect(201);
    const b = await create({ name: "Shirts" }).expect(201);
    const c = await create({ name: "ເສື້ອຜ້າ" }).expect(201);
    expect(a.body.slug).toBe("shirts");
    expect(b.body.slug).toBe("shirts-2");
    expect(c.body.slug).toBe("category");
  });

  it("slug ທີ່ລະບຸເອງແລະຊ້ຳ → 409; ຮູບແບບຜິດ → 400; ສິດ → 401/403", async () => {
    await create({ name: "A", slug: "same" }).expect(201);
    await create({ name: "B", slug: "same" }).expect(409);
    await create({ name: "B", slug: "Bad Slug" }).expect(400);
    await request(server()).get("/categories").expect(401);
    await request(server()).post("/categories").set(reader).send({ name: "x" }).expect(403);
  });

  it("parentId ທີ່ບໍ່ມີ → 400; ລາຍການມີ productCount ແລະ ຮຽງຕາມ position", async () => {
    await create({ name: "X", parentId: "missing" }).expect(400);
    const root = await create({ name: "Root", position: 2 }).expect(201);
    await create({ name: "First", position: 1 }).expect(201);
    await db.product.create({ data: { name: "P", slug: "p", categoryId: root.body.id } });

    const list = await request(server()).get("/categories").set(reader).expect(200);
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["First", "Root"]);
    expect(list.body[1]).toMatchObject({ name: "Root", productCount: 1, parentId: null });
  });

  it("PATCH: ແກ້ຊື່; ຕັ້ງເປັນລູກຂອງຕົວເອງ ຫຼື ລູກຫຼານ → 400; ບໍ່ມີ id → 404", async () => {
    const root = await create({ name: "Root" }).expect(201);
    const child = await create({ name: "Child", parentId: root.body.id }).expect(201);
    const grand = await create({ name: "Grand", parentId: child.body.id }).expect(201);

    const patch = (id: string, body: object) => request(server()).patch(`/categories/${id}`).set(writer).send(body);
    expect((await patch(root.body.id, { name: "Renamed" }).expect(200)).body.name).toBe("Renamed");
    await patch(root.body.id, { parentId: root.body.id }).expect(400);
    await patch(root.body.id, { parentId: grand.body.id }).expect(400);
    await patch(grand.body.id, { parentId: root.body.id }).expect(200);
    await patch("nope", { name: "x" }).expect(404);
  });

  it("DELETE: ມີສິນຄ້າ → 409; ບໍ່ມີ → 204 ແລະ ລູກຍ້າຍຂຶ້ນໄປຫາ parent ຂອງມັນ", async () => {
    const root = await create({ name: "Root" }).expect(201);
    const mid = await create({ name: "Mid", parentId: root.body.id }).expect(201);
    const leaf = await create({ name: "Leaf", parentId: mid.body.id }).expect(201);

    await db.product.create({ data: { name: "P", slug: "p", categoryId: mid.body.id } });
    await request(server()).delete(`/categories/${mid.body.id}`).set(writer).expect(409);

    await db.product.deleteMany();
    await request(server()).delete(`/categories/${mid.body.id}`).set(writer).expect(204);
    const moved = await db.category.findUniqueOrThrow({ where: { id: leaf.body.id } });
    expect(moved.parentId).toBe(root.body.id);
    expect(await db.auditLog.count({ where: { action: "category.delete" } })).toBe(1);
  });
});
```

- [ ] **Step 2: ຮັນ → fail**

- [ ] **Step 3: ຂຽນ service ແລະ controller**

`apps/api/src/modules/inventory/categories.service.ts`:

```ts
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { CreateCategoryInput, UpdateCategoryInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { isUniqueViolation } from "../../common/prisma-errors";
import { uniqueSlug } from "../../common/unique-slug";
import { PRISMA } from "../../prisma/prisma.module";

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  productCount: number;
}

type CategoryRow = Awaited<ReturnType<PrismaClient["category"]["findUniqueOrThrow"]>>;

const snapshot = (row: CategoryRow) => ({
  name: row.name,
  slug: row.slug,
  parentId: row.parentId,
  position: row.position,
});

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      position: row.position,
      productCount: row._count.products,
    }));
  }

  async create(input: CreateCategoryInput, actor: AuthUser, ip: string | undefined): Promise<CategoryDto> {
    if (input.parentId) await this.requireParent(input.parentId);
    const slug =
      input.slug ??
      (await uniqueSlug(input.name, "category", async (candidate) =>
        (await this.prisma.category.count({ where: { slug: candidate } })) > 0,
      ));
    try {
      const row = await this.prisma.category.create({
        data: { name: input.name, slug, parentId: input.parentId ?? null, position: input.position },
      });
      await this.audit.record({
        userId: actor.id,
        action: "category.create",
        entity: "Category",
        entityId: row.id,
        after: snapshot(row),
        ip,
      });
      return { ...snapshot(row), id: row.id, productCount: 0 };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Category slug already in use");
      throw error;
    }
  }

  async update(id: string, input: UpdateCategoryInput, actor: AuthUser, ip: string | undefined): Promise<CategoryDto> {
    const before = await this.require(id);
    if (input.parentId !== undefined && input.parentId !== null) {
      await this.requireParent(input.parentId);
      await this.assertNoCycle(id, input.parentId);
    }
    try {
      const after = await this.prisma.category.update({
        where: { id },
        data: { name: input.name, slug: input.slug, parentId: input.parentId, position: input.position },
        include: { _count: { select: { products: true } } },
      });
      await this.audit.record({
        userId: actor.id,
        action: "category.update",
        entity: "Category",
        entityId: id,
        before: snapshot(before),
        after: snapshot(after),
        ip,
      });
      return { ...snapshot(after), id, productCount: after._count.products };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Category slug already in use");
      throw error;
    }
  }

  async remove(id: string, actor: AuthUser, ip: string | undefined): Promise<void> {
    const before = await this.require(id);
    if ((await this.prisma.product.count({ where: { categoryId: id } })) > 0) {
      throw new ConflictException("Category still has products");
    }
    await this.prisma.$transaction(async (tx) => {
      // ລູກຍ້າຍຂຶ້ນໄປຫາ parent ຂອງໝວດທີ່ລຶບ (ບໍ່ແມ່ນຫຼຸດໄປ root)
      await tx.category.updateMany({ where: { parentId: id }, data: { parentId: before.parentId } });
      await tx.category.delete({ where: { id } });
    });
    await this.audit.record({
      userId: actor.id,
      action: "category.delete",
      entity: "Category",
      entityId: id,
      before: snapshot(before),
      ip,
    });
  }

  private async require(id: string): Promise<CategoryRow> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Category not found");
    return row;
  }

  private async requireParent(parentId: string): Promise<void> {
    const parent = await this.prisma.category.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!parent) throw new BadRequestException("Parent category not found");
  }

  /** ຍ່າງຂຶ້ນຈາກ newParentId; ຖ້າພົບ id ຂອງໝວດທີ່ກຳລັງແກ້ = ວົນລູບ. */
  private async assertNoCycle(id: string, newParentId: string): Promise<void> {
    let cursor: string | null = newParentId;
    for (let depth = 0; cursor !== null && depth < 100; depth += 1) {
      if (cursor === id) throw new BadRequestException("A category cannot be its own ancestor");
      const row: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = row?.parentId ?? null;
    }
  }
}
```

`apps/api/src/modules/inventory/categories.controller.ts`:

```ts
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import {
  type CreateCategoryInput,
  type UpdateCategoryInput,
  createCategorySchema,
  updateCategorySchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CategoriesService } from "./categories.service";

@Controller("categories")
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions("inventory:read")
  list() {
    return this.categories.list();
  }

  @Post()
  @RequirePermissions("inventory:write")
  create(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.categories.create(body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("inventory:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.categories.update(id, body, actor, req.ip);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("inventory:write")
  async remove(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request): Promise<void> {
    await this.categories.remove(id, actor, req.ip);
  }
}
```

ເພີ່ມ `CategoriesController` / `CategoriesService` ໃນ `inventory.module.ts`.

- [ ] **Step 4: ຮັນ → pass; commit**

Run: `pnpm --filter @oca/api test -- categories`
Expected: PASS (5 tests).

```bash
git add apps/api
git commit -m "feat(api): add categories endpoints

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ສິນຄ້າ: mapper, ສ້າງ/ອ່ານ/ລາຍການ (TDD e2e)

**Files:**
- Create: `apps/api/src/modules/inventory/products.mapper.ts`, `products.service.ts`, `products.controller.ts`, `apps/api/test/products.e2e.test.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

ໃນ Task ນີ້ເຮັດ `list`, `get`, `create`. Task 6 ເຮັດ `update`, `remove`, variants, images (ຕໍ່ໃນ service/controller/test ໄຟລ໌ດຽວກັນ).

- [ ] **Step 1: ຂຽນ e2e test (ສ່ວນທີ 1)**

`apps/api/test/products.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedInventoryUsers } from "./helpers";

const cup = { name: "ແກ້ວນ້ຳ", variants: [{ sku: "CUP-1", price: "25000", costPrice: "10000.5" }] };

const shirt = {
  name: "Black Shirt",
  status: "ACTIVE",
  options: [
    { name: "ສີ", values: ["ດຳ", "ຂາວ"] },
    { name: "ໄຊສ໌", values: ["M", "L"] },
  ],
  variants: [
    { sku: "TS-BK-M", barcode: "885001", price: "100000", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } },
    { sku: "TS-BK-L", price: "100000", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "L" } },
    { sku: "TS-WH-M", price: "110000", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "M" } },
  ],
  images: [
    { url: "https://cdn.test/shirt-1.jpg", alt: "front" },
    { url: "https://cdn.test/shirt-bk.jpg", variantSku: "TS-BK-M" },
  ],
};

describe("products (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  const server = () => app.getHttpServer();
  let writer: { Authorization: string };
  let reader: { Authorization: string };
  const create = (body: object) => request(server()).post("/products").set(writer).send(body);

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedInventoryUsers(db);
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  describe("ສ້າງ ແລະ ອ່ານ", () => {
    it("ສິນຄ້າບໍ່ມີ option: DRAFT, 1 variant, ເງິນເປັນ string 2 ທົດສະນິຍົມ, slug fallback, audit", async () => {
      const res = await create(cup).expect(201);
      expect(res.body).toMatchObject({
        name: "ແກ້ວນ້ຳ",
        slug: "product",
        status: "DRAFT",
        categoryId: null,
        options: [],
      });
      expect(res.body.variants).toHaveLength(1);
      expect(res.body.variants[0]).toMatchObject({
        sku: "CUP-1",
        name: null,
        price: "25000.00",
        costPrice: "10000.50",
        compareAtPrice: null,
        isActive: true,
        optionValues: {},
        stock: [],
      });
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "product.create" } });
      expect(audit.entityId).toBe(res.body.id);
    });

    it("ສິນຄ້າທີ່ມີ options: ຊື່ variant 'ດຳ / M', ຮູບຜູກກັບ variant ຕາມ SKU, position ຕາມລຳດັບ", async () => {
      const res = await create(shirt).expect(201);
      expect(res.body.slug).toBe("black-shirt");
      expect(res.body.options.map((o: { name: string }) => o.name)).toEqual(["ສີ", "ໄຊສ໌"]);
      const names = res.body.variants.map((v: { name: string }) => v.name).sort();
      expect(names).toEqual(["ດຳ / L", "ດຳ / M", "ຂາວ / M"]);
      const black = res.body.variants.find((v: { sku: string }) => v.sku === "TS-BK-M");
      expect(black.optionValues).toEqual({ ສີ: "ດຳ", ໄຊສ໌: "M" });
      expect(res.body.images.map((i: { position: number }) => i.position)).toEqual([0, 1]);
      expect(res.body.images[1].variantId).toBe(black.id);
      expect(res.body.images[0].variantId).toBeNull();
    });

    it("GET /products/:id ຄືນຂໍ້ມູນເຕັມພ້ອມ stock ຕໍ່ສາງ; ບໍ່ມີ id → 404", async () => {
      const created = await create(cup).expect(201);
      const variantId = created.body.variants[0].id;
      const wh = await db.warehouse.create({ data: { code: "A", name: "A", isDefault: true } });
      await db.stockLevel.create({ data: { variantId, warehouseId: wh.id, onHand: 10, reserved: 3 } });

      const res = await request(server()).get(`/products/${created.body.id}`).set(reader).expect(200);
      expect(res.body.variants[0].stock).toEqual([{ warehouseId: wh.id, onHand: 10, reserved: 3, available: 7 }]);
      await request(server()).get("/products/nope").set(reader).expect(404);
    });

    it("SKU ຊ້ຳກັບສິນຄ້າອື່ນ → 409 ແລະ ບໍ່ມີສິນຄ້າຄ້າງ (rollback)", async () => {
      await create(cup).expect(201);
      await create({ name: "Other", variants: [{ sku: "CUP-1", price: "1" }] }).expect(409);
      expect(await db.product.count()).toBe(1);
    });

    it("category ທີ່ບໍ່ມີ → 400; body ຜິດ → 400 ພ້ອມ issues", async () => {
      await create({ ...cup, categoryId: "missing" }).expect(400);
      const res = await create({ name: "x", variants: [] }).expect(400);
      expect(res.body.issues.length).toBeGreaterThan(0);
    });

    it("ສິດ: ບໍ່ login 401, read-only ສ້າງບໍ່ໄດ້ 403, ບໍ່ມີ inventory:read ອ່ານບໍ່ໄດ້ 403", async () => {
      await request(server()).get("/products").expect(401);
      await request(server()).post("/products").set(reader).send(cup).expect(403);
      await request(server()).get("/products").set(await bearerFor(app, "noinv@test.local")).expect(403);
    });
  });

  describe("ລາຍການ", () => {
    beforeEach(async () => {
      const category = await db.category.create({ data: { name: "Tops", slug: "tops" } });
      await create({ ...shirt, categoryId: category.id }).expect(201);
      await create({ ...cup, status: "ARCHIVED" }).expect(201);
    });

    it("pagination + ສະຫຼຸບ: variantCount, ຊ່ວງລາຄາ, ຮູບທຳອິດ, ສະຕ໋ອກຂາຍໄດ້ລວມ", async () => {
      const shirtRow = await db.productVariant.findUniqueOrThrow({ where: { sku: "TS-BK-M" } });
      const wh = await db.warehouse.create({ data: { code: "A", name: "A", isDefault: true } });
      await db.stockLevel.create({ data: { variantId: shirtRow.id, warehouseId: wh.id, onHand: 10, reserved: 4 } });

      const res = await request(server()).get("/products?status=ACTIVE").set(reader).expect(200);
      expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
      expect(res.body.items[0]).toMatchObject({
        name: "Black Shirt",
        status: "ACTIVE",
        category: { name: "Tops" },
        imageUrl: "https://cdn.test/shirt-1.jpg",
        variantCount: 3,
        priceMin: "100000.00",
        priceMax: "110000.00",
        availableTotal: 6,
      });
    });

    it("ຄົ້ນຫາ q ດ້ວຍຊື່ / SKU / barcode (ບໍ່ສົນຕົວພິມ)", async () => {
      const search = async (q: string) =>
        (await request(server()).get("/products").query({ q }).set(reader).expect(200)).body.items.map(
          (p: { name: string }) => p.name,
        );
      expect(await search("black")).toEqual(["Black Shirt"]);
      expect(await search("ts-wh")).toEqual(["Black Shirt"]);
      expect(await search("885001")).toEqual(["Black Shirt"]);
      expect(await search("ແກ້ວ")).toEqual(["ແກ້ວນ້ຳ"]);
      expect(await search("nomatch")).toEqual([]);
    });

    it("filter ຕາມ categoryId ແລະ pageSize", async () => {
      const category = await db.category.findUniqueOrThrow({ where: { slug: "tops" } });
      const byCategory = await request(server()).get("/products").query({ categoryId: category.id }).set(reader).expect(200);
      expect(byCategory.body.total).toBe(1);
      const paged = await request(server()).get("/products?pageSize=1&page=2").set(reader).expect(200);
      expect(paged.body.items).toHaveLength(1);
      expect(paged.body.total).toBe(2);
      await request(server()).get("/products?pageSize=101").set(reader).expect(400);
    });
  });
});
```

- [ ] **Step 2: ຮັນ → fail** (`pnpm --filter @oca/api test -- products` → 404)

- [ ] **Step 3: ຂຽນ mapper**

`apps/api/src/modules/inventory/products.mapper.ts`:

```ts
import { Prisma } from "@oca/database";
import { money, moneyOrNull } from "../../common/money";

export const productDetailInclude = {
  options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } },
  variants: { orderBy: { createdAt: "asc" }, include: { optionValues: true, stockLevels: true } },
  images: { orderBy: { position: "asc" } },
} as const satisfies Prisma.ProductInclude;

export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

export const productListInclude = {
  category: { select: { id: true, name: true } },
  images: { orderBy: { position: "asc" }, take: 1 },
  variants: { select: { price: true, stockLevels: { select: { onHand: true, reserved: true } } } },
} as const satisfies Prisma.ProductInclude;

export type ProductListRow = Prisma.ProductGetPayload<{ include: typeof productListInclude }>;

export interface ProductListItemDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  category: { id: string; name: string } | null;
  imageUrl: string | null;
  variantCount: number;
  priceMin: string | null;
  priceMax: string | null;
  availableTotal: number;
}

export function toProductListItem(row: ProductListRow): ProductListItemDto {
  const prices = row.variants.map((variant) => variant.price);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    category: row.category,
    imageUrl: row.images[0]?.url ?? null,
    variantCount: row.variants.length,
    priceMin: prices.length > 0 ? money(Prisma.Decimal.min(...prices)) : null,
    priceMax: prices.length > 0 ? money(Prisma.Decimal.max(...prices)) : null,
    availableTotal: row.variants.reduce(
      (sum, variant) => sum + variant.stockLevels.reduce((inner, level) => inner + (level.onHand - level.reserved), 0),
      0,
    ),
  };
}

export interface VariantDto {
  id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  price: string;
  compareAtPrice: string | null;
  costPrice: string;
  weightGrams: number | null;
  isActive: boolean;
  optionValues: Record<string, string>;
  stock: { warehouseId: string; onHand: number; reserved: number; available: number }[];
}

export interface ProductDetailDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  categoryId: string | null;
  options: { id: string; name: string; position: number; values: { id: string; value: string; position: number }[] }[];
  variants: VariantDto[];
  images: { id: string; url: string; alt: string | null; position: number; variantId: string | null }[];
}

export function toProductDetail(row: ProductDetailRow): ProductDetailDto {
  const optionNameById = new Map(row.options.map((option) => [option.id, option.name]));
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    categoryId: row.categoryId,
    options: row.options.map((option) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      values: option.values.map((value) => ({ id: value.id, value: value.value, position: value.position })),
    })),
    variants: row.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      name: variant.name,
      price: money(variant.price),
      compareAtPrice: moneyOrNull(variant.compareAtPrice),
      costPrice: money(variant.costPrice),
      weightGrams: variant.weightGrams,
      isActive: variant.isActive,
      optionValues: Object.fromEntries(
        variant.optionValues.map((value) => [optionNameById.get(value.optionId) ?? value.optionId, value.value]),
      ),
      stock: variant.stockLevels.map((level) => ({
        warehouseId: level.warehouseId,
        onHand: level.onHand,
        reserved: level.reserved,
        available: level.onHand - level.reserved,
      })),
    })),
    images: row.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      position: image.position,
      variantId: image.variantId,
    })),
  };
}

/** snapshot ສຳລັບ AuditLog (ບໍ່ມີ Date/Decimal). */
export function productSnapshot(row: ProductDetailRow): Prisma.InputJsonObject {
  return {
    name: row.name,
    slug: row.slug,
    status: row.status,
    categoryId: row.categoryId,
    variantSkus: row.variants.map((variant) => variant.sku),
  };
}
```

- [ ] **Step 4: ຂຽນ service (list/get/create) ແລະ controller**

`apps/api/src/modules/inventory/products.service.ts`:

```ts
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@oca/database";
import { type CreateProductInput, type ProductListQuery, variantName } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { uniqueViolationFields } from "../../common/prisma-errors";
import { uniqueSlug } from "../../common/unique-slug";
import { PRISMA } from "../../prisma/prisma.module";
import {
  type ProductDetailDto,
  type ProductListItemDto,
  productDetailInclude,
  productListInclude,
  productSnapshot,
  toProductDetail,
  toProductListItem,
} from "./products.mapper";

export function duplicateError(error: unknown): ConflictException | undefined {
  const fields = uniqueViolationFields(error);
  if (!fields) return undefined;
  return new ConflictException(`Duplicate value: ${fields.join(", ") || "unique field"}`);
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: ProductListQuery): Promise<Page<ProductListItemDto>> {
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { variants: { some: { sku: { contains: query.q, mode: "insensitive" } } } },
              { variants: { some: { barcode: { contains: query.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productListInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.product.count({ where }),
    ]);
    return toPage(rows.map(toProductListItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<ProductDetailDto> {
    return toProductDetail(await this.requireDetail(id));
  }

  async create(input: CreateProductInput, actor: AuthUser, ip: string | undefined): Promise<ProductDetailDto> {
    if (input.categoryId) await this.requireCategory(input.categoryId);
    const slug =
      input.slug ??
      (await uniqueSlug(input.name, "product", async (candidate) =>
        (await this.prisma.product.count({ where: { slug: candidate } })) > 0,
      ));
    const optionNames = input.options.map((option) => option.name);

    let productId: string;
    try {
      productId = await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: input.name,
            slug,
            description: input.description,
            status: input.status,
            categoryId: input.categoryId ?? null,
            options: {
              create: input.options.map((option, optionIndex) => ({
                name: option.name,
                position: optionIndex,
                values: { create: option.values.map((value, valueIndex) => ({ value, position: valueIndex })) },
              })),
            },
          },
          include: { options: { include: { values: true } } },
        });

        // optionName -> value -> ProductOptionValue.id
        const valueIds = new Map(
          product.options.map((option) => [option.name, new Map(option.values.map((v) => [v.value, v.id]))] as const),
        );

        const skuToId = new Map<string, string>();
        for (const variant of input.variants) {
          const created = await tx.productVariant.create({
            data: {
              productId: product.id,
              sku: variant.sku,
              barcode: variant.barcode ?? null,
              name: variantName(optionNames, variant.optionValues),
              price: variant.price,
              compareAtPrice: variant.compareAtPrice ?? null,
              costPrice: variant.costPrice,
              weightGrams: variant.weightGrams ?? null,
              isActive: variant.isActive,
              optionValues: {
                connect: optionNames.map((name) => ({ id: valueIds.get(name)?.get(variant.optionValues[name] ?? "") ?? "" })),
              },
            },
          });
          skuToId.set(variant.sku, created.id);
        }

        if (input.images.length > 0) {
          await tx.productImage.createMany({
            data: input.images.map((image, position) => ({
              productId: product.id,
              url: image.url,
              alt: image.alt ?? null,
              position,
              variantId: image.variantSku ? (skuToId.get(image.variantSku) ?? null) : null,
            })),
          });
        }
        return product.id;
      });
    } catch (error) {
      throw duplicateError(error) ?? error;
    }

    const created = await this.requireDetail(productId);
    await this.audit.record({
      userId: actor.id,
      action: "product.create",
      entity: "Product",
      entityId: productId,
      after: productSnapshot(created),
      ip,
    });
    return toProductDetail(created);
  }

  // ----- helpers ທີ່ Task 6 ໃຊ້ຕໍ່ -----
  async requireDetail(id: string) {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productDetailInclude });
    if (!row) throw new NotFoundException("Product not found");
    return row;
  }

  async requireCategory(categoryId: string): Promise<void> {
    const found = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!found) throw new BadRequestException("Category not found");
  }
}
```

`apps/api/src/modules/inventory/products.controller.ts`:

```ts
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import {
  type CreateProductInput,
  type ProductListQuery,
  createProductSchema,
  productListQuerySchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ProductsService } from "./products.service";

@Controller()
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get("products")
  @RequirePermissions("inventory:read")
  list(@Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery) {
    return this.products.list(query);
  }

  @Get("products/:id")
  @RequirePermissions("inventory:read")
  get(@Param("id") id: string) {
    return this.products.get(id);
  }

  @Post("products")
  @RequirePermissions("inventory:write")
  create(
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.create(body, actor, req.ip);
  }
}
```

ເພີ່ມ `ProductsController` / `ProductsService` ໃນ `inventory.module.ts`.

- [ ] **Step 5: ຮັນ → pass**

Run: `pnpm --filter @oca/api test -- products`
Expected: PASS (9 tests). ຖ້າ `Prisma.Decimal.min` ບໍ່ມີໃນ type: ໃຊ້ `prices.reduce((a, b) => (a.lessThan(b) ? a : b))`.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): add product create/get/list endpoints

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ສິນຄ້າ: ແກ້ໄຂ, ລຶບ/archive, variants, ຮູບ (TDD e2e)

**Files:**
- Modify: `apps/api/src/modules/inventory/products.service.ts`, `products.controller.ts`, `apps/api/test/products.e2e.test.ts`

- [ ] **Step 1: ເພີ່ມ test**

ໃນ `apps/api/test/products.e2e.test.ts` ເພີ່ມ block ຕໍ່ທ້າຍ `describe("products (e2e)")` (ກ່ອນ `});` ສຸດທ້າຍ):

```ts
  describe("ແກ້ໄຂສິນຄ້າ", () => {
    it("PATCH ແກ້ຊື່/ສະຖານະ/ໝວດ/ລຶບ description (null); slug ຊ້ຳ 409; body ວ່າງ 400; ບໍ່ມີ id 404", async () => {
      const a = await create(cup).expect(201);
      const b = await create({ ...cup, name: "B", slug: "b-slug", variants: [{ sku: "B-1", price: "1" }] }).expect(201);
      const category = await db.category.create({ data: { name: "C", slug: "c" } });
      const patch = (id: string, body: object) => request(server()).patch(`/products/${id}`).set(writer).send(body);

      const res = await patch(a.body.id, { name: "ໃໝ່", status: "ACTIVE", categoryId: category.id, description: null }).expect(200);
      expect(res.body).toMatchObject({ name: "ໃໝ່", status: "ACTIVE", categoryId: category.id, description: null });
      await patch(a.body.id, { slug: "b-slug" }).expect(409);
      await patch(a.body.id, { categoryId: "missing" }).expect(400);
      await patch(a.body.id, {}).expect(400);
      await patch("nope", { name: "x" }).expect(404);
      expect(await db.auditLog.count({ where: { action: "product.update", entityId: a.body.id } })).toBe(1);
      expect(b.body.slug).toBe("b-slug");
    });
  });

  describe("ລຶບ / archive", () => {
    it("ບໍ່ເຄີຍຖືກຂາຍ ແລະ ບໍ່ມີ movement → ລຶບແທ້ 204 (variant/ຮູບຖືກລຶບຕາມ)", async () => {
      const p = await create(shirt).expect(201);
      await request(server()).delete(`/products/${p.body.id}`).set(writer).expect(204);
      expect(await db.product.count()).toBe(0);
      expect(await db.productVariant.count()).toBe(0);
      expect(await db.auditLog.count({ where: { action: "product.delete" } })).toBe(1);
    });

    it("ເຄີຍຖືກຂາຍ → ARCHIVED ແທນການລຶບ (200 { archived: true })", async () => {
      const p = await create(cup).expect(201);
      const variantId = p.body.variants[0].id;
      const wh = await db.warehouse.create({ data: { code: "A", name: "A", isDefault: true } });
      const order = await db.order.create({
        data: {
          orderNumber: "SO-X1",
          channel: "OFFLINE",
          source: "MANUAL",
          currency: "LAK",
          subtotal: "1",
          vatRate: "10",
          vatAmount: "0",
          total: "1",
          items: {
            create: [
              { variantId, warehouseId: wh.id, productName: "x", sku: "CUP-1", unitPrice: "1", unitCost: "0", quantity: 1, lineTotal: "1" },
            ],
          },
        },
      });
      expect(order.id).toBeTruthy();

      const res = await request(server()).delete(`/products/${p.body.id}`).set(writer).expect(200);
      expect(res.body).toEqual({ archived: true });
      expect((await db.product.findUniqueOrThrow({ where: { id: p.body.id } })).status).toBe("ARCHIVED");
      expect(await db.auditLog.count({ where: { action: "product.archive" } })).toBe(1);
    });

    it("ມີ StockMovement ແຕ່ບໍ່ເຄີຍຖືກຂາຍ → 409 (ໃຫ້ archive ດ້ວຍ PATCH status)", async () => {
      const p = await create(cup).expect(201);
      const wh = await db.warehouse.create({ data: { code: "A", name: "A", isDefault: true } });
      await db.stockMovement.create({
        data: { variantId: p.body.variants[0].id, warehouseId: wh.id, type: "RECEIVE", quantity: 1 },
      });
      await request(server()).delete(`/products/${p.body.id}`).set(writer).expect(409);
    });
  });

  describe("variants", () => {
    it("POST /products/:id/variants ເພີ່ມ variant ໃໝ່ຂອງສິນຄ້າທີ່ມີ options", async () => {
      const p = await create(shirt).expect(201);
      const res = await request(server())
        .post(`/products/${p.body.id}/variants`)
        .set(writer)
        .send({ sku: "TS-WH-L", price: "110000", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "L" } })
        .expect(201);
      expect(res.body).toMatchObject({ sku: "TS-WH-L", name: "ຂາວ / L", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "L" } });
      expect((await request(server()).get(`/products/${p.body.id}`).set(reader)).body.variants).toHaveLength(4);
    });

    it("ເພີ່ມ variant ຜິດ: ຊຸດຄ່າຊ້ຳ / ຄ່າບໍ່ຢູ່ໃນ option / ບໍ່ຄົບ → 409/400; SKU ຊ້ຳ → 409", async () => {
      const p = await create(shirt).expect(201);
      const post = (body: object) => request(server()).post(`/products/${p.body.id}/variants`).set(writer).send(body);
      await post({ sku: "N1", price: "1", optionValues: { ສີ: "ດຳ", ໄຊສ໌: "M" } }).expect(409);
      await post({ sku: "N2", price: "1", optionValues: { ສີ: "ແດງ", ໄຊສ໌: "M" } }).expect(400);
      await post({ sku: "N3", price: "1", optionValues: { ສີ: "ຂາວ" } }).expect(400);
      await post({ sku: "TS-BK-M", price: "1", optionValues: { ສີ: "ຂາວ", ໄຊສ໌: "L" } }).expect(409);
    });

    it("ສິນຄ້າບໍ່ມີ option ເພີ່ມ variant ທີສອງບໍ່ໄດ້ → 409; ບໍ່ມີສິນຄ້າ → 404", async () => {
      const p = await create(cup).expect(201);
      await request(server()).post(`/products/${p.body.id}/variants`).set(writer).send({ sku: "CUP-2", price: "1" }).expect(409);
      await request(server()).post("/products/nope/variants").set(writer).send({ sku: "Z", price: "1" }).expect(404);
    });

    it("PATCH /variants/:id ແກ້ລາຄາ/ຕົ້ນທຶນ/active; compareAt < price → 400; SKU ຊ້ຳ → 409; ບໍ່ມີ → 404", async () => {
      const p = await create(shirt).expect(201);
      const [first, second] = p.body.variants as { id: string; sku: string }[];
      const patch = (id: string, body: object) => request(server()).patch(`/variants/${id}`).set(writer).send(body);

      const res = await patch(first!.id, { price: "120000", costPrice: "70000", isActive: false, compareAtPrice: "150000" }).expect(200);
      expect(res.body).toMatchObject({ price: "120000.00", costPrice: "70000.00", isActive: false, compareAtPrice: "150000.00" });
      await patch(first!.id, { compareAtPrice: "100" }).expect(400);
      await patch(first!.id, { price: "200000" }).expect(400); // compareAt 150000 ຕ້ອງ >= price ໃໝ່
      await patch(second!.id, { sku: first!.sku }).expect(409);
      await patch("nope", { price: "1" }).expect(404);
      expect(await db.auditLog.count({ where: { action: "variant.update" } })).toBe(1);
    });
  });

  describe("ຮູບ", () => {
    it("PUT /products/:id/images ແທນທັງລາຍການ ແລະ ຈັດ position; variant ຕ້ອງເປັນຂອງສິນຄ້ານີ້", async () => {
      const p = await create(shirt).expect(201);
      const other = await create({ ...cup, name: "Other", variants: [{ sku: "O-1", price: "1" }] }).expect(201);
      const variantId = p.body.variants[0].id;

      const res = await request(server())
        .put(`/products/${p.body.id}/images`)
        .set(writer)
        .send({ images: [{ url: "https://cdn.test/b.jpg" }, { url: "https://cdn.test/a.jpg", variantId }] })
        .expect(200);
      expect(res.body.images.map((i: { url: string }) => i.url)).toEqual(["https://cdn.test/b.jpg", "https://cdn.test/a.jpg"]);
      expect(res.body.images[1].variantId).toBe(variantId);

      await request(server())
        .put(`/products/${p.body.id}/images`)
        .set(writer)
        .send({ images: [{ url: "https://cdn.test/c.jpg", variantId: other.body.variants[0].id }] })
        .expect(400);
      expect(await db.productImage.count({ where: { productId: p.body.id } })).toBe(2); // rollback: ຍັງເປັນຊຸດເກົ່າ

      const cleared = await request(server()).put(`/products/${p.body.id}/images`).set(writer).send({ images: [] }).expect(200);
      expect(cleared.body.images).toEqual([]);
      await request(server()).put(`/products/${p.body.id}/images`).set(writer).send({ images: [{ url: "ftp://x" }] }).expect(400);
    });
  });
```

- [ ] **Step 2: ຮັນ → fail** (route ໃໝ່ຍັງບໍ່ມີ → 404)

- [ ] **Step 3: ເພີ່ມ method ໃນ `ProductsService`**

ເພີ່ມ import ທີ່ຫົວໄຟລ໌: `type PutProductImagesInput, type UpdateProductInput, type UpdateVariantInput, type VariantInput` ຈາກ `@oca/shared`, ແລະ `Prisma` (ເປັນ value) ຈາກ `@oca/database` ຖ້າຕ້ອງການ. ແລ້ວເພີ່ມ method ໃນ class (ກ່ອນ `// ----- helpers`):

```ts
  async update(id: string, input: UpdateProductInput, actor: AuthUser, ip: string | undefined): Promise<ProductDetailDto> {
    const before = await this.requireDetail(id);
    if (input.categoryId) await this.requireCategory(input.categoryId);
    try {
      await this.prisma.product.update({
        where: { id },
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          status: input.status,
          categoryId: input.categoryId,
        },
      });
    } catch (error) {
      throw duplicateError(error) ?? error;
    }
    const after = await this.requireDetail(id);
    await this.audit.record({
      userId: actor.id,
      action: "product.update",
      entity: "Product",
      entityId: id,
      before: productSnapshot(before),
      after: productSnapshot(after),
      ip,
    });
    return toProductDetail(after);
  }

  /**
   * ເຄີຍຖືກຂາຍ (ມີ OrderItem) → ARCHIVED ແທນການລຶບ. ບໍ່ເຄີຍຂາຍ ແຕ່ມີ StockMovement → 409.
   * ອື່ນໆ → ລຶບແທ້ (variant/option/ຮູບຖືກລຶບຕາມ cascade).
   */
  async remove(id: string, actor: AuthUser, ip: string | undefined): Promise<{ archived: boolean }> {
    const before = await this.requireDetail(id);
    const variantIds = before.variants.map((variant) => variant.id);

    if ((await this.prisma.orderItem.count({ where: { variantId: { in: variantIds } } })) > 0) {
      await this.prisma.product.update({ where: { id }, data: { status: "ARCHIVED" } });
      await this.audit.record({
        userId: actor.id,
        action: "product.archive",
        entity: "Product",
        entityId: id,
        before: productSnapshot(before),
        after: { ...productSnapshot(before), status: "ARCHIVED" },
        ip,
      });
      return { archived: true };
    }
    if ((await this.prisma.stockMovement.count({ where: { variantId: { in: variantIds } } })) > 0) {
      throw new ConflictException("Product has stock history; archive it instead (PATCH status=ARCHIVED)");
    }
    await this.prisma.product.delete({ where: { id } });
    await this.audit.record({
      userId: actor.id,
      action: "product.delete",
      entity: "Product",
      entityId: id,
      before: productSnapshot(before),
      ip,
    });
    return { archived: false };
  }

  async addVariant(productId: string, input: VariantInput, actor: AuthUser, ip: string | undefined) {
    const product = await this.requireDetail(productId);
    const optionNames = product.options.map((option) => option.name);

    if (optionNames.length === 0) {
      throw new ConflictException("A product without options has exactly one variant");
    }
    const givenKeys = Object.keys(input.optionValues);
    if (givenKeys.length !== optionNames.length || !optionNames.every((name) => name in input.optionValues)) {
      throw new BadRequestException("optionValues must specify every option");
    }
    const valueIds: string[] = [];
    for (const option of product.options) {
      const match = option.values.find((value) => value.value === input.optionValues[option.name]);
      if (!match) throw new BadRequestException(`Value for option "${option.name}" is not in its list`);
      valueIds.push(match.id);
    }
    const combo = [...valueIds].sort().join("|");
    const taken = product.variants.some(
      (variant) =>
        variant.optionValues
          .map((value) => value.id)
          .sort()
          .join("|") === combo,
    );
    if (taken) throw new ConflictException("A variant with these option values already exists");

    try {
      const created = await this.prisma.productVariant.create({
        data: {
          productId,
          sku: input.sku,
          barcode: input.barcode ?? null,
          name: variantName(optionNames, input.optionValues),
          price: input.price,
          compareAtPrice: input.compareAtPrice ?? null,
          costPrice: input.costPrice,
          weightGrams: input.weightGrams ?? null,
          isActive: input.isActive,
          optionValues: { connect: valueIds.map((valueId) => ({ id: valueId })) },
        },
      });
      await this.audit.record({
        userId: actor.id,
        action: "variant.create",
        entity: "ProductVariant",
        entityId: created.id,
        after: { productId, sku: created.sku },
        ip,
      });
      const detail = await this.requireDetail(productId);
      return toProductDetail(detail).variants.find((variant) => variant.id === created.id);
    } catch (error) {
      throw duplicateError(error) ?? error;
    }
  }

  async updateVariant(id: string, input: UpdateVariantInput, actor: AuthUser, ip: string | undefined) {
    const before = await this.prisma.productVariant.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Variant not found");

    const price = input.price ?? before.price.toFixed(2);
    const compareAt = input.compareAtPrice === undefined ? before.compareAtPrice?.toFixed(2) ?? null : input.compareAtPrice;
    if (compareAt !== null && new Prisma.Decimal(compareAt).lessThan(price)) {
      throw new BadRequestException("compareAtPrice must be >= price");
    }

    try {
      await this.prisma.productVariant.update({
        where: { id },
        data: {
          sku: input.sku,
          barcode: input.barcode,
          price: input.price,
          compareAtPrice: input.compareAtPrice,
          costPrice: input.costPrice,
          weightGrams: input.weightGrams,
          isActive: input.isActive,
        },
      });
    } catch (error) {
      throw duplicateError(error) ?? error;
    }
    const detail = await this.requireDetail(before.productId);
    const variant = toProductDetail(detail).variants.find((item) => item.id === id);
    await this.audit.record({
      userId: actor.id,
      action: "variant.update",
      entity: "ProductVariant",
      entityId: id,
      before: { sku: before.sku, price: before.price.toFixed(2), costPrice: before.costPrice.toFixed(2), isActive: before.isActive },
      after: variant ? { sku: variant.sku, price: variant.price, costPrice: variant.costPrice, isActive: variant.isActive } : undefined,
      ip,
    });
    return variant;
  }

  async putImages(productId: string, input: PutProductImagesInput, actor: AuthUser, ip: string | undefined): Promise<ProductDetailDto> {
    await this.requireDetail(productId);
    const variantIds = [...new Set(input.images.flatMap((image) => (image.variantId ? [image.variantId] : [])))];
    if (variantIds.length > 0) {
      const owned = await this.prisma.productVariant.count({ where: { id: { in: variantIds }, productId } });
      if (owned !== variantIds.length) throw new BadRequestException("variantId does not belong to this product");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId } });
      if (input.images.length > 0) {
        await tx.productImage.createMany({
          data: input.images.map((image, position) => ({
            productId,
            url: image.url,
            alt: image.alt ?? null,
            position,
            variantId: image.variantId ?? null,
          })),
        });
      }
    });
    await this.audit.record({
      userId: actor.id,
      action: "product.images",
      entity: "Product",
      entityId: productId,
      after: { count: input.images.length },
      ip,
    });
    return toProductDetail(await this.requireDetail(productId));
  }
```

> ໃນ `products.service.ts` ປ່ຽນ `import type { Prisma, PrismaClient } from "@oca/database";` ເປັນ `import { Prisma, type PrismaClient } from "@oca/database";` (ໃຊ້ `Prisma.Decimal` ເປັນ value; ບໍ່ຕ້ອງເພີ່ມ dependency).

- [ ] **Step 4: ເພີ່ມ route ໃນ `ProductsController`**

ແກ້ import ຂອງ `@nestjs/common` ເປັນ `Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, Res` ແລະ import `type Response` ຈາກ `express`; import `type PutProductImagesInput, type UpdateProductInput, type UpdateVariantInput, type VariantInput, putProductImagesSchema, updateProductSchema, updateVariantSchema, variantInputSchema` ຈາກ `@oca/shared`. ເພີ່ມ method:

```ts
  @Patch("products/:id")
  @RequirePermissions("inventory:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.update(id, body, actor, req.ip);
  }

  /** 204 ເມື່ອລຶບແທ້; 200 { archived: true } ເມື່ອ archive ແທນ */
  @Delete("products/:id")
  @RequirePermissions("inventory:write")
  async remove(
    @Param("id") id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.products.remove(id, actor, req.ip);
    if (!result.archived) {
      res.status(204);
      return undefined;
    }
    return result;
  }

  @Post("products/:id/variants")
  @RequirePermissions("inventory:write")
  addVariant(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(variantInputSchema)) body: VariantInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.addVariant(id, body, actor, req.ip);
  }

  @Patch("variants/:id")
  @RequirePermissions("inventory:write")
  updateVariant(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateVariantSchema)) body: UpdateVariantInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.updateVariant(id, body, actor, req.ip);
  }

  @Put("products/:id/images")
  @RequirePermissions("inventory:write")
  putImages(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(putProductImagesSchema)) body: PutProductImagesInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.putImages(id, body, actor, req.ip);
  }
```

- [ ] **Step 5: ຮັນ → pass**

Run: `pnpm --filter @oca/api test -- products`
Expected: PASS ທັງໝົດ (~19 tests). ຈຸດທີ່ມັກຜິດ:
  * `DELETE` ຄືນ 200 ແທນ 204 ເມື່ອລຶບແທ້: ກວດ `res.status(204)` ຖືກເອີ້ນກ່ອນ return ແລະ return `undefined`.
  * `PATCH /variants/:id` test `price: "200000"` ຄວນ 400 ເພາະ compareAt ທີ່ເກັບໄວ້ 150000 < 200000 — logic ໃຊ້ `before.compareAtPrice` ເມື່ອ input ບໍ່ໃສ່ `compareAtPrice`.

- [ ] **Step 6: Lint + ທົດສອບທັງ api + commit**

Run: `pnpm --filter @oca/api lint && pnpm --filter @oca/api test`
Expected: PASS ທັງໝົດ.

```bash
git add apps/api
git commit -m "feat(api): add product update, archive/delete, variants and images

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ກວດສຸດທ້າຍ

- [ ] **Step 1: ທົດສອບ ແລະ build ທັງ repo**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: ຜ່ານທັງໝົດ.

- [ ] **Step 2: ກວດ route ຄົບຕາມ spec §6 (ສ່ວນ catalog)**

Run: `grep -rhoE "@(Get|Post|Patch|Put|Delete)\(\"[^\"]*\"\)" apps/api/src/modules/inventory | sort`
Expected: ມີ `categories`, `warehouses`, `settings/store`, `products`, `products/:id`, `products/:id/variants`, `products/:id/images`, `variants/:id`, `:id/default` ຄົບ.

- [ ] **Step 3: ອັບເດດ memory** (`phase1-progress.md`): 1a-2a ສຳເລັດ, ຕໍ່ໄປ 1a-2b.
