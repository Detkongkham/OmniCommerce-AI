# Phase 1-A2b: Inventory API, Stock & Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** REST API ຂອງການເຄື່ອນໄຫວສະຕ໋ອກ (ຮັບເຂົ້າ, ປັບຍອດ, ຍ້າຍສາງ, ຮັບຄືນ, ຍອດ, ປະຫວັດ, threshold) ແລະ ຄຳສັ່ງຊື້ (ສ້າງດ້ວຍມື + ວົງຈອນ pay→pack→ship→complete + cancel) ທີ່ຕໍ່ເຂົ້າເຄື່ອງຈັກສະຕ໋ອກຂອງ plan 1a-1.

**Architecture:** `StockService` ແລະ `OrdersService` ເປັນ "ຜູ້ຫໍ່" ບາງໆອ້ອມ function ຂອງ `@oca/database` (`receive`, `reserveMany`, `shipMany`, ...): ກວດ input/ອ້າງອີງ, ເປີດ `$transaction`, ເອີ້ນເຄື່ອງຈັກ, ຂຽນ audit. `InsufficientStockError` ຖືກແປເປັນ 409 ໂດຍ `InsufficientStockFilter` (ສ້າງໃນ 1a-2a). ການປ່ຽນສະຖານະບິນໃຊ້ `updateMany` ທີ່ມີ guard ໃນ WHERE.

**Tech Stack:** NestJS 11, Prisma 7, `@oca/database` (stock engine), `@oca/shared` (schemas + `calculateOrderTotals`), Vitest + supertest.

**ອ້າງອີງ spec:** [2026-10-04-phase1-a-inventory-design.md](../specs/2026-10-04-phase1-a-inventory-design.md) §4, §6, §7, §9, §11. **ຕ້ອງເຮັດ plan [1a-1](2026-10-05-phase1-a1-engine.md) ແລະ [1a-2a](2026-10-05-phase1-a2a-api-catalog.md) ໃຫ້ສຳເລັດກ່ອນ.** ແຜນຕໍ່ໄປ: **1a-3** (worker + docs), **1a-ui**.

## ຂໍ້ຕົກລົງສຳຄັນ (ອ່ານກ່ອນເລີ່ມ)

* ຂໍ້ຕົກລົງຂອງ plan 1a-2a ໃຊ້ໄດ້ທັງໝົດ (`@Inject`, guard global, build `@oca/shared`+`@oca/database` ກ່ອນ test, ເງິນເປັນ string, ຫ້າມແຕະ Postgres 5432).
* **ຫ້າມ UPDATE `StockLevel` / INSERT `StockMovement` ໃນ service ເອງ** — ເອີ້ນ function ຈາກ `@oca/database` ເທົ່ານັ້ນ (ການ query ອ່ານຍອມໃຫ້). `listLevels` ມີ `$queryRaw` ແບບອ່ານຢ່າງດຽວສຳລັບ filter `lowStock`.
* **ຊື່ຊົນກັນ:** function ຂອງເຄື່ອງຈັກຊື່ `receive`, `adjust`, `transfer`, `returnStock` ຊົນກັບຊື່ method ຂອງ service — import ດ້ວຍ alias ຕາມທີ່ໃສ່ໃນໂຄດຂ້າງລຸ່ມ.
* ອ້າງອີງໃນ body ທີ່ບໍ່ພົບ (`variantId`, `warehouseId`, `orderId` ຂອງ stock ops) → **404**; ສາງທີ່ປິດ (`isActive=false`) → **409**.
* ການປ່ຽນສະຖານະບິນ: `updateMany({ where: { id, status: { in: from }, ... } })`; `count === 0` → ອ່ານສະຖານະປັດຈຸບັນແລ້ວ 404 (ບໍ່ມີບິນ) ຫຼື 409.

---

## File Structure

```
apps/api/src/modules/inventory/
├── inventory.module.ts            (ແກ້)
├── stock.service.ts / stock.controller.ts / stock.mapper.ts
└── orders.service.ts / orders.controller.ts / orders.mapper.ts
apps/api/test/
├── stock.e2e.test.ts
└── orders.e2e.test.ts
```

---

### Task 1: Stock mapper + `StockService` (ຍອດ, ປະຫວັດ, ຮັບເຂົ້າ, ປັບຍອດ, ຍ້າຍ, ຮັບຄືນ, threshold) (TDD e2e)

**Files:**
- Create: `apps/api/src/modules/inventory/stock.mapper.ts`, `stock.service.ts`, `stock.controller.ts`, `apps/api/test/stock.e2e.test.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

- [ ] **Step 1: ຂຽນ e2e test**

`apps/api/test/stock.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";

describe("stock (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let users: Awaited<ReturnType<typeof seedInventoryUsers>>;
  let writer: { Authorization: string };
  let reader: { Authorization: string };
  const server = () => app.getHttpServer();
  const post = (path: string, body: object, headers = writer) => request(server()).post(path).set(headers).send(body);

  async function level(variantId: string, warehouseId: string) {
    const row = await db.stockLevel.findUnique({ where: { variantId_warehouseId: { variantId, warehouseId } } });
    return row ? { onHand: row.onHand, reserved: row.reserved } : null;
  }

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    users = await seedInventoryUsers(db);
    f = await seedCatalog(db);
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  it("ສິດ: ບໍ່ login 401; read-only ເຮັດ POST ບໍ່ໄດ້ 403; ບໍ່ມີ inventory:read ອ່ານບໍ່ໄດ້ 403", async () => {
    await request(server()).get("/stock").expect(401);
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1 }, reader).expect(403);
    await request(server()).get("/stock").set(await bearerFor(app, "noinv@test.local")).expect(403);
  });

  it("receive: ເພີ່ມ onHand, ຄືນ StockLevel DTO, ຂຽນ movement ພ້ອມ actorId + note ແລະ audit", async () => {
    const res = await post("/stock/receive", {
      variantId: f.v1.id,
      warehouseId: f.whA.id,
      quantity: 10,
      note: "PO-1",
    }).expect(201);
    expect(res.body).toMatchObject({
      variantId: f.v1.id,
      sku: "SKU-1",
      warehouseId: f.whA.id,
      warehouseCode: "A",
      onHand: 10,
      reserved: 0,
      available: 10,
      lowStockThreshold: null,
      isLow: false,
    });
    const movement = await db.stockMovement.findFirstOrThrow({ where: { type: "RECEIVE" } });
    expect(movement).toMatchObject({ quantity: 10, note: "PO-1", actorId: users.writer.id });
    expect(await db.auditLog.count({ where: { action: "stock.receive" } })).toBe(1);
  });

  it("ອ້າງອີງບໍ່ພົບ → 404; ສາງປິດ → 409; body ຜິດ → 400", async () => {
    await post("/stock/receive", { variantId: "nope", warehouseId: f.whA.id, quantity: 1 }).expect(404);
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: "nope", quantity: 1 }).expect(404);
    await db.warehouse.update({ where: { id: f.whB.id }, data: { isActive: false } });
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whB.id, quantity: 1 }).expect(409);
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 0 }).expect(400);
  });

  it("adjust: ບວກ/ລົບ ຕ້ອງມີ note; ລົບເກີນ (onHand < reserved) → 409 ພ້ອມ shortages", async () => {
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 }).expect(201);
    await db.stockLevel.update({
      where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } },
      data: { reserved: 3 },
    });

    await post("/stock/adjust", { variantId: f.v1.id, warehouseId: f.whA.id, delta: -2 }).expect(400); // ບໍ່ມີ note
    const res = await post("/stock/adjust", {
      variantId: f.v1.id,
      warehouseId: f.whA.id,
      delta: -3,
      note: "ເສຍຫາຍ",
    }).expect(409);
    expect(res.body.shortages).toEqual([
      { variantId: f.v1.id, warehouseId: f.whA.id, sku: "SKU-1", requested: 3, available: 2 },
    ]);

    await post("/stock/adjust", { variantId: f.v1.id, warehouseId: f.whA.id, delta: -2, note: "ເສຍຫາຍ" }).expect(201);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 3, reserved: 3 });
    await post("/stock/adjust", { variantId: f.v1.id, warehouseId: f.whA.id, delta: 4, note: "ນັບເພີ່ມ" }).expect(201);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 7, reserved: 3 });
  });

  it("transfer: ຄືນ { from, to }; ບໍ່ພໍ → 409 ແລະ ບໍ່ປ່ຽນຫຍັງ; ສາງດຽວກັນ → 400", async () => {
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 }).expect(201);
    const body = { variantId: f.v1.id, fromWarehouseId: f.whA.id, toWarehouseId: f.whB.id };

    await post("/stock/transfer", { ...body, quantity: 6 }).expect(409);
    expect(await level(f.v1.id, f.whB.id)).toBeNull();

    const res = await post("/stock/transfer", { ...body, quantity: 2 }).expect(201);
    expect(res.body.from).toMatchObject({ warehouseCode: "A", onHand: 3 });
    expect(res.body.to).toMatchObject({ warehouseCode: "B", onHand: 2 });
    await post("/stock/transfer", { ...body, toWarehouseId: f.whA.id, quantity: 1 }).expect(400);
  });

  it("return: ເພີ່ມ onHand; orderId ທີ່ບໍ່ມີ → 404", async () => {
    await post("/stock/return", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 2 }).expect(201);
    expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 2, reserved: 0 });
    await post("/stock/return", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1, orderId: "nope" }).expect(404);
  });

  it("PATCH /stock/:id/threshold ຕັ້ງ/ລ້າງ; ບໍ່ມີ id → 404", async () => {
    const rec = await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 }).expect(201);
    const patch = (id: string, body: object) => request(server()).patch(`/stock/${id}/threshold`).set(writer).send(body);

    const set = await patch(rec.body.id, { lowStockThreshold: 5 }).expect(200);
    expect(set.body).toMatchObject({ lowStockThreshold: 5, isLow: true });
    const cleared = await patch(rec.body.id, { lowStockThreshold: null }).expect(200);
    expect(cleared.body).toMatchObject({ lowStockThreshold: null, isLow: false });
    await patch("nope", { lowStockThreshold: 1 }).expect(404);
    await patch(rec.body.id, { lowStockThreshold: -1 }).expect(400);
  });

  it("GET /stock: filter warehouseId / q / lowStock ແລະ pagination", async () => {
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
    await post("/stock/receive", { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 20 });
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whB.id, quantity: 1 });
    await db.stockLevel.updateMany({ where: { variantId: f.v1.id }, data: { lowStockThreshold: 5 } });

    const get = async (qs: string) => (await request(server()).get(`/stock${qs}`).set(reader).expect(200)).body;
    expect((await get("")).total).toBe(3);
    expect((await get(`?warehouseId=${f.whB.id}`)).items.map((i: { sku: string }) => i.sku)).toEqual(["SKU-1"]);
    expect((await get("?q=sku-2")).items).toHaveLength(1);

    const low = await get("?lowStock=true");
    expect(low.items.map((i: { warehouseCode: string }) => i.warehouseCode).sort()).toEqual(["A", "B"]); // v1 ທັງ 2 ສາງ (5<=5, 1<=5)
    expect(low.items.every((i: { isLow: boolean }) => i.isLow)).toBe(true);
    const paged = await get("?pageSize=2&page=2");
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(3);
  });

  it("GET /stock/movements: ໃໝ່→ເກົ່າ, ມີ sku/ຊື່ຜູ້ເຮັດ, filter type/variantId", async () => {
    await post("/stock/receive", { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 5 });
    await post("/stock/adjust", { variantId: f.v1.id, warehouseId: f.whA.id, delta: -1, note: "x" });
    await post("/stock/receive", { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 3 });

    const all = (await request(server()).get("/stock/movements").set(reader).expect(200)).body;
    expect(all.total).toBe(3);
    expect(all.items[0]).toMatchObject({ type: "RECEIVE", sku: "SKU-2", quantity: 3, actorName: "INV_WRITE" });

    const byType = (await request(server()).get("/stock/movements?type=ADJUST").set(reader).expect(200)).body;
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0].quantity).toBe(-1);

    const byVariant = (await request(server()).get(`/stock/movements?variantId=${f.v2.id}`).set(reader).expect(200)).body;
    expect(byVariant.total).toBe(1);
  });
});
```

- [ ] **Step 2: ຮັນ → fail** (`pnpm --filter @oca/api test -- stock.e2e` → 404)

- [ ] **Step 3: ຂຽນ mapper**

`apps/api/src/modules/inventory/stock.mapper.ts`:

```ts
import type { Prisma } from "@oca/database";

export const stockLevelInclude = {
  variant: { select: { sku: true, name: true, product: { select: { name: true } } } },
  warehouse: { select: { code: true } },
} as const satisfies Prisma.StockLevelInclude;

export type StockLevelRow = Prisma.StockLevelGetPayload<{ include: typeof stockLevelInclude }>;

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

export function toStockLevelDto(row: StockLevelRow): StockLevelDto {
  const available = row.onHand - row.reserved;
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.variant.sku,
    variantName: row.variant.name,
    productName: row.variant.product.name,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse.code,
    onHand: row.onHand,
    reserved: row.reserved,
    available,
    lowStockThreshold: row.lowStockThreshold,
    isLow: row.lowStockThreshold !== null && available <= row.lowStockThreshold,
  };
}

export const movementInclude = {
  variant: { select: { sku: true } },
  warehouse: { select: { code: true } },
  order: { select: { orderNumber: true } },
} as const satisfies Prisma.StockMovementInclude;

export type MovementRow = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

export interface StockMovementDto {
  id: string;
  type: string;
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
  createdAt: Date;
}

export function toMovementDto(row: MovementRow, actorNames: Map<string, string>): StockMovementDto {
  return {
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    variantId: row.variantId,
    sku: row.variant.sku,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse.code,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? null,
    note: row.note,
    actorId: row.actorId,
    actorName: row.actorId ? (actorNames.get(row.actorId) ?? null) : null,
    createdAt: row.createdAt,
  };
}
```

- [ ] **Step 4: ຂຽນ `StockService`**

`apps/api/src/modules/inventory/stock.service.ts`:

```ts
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  type Prisma,
  type PrismaClient,
  adjust as adjustStock,
  receive as receiveStock,
  returnStock as returnToStock,
  transfer as transferStock,
} from "@oca/database";
import type {
  AdjustStockInput,
  ReceiveStockInput,
  ReturnStockInput,
  StockListQuery,
  StockMovementQuery,
  StockThresholdInput,
  TransferStockInput,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import {
  type StockLevelDto,
  type StockMovementDto,
  movementInclude,
  stockLevelInclude,
  toMovementDto,
  toStockLevelDto,
} from "./stock.mapper";

@Injectable()
export class StockService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ----- ອ່ານ -----
  async listLevels(query: StockListQuery): Promise<Page<StockLevelDto>> {
    const where: Prisma.StockLevelWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.q
        ? {
            variant: {
              OR: [
                { sku: { contains: query.q, mode: "insensitive" } },
                { name: { contains: query.q, mode: "insensitive" } },
                { product: { name: { contains: query.q, mode: "insensitive" } } },
              ],
            },
          }
        : {}),
    };
    if (query.lowStock) {
      // Prisma ປຽບທຽບສອງຖັນບໍ່ໄດ້ -> ອ່ານ id ດ້ວຍ SQL (ອ່ານຢ່າງດຽວ) ແລ້ວ filter
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "StockLevel"
        WHERE "lowStockThreshold" IS NOT NULL AND "onHand" - "reserved" <= "lowStockThreshold"`;
      where.id = { in: rows.map((row) => row.id) };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockLevel.findMany({
        where,
        include: stockLevelInclude,
        orderBy: [{ variant: { sku: "asc" } }, { warehouse: { code: "asc" } }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.stockLevel.count({ where }),
    ]);
    return toPage(rows.map(toStockLevelDto), total, query.page, query.pageSize);
  }

  async listMovements(query: StockMovementQuery): Promise<Page<StockMovementDto>> {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const actorIds = [...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
    const users = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(users.map((user) => [user.id, user.name]));
    return toPage(
      rows.map((row) => toMovementDto(row, names)),
      total,
      query.page,
      query.pageSize,
    );
  }

  // ----- ເຄື່ອນໄຫວ -----
  async receive(input: ReceiveStockInput, actor: AuthUser, ip: string | undefined): Promise<StockLevelDto> {
    await this.requireTargets(input.variantId, [input.warehouseId]);
    await this.prisma.$transaction((tx) =>
      receiveStock(tx, input, { actorId: actor.id, note: input.note }),
    );
    return this.finish("stock.receive", actor, ip, input, input.variantId, input.warehouseId);
  }

  async adjust(input: AdjustStockInput, actor: AuthUser, ip: string | undefined): Promise<StockLevelDto> {
    await this.requireTargets(input.variantId, [input.warehouseId]);
    await this.prisma.$transaction((tx) =>
      adjustStock(tx, input, { actorId: actor.id, note: input.note }),
    );
    return this.finish("stock.adjust", actor, ip, input, input.variantId, input.warehouseId);
  }

  async returnStock(input: ReturnStockInput, actor: AuthUser, ip: string | undefined): Promise<StockLevelDto> {
    await this.requireTargets(input.variantId, [input.warehouseId]);
    if (input.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: input.orderId }, select: { id: true } });
      if (!order) throw new NotFoundException("Order not found");
    }
    await this.prisma.$transaction((tx) =>
      returnToStock(tx, input, { actorId: actor.id, note: input.note, orderId: input.orderId }),
    );
    return this.finish("stock.return", actor, ip, input, input.variantId, input.warehouseId);
  }

  async transfer(
    input: TransferStockInput,
    actor: AuthUser,
    ip: string | undefined,
  ): Promise<{ from: StockLevelDto; to: StockLevelDto }> {
    await this.requireTargets(input.variantId, [input.fromWarehouseId, input.toWarehouseId]);
    await this.prisma.$transaction((tx) =>
      transferStock(tx, input, { actorId: actor.id, note: input.note }),
    );
    const from = await this.level(input.variantId, input.fromWarehouseId);
    const to = await this.level(input.variantId, input.toWarehouseId);
    await this.audit.record({
      userId: actor.id,
      action: "stock.transfer",
      entity: "StockLevel",
      entityId: from.id,
      after: { ...input },
      ip,
    });
    return { from, to };
  }

  async setThreshold(
    id: string,
    input: StockThresholdInput,
    actor: AuthUser,
    ip: string | undefined,
  ): Promise<StockLevelDto> {
    const before = await this.prisma.stockLevel.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Stock level not found");
    const row = await this.prisma.stockLevel.update({
      where: { id },
      data: { lowStockThreshold: input.lowStockThreshold },
      include: stockLevelInclude,
    });
    await this.audit.record({
      userId: actor.id,
      action: "stock.threshold",
      entity: "StockLevel",
      entityId: id,
      before: { lowStockThreshold: before.lowStockThreshold },
      after: { lowStockThreshold: row.lowStockThreshold },
      ip,
    });
    return toStockLevelDto(row);
  }

  // ----- helpers -----
  private async requireTargets(variantId: string, warehouseIds: string[]): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
    if (!variant) throw new NotFoundException("Variant not found");
    const warehouses = await this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } });
    if (warehouses.length !== new Set(warehouseIds).size) throw new NotFoundException("Warehouse not found");
    if (warehouses.some((warehouse) => !warehouse.isActive)) {
      throw new ConflictException("Warehouse is inactive");
    }
  }

  private async level(variantId: string, warehouseId: string): Promise<StockLevelDto> {
    const row = await this.prisma.stockLevel.findUniqueOrThrow({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      include: stockLevelInclude,
    });
    return toStockLevelDto(row);
  }

  private async finish(
    action: string,
    actor: AuthUser,
    ip: string | undefined,
    input: object,
    variantId: string,
    warehouseId: string,
  ): Promise<StockLevelDto> {
    const level = await this.level(variantId, warehouseId);
    await this.audit.record({
      userId: actor.id,
      action,
      entity: "StockLevel",
      entityId: level.id,
      after: { ...input },
      ip,
    });
    return level;
  }
}
```

- [ ] **Step 5: ຂຽນ controller ແລະລົງທະບຽນ**

`apps/api/src/modules/inventory/stock.controller.ts`:

```ts
import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type AdjustStockInput,
  type ReceiveStockInput,
  type ReturnStockInput,
  type StockListQuery,
  type StockMovementQuery,
  type StockThresholdInput,
  type TransferStockInput,
  adjustStockSchema,
  receiveStockSchema,
  returnStockSchema,
  stockListQuerySchema,
  stockMovementQuerySchema,
  stockThresholdSchema,
  transferStockSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StockService } from "./stock.service";

@Controller("stock")
export class StockController {
  constructor(@Inject(StockService) private readonly stock: StockService) {}

  @Get()
  @RequirePermissions("inventory:read")
  list(@Query(new ZodValidationPipe(stockListQuerySchema)) query: StockListQuery) {
    return this.stock.listLevels(query);
  }

  // ຕ້ອງປະກາດກ່ອນ ":id" routes ອື່ນ (ບໍ່ມີ GET :id ແຕ່ເກັບລຳດັບນີ້ໄວ້ເພື່ອປອດໄພ)
  @Get("movements")
  @RequirePermissions("inventory:read")
  movements(@Query(new ZodValidationPipe(stockMovementQuerySchema)) query: StockMovementQuery) {
    return this.stock.listMovements(query);
  }

  @Post("receive")
  @RequirePermissions("inventory:write")
  receive(
    @Body(new ZodValidationPipe(receiveStockSchema)) body: ReceiveStockInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.receive(body, actor, req.ip);
  }

  @Post("adjust")
  @RequirePermissions("inventory:write")
  adjust(
    @Body(new ZodValidationPipe(adjustStockSchema)) body: AdjustStockInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.adjust(body, actor, req.ip);
  }

  @Post("transfer")
  @RequirePermissions("inventory:write")
  transfer(
    @Body(new ZodValidationPipe(transferStockSchema)) body: TransferStockInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.transfer(body, actor, req.ip);
  }

  @Post("return")
  @RequirePermissions("inventory:write")
  returnStock(
    @Body(new ZodValidationPipe(returnStockSchema)) body: ReturnStockInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.returnStock(body, actor, req.ip);
  }

  @Patch(":id/threshold")
  @RequirePermissions("inventory:write")
  threshold(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(stockThresholdSchema)) body: StockThresholdInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.setThreshold(id, body, actor, req.ip);
  }
}
```

ເພີ່ມ `StockController` ໃນ `controllers` ແລະ `StockService` ໃນ `providers` ຂອງ `inventory.module.ts`.

- [ ] **Step 6: ຮັນ → pass; commit**

Run: `pnpm --filter @oca/api test -- stock.e2e`
Expected: PASS (9 tests).

```bash
git add apps/api
git commit -m "feat(api): add stock endpoints (levels, movements, receive, adjust, transfer, return)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Orders mapper + ສ້າງບິນ + ອ່ານ/ລາຍການ (TDD e2e)

**Files:**
- Create: `apps/api/src/modules/inventory/orders.mapper.ts`, `orders.service.ts`, `orders.controller.ts`, `apps/api/test/orders.e2e.test.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

ໃນ Task ນີ້ເຮັດ `create`, `get`, `list`. Task 3 ເຮັດການປ່ຽນສະຖານະ.

- [ ] **Step 1: ຂຽນ e2e test (ສ່ວນທີ 1)**

`apps/api/test/orders.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import { type PrismaClient, expireOrder, receive } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedInventoryUsers } from "./helpers";

describe("orders (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  let users: Awaited<ReturnType<typeof seedInventoryUsers>>;
  let writer: { Authorization: string };
  let reader: { Authorization: string };
  const server = () => app.getHttpServer();
  const createOrder = (body: object, headers = writer) => request(server()).post("/orders").set(headers).send(body);
  const act = (id: string, action: string, body: object = {}) =>
    request(server()).post(`/orders/${id}/${action}`).set(writer).send(body);

  async function level(variantId = f.v1.id, warehouseId = f.whA.id) {
    const row = await db.stockLevel.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } });
    return { onHand: row.onHand, reserved: row.reserved };
  }

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    users = await seedInventoryUsers(db);
    f = await seedCatalog(db);
    await db.product.update({ where: { id: f.product.id }, data: { status: "ACTIVE" } });
    await db.$transaction(async (tx) => {
      await receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 10 });
      await receive(tx, { variantId: f.v2.id, warehouseId: f.whA.id, quantity: 10 });
    });
    writer = await bearerFor(app, "inv-write@test.local");
    reader = await bearerFor(app, "inv-read@test.local");
  });

  describe("ສ້າງບິນ", () => {
    it("ຄຳນວນເງິນ, snapshot, ຈອງສະຕ໋ອກສາງ default, ເລກບິນ, reservedUntil ຕາມ setting, movement + audit", async () => {
      const before = Date.now();
      const res = await createOrder({
        items: [{ variantId: f.v1.id, quantity: 2, discount: "10.00" }],
        shippingFee: "5.00",
        customer: { name: "ນາງ ກ", phone: "02055551111" },
        shippingAddress: "Vientiane",
      }).expect(201);

      expect(res.body).toMatchObject({
        orderNumber: "SO-000001",
        status: "PENDING_PAYMENT",
        channel: "OFFLINE",
        source: "MANUAL",
        currency: "LAK",
        subtotal: "190.00",
        discountTotal: "10.00",
        shippingFee: "5.00",
        vatRate: "10.00",
        vatAmount: "17.73",
        total: "195.00",
        shippingAddress: "Vientiane",
        customer: { name: "ນາງ ກ", phone: "02055551111" },
      });
      expect(res.body.items).toEqual([
        expect.objectContaining({
          variantId: f.v1.id,
          warehouseId: f.whA.id,
          productName: "Product",
          sku: "SKU-1",
          unitPrice: "100.00",
          unitCost: "60.00",
          quantity: 2,
          discount: "10.00",
          lineTotal: "190.00",
        }),
      ]);

      const reservedUntil = new Date(res.body.reservedUntil).getTime();
      expect(reservedUntil).toBeGreaterThanOrEqual(before + 30 * 60_000 - 5_000);
      expect(reservedUntil).toBeLessThanOrEqual(Date.now() + 30 * 60_000 + 5_000);

      expect(await level()).toEqual({ onHand: 10, reserved: 2 });
      const movement = await db.stockMovement.findFirstOrThrow({ where: { type: "RESERVE" } });
      expect(movement).toMatchObject({ orderId: res.body.id, quantity: 2, actorId: users.writer.id });
      expect(await db.auditLog.count({ where: { action: "order.create", entityId: res.body.id } })).toBe(1);

      const second = await createOrder({ items: [{ variantId: f.v2.id, quantity: 1 }] }).expect(201);
      expect(second.body.orderNumber).toBe("SO-000002");
    });

    it("reservationMinutes ຂອງບິນ override setting; ແກ້ setting ແລ້ວມີຜົນກັບບິນຕໍ່ໄປ", async () => {
      const custom = await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }], reservationMinutes: 45 }).expect(201);
      expect(new Date(custom.body.reservedUntil).getTime()).toBeGreaterThan(Date.now() + 44 * 60_000);

      await db.storeSetting.upsert({ where: { id: 1 }, create: { id: 1, name: "S", reservationMinutes: 5 }, update: { reservationMinutes: 5 } });
      const fromSetting = await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201);
      expect(new Date(fromSetting.body.reservedUntil).getTime()).toBeLessThan(Date.now() + 6 * 60_000);
    });

    it("ລະບຸ warehouseId ເອງໄດ້ (ຈອງຈາກສາງ B)", async () => {
      await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whB.id, quantity: 4 }));
      const res = await createOrder({ items: [{ variantId: f.v1.id, warehouseId: f.whB.id, quantity: 3 }] }).expect(201);
      expect(res.body.items[0].warehouseId).toBe(f.whB.id);
      expect(await level(f.v1.id, f.whB.id)).toEqual({ onHand: 4, reserved: 3 });
      expect(await level(f.v1.id, f.whA.id)).toEqual({ onHand: 10, reserved: 0 });
    });

    it("ສະຕ໋ອກບໍ່ພໍ → 409 ພ້ອມ shortages (ທຸກລາຍການ) ແລະ ບໍ່ມີ Order/ສະຕ໋ອກຄ້າງ", async () => {
      const res = await createOrder({
        items: [
          { variantId: f.v1.id, quantity: 2 },
          { variantId: f.v2.id, quantity: 11 },
        ],
      }).expect(409);
      expect(res.body.shortages).toEqual([
        { variantId: f.v2.id, warehouseId: f.whA.id, sku: "SKU-2", requested: 11, available: 10 },
      ]);
      expect(await db.order.count()).toBe(0);
      expect(await db.stockMovement.count({ where: { type: "RESERVE" } })).toBe(0);
      expect(await level(f.v1.id)).toEqual({ onHand: 10, reserved: 0 });
    });

    it("variant ບໍ່ active / ສິນຄ້າບໍ່ ACTIVE → 409; variant ບໍ່ມີ → 404", async () => {
      await db.productVariant.update({ where: { id: f.v2.id }, data: { isActive: false } });
      await createOrder({ items: [{ variantId: f.v2.id, quantity: 1 }] }).expect(409);
      await createOrder({ items: [{ variantId: "nope", quantity: 1 }] }).expect(404);
      await db.product.update({ where: { id: f.product.id }, data: { status: "DRAFT" } });
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(409);
      expect(await db.order.count()).toBe(0);
    });

    it("ບໍ່ມີສາງ default → 409; ສາງທີ່ລະບຸບໍ່ມີ → 400; ສາງປິດ → 409", async () => {
      await db.warehouse.update({ where: { id: f.whB.id }, data: { isActive: false } });
      await createOrder({ items: [{ variantId: f.v1.id, warehouseId: f.whB.id, quantity: 1 }] }).expect(409);
      await createOrder({ items: [{ variantId: f.v1.id, warehouseId: "nope", quantity: 1 }] }).expect(400);
      await db.warehouse.update({ where: { id: f.whA.id }, data: { isDefault: false } });
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(409);
    });

    it("ລູກຄ້າ: upsert ຕາມ phone (ບໍ່ຂຽນທັບຊື່), customerId ທີ່ບໍ່ມີ → 400", async () => {
      const item = { variantId: f.v1.id, quantity: 1 };
      const a = await createOrder({ items: [item], customer: { name: "ຊື່ເດີມ", phone: "020999" + "111" } }).expect(201);
      const b = await createOrder({ items: [item], customer: { name: "ຊື່ໃໝ່", phone: "020999111" } }).expect(201);
      expect(b.body.customer.id).toBe(a.body.customer.id);
      expect(b.body.customer.name).toBe("ຊື່ເດີມ");
      expect(await db.customer.count()).toBe(1);

      const withId = await createOrder({ items: [item], customerId: a.body.customer.id }).expect(201);
      expect(withId.body.customer.id).toBe(a.body.customer.id);
      await createOrder({ items: [item], customerId: "nope" }).expect(400);
    });

    it("ສ່ວນຫຼຸດເກີນລາຄາ → 400; body ຜິດ (items ຫວ່າງ, ລາຍການຊ້ຳ) → 400", async () => {
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1, discount: "100.01" }] }).expect(400);
      await createOrder({ items: [] }).expect(400);
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }, { variantId: f.v1.id, quantity: 1 }] }).expect(400);
      // ລາຍການຊ້ຳທີ່ເກີດຫຼັງ resolve ສາງ default (ໜຶ່ງໃສ່ whA ຊັດເຈນ, ອີກອັນໃຊ້ default = whA)
      await createOrder({
        items: [
          { variantId: f.v1.id, quantity: 1 },
          { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1 },
        ],
      }).expect(400);
    });

    it("ສິດ: ບໍ່ login 401, read-only 403", async () => {
      await request(server()).post("/orders").send({}).expect(401);
      await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }, reader).expect(403);
    });

    it("ສ້າງພ້ອມກັນ 10 ບິນໃສ່ສະຕ໋ອກ 3 ຊິ້ນ → ສຳເລັດ 3, ທີ່ເຫຼືອ 409, reserved = 3, ເລກບິນບໍ່ຊ້ຳ", async () => {
      await db.stockLevel.update({
        where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } },
        data: { onHand: 3 },
      });
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] })),
      );
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(statuses.filter((s) => s === 409)).toHaveLength(7);
      expect(await level()).toEqual({ onHand: 3, reserved: 3 });
      const numbers = (await db.order.findMany({ select: { orderNumber: true } })).map((o) => o.orderNumber);
      expect(new Set(numbers).size).toBe(3);
    });
  });

  describe("ອ່ານ ແລະ ລາຍການ", () => {
    it("GET /orders/:id: ມີ movements ແລະ secondsUntilExpiry; ບໍ່ມີ id → 404", async () => {
      const created = await createOrder({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201);
      const res = await request(server()).get(`/orders/${created.body.id}`).set(reader).expect(200);
      expect(res.body.movements).toEqual([
        expect.objectContaining({ type: "RESERVE", quantity: 1, warehouseCode: "A" }),
      ]);
      expect(res.body.secondsUntilExpiry).toBeGreaterThan(29 * 60);
      expect(res.body.secondsUntilExpiry).toBeLessThanOrEqual(30 * 60);
      await request(server()).get("/orders/nope").set(reader).expect(404);
    });

    it("GET /orders: filter status / q (ເລກບິນ, ຊື່, ໂທ) / pagination", async () => {
      const item = { variantId: f.v1.id, quantity: 1 };
      const a = await createOrder({ items: [item], customer: { name: "Somchai", phone: "020111222" } }).expect(201);
      await createOrder({ items: [item] }).expect(201);
      await act(a.body.id, "cancel").expect(200);

      const get = async (qs: string) => (await request(server()).get(`/orders${qs}`).set(reader).expect(200)).body;
      expect((await get("")).total).toBe(2);
      expect((await get("?status=CANCELLED")).items.map((o: { id: string }) => o.id)).toEqual([a.body.id]);
      expect((await get("?q=so-000002")).total).toBe(1);
      expect((await get("?q=somch")).total).toBe(1);
      expect((await get("?q=020111")).total).toBe(1);
      const paged = await get("?pageSize=1&page=2");
      expect(paged.items).toHaveLength(1);
      expect(paged.items[0]).toMatchObject({ itemCount: 1, total: "100.00" });
      await request(server()).get("/orders?status=NOPE").set(reader).expect(400);
    });
  });
});
```

(test `GET /orders` ມີການເອີ້ນ `act(..., "cancel")` ທີ່ຈະ implement ໃນ Task 3. ໃນ Task 2 ໃຫ້ໃສ່ `it.skip` ຊົ່ວຄາວໃນ test "GET /orders: filter ..." ແລ້ວເອົາອອກໃນ Task 3 Step 6.)

- [ ] **Step 2: ຮັນ → fail** (`pnpm --filter @oca/api test -- orders.e2e` → 404/ບໍ່ມີ route)

- [ ] **Step 3: ຂຽນ mapper**

`apps/api/src/modules/inventory/orders.mapper.ts`:

```ts
import type { Prisma } from "@oca/database";
import { money } from "../../common/money";

export const orderDetailInclude = {
  customer: true,
  items: { orderBy: { id: "asc" } },
  stockMovements: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { warehouse: { select: { code: true } } } },
} as const satisfies Prisma.OrderInclude;

export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export const orderListInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  _count: { select: { items: true } },
} as const satisfies Prisma.OrderInclude;

export type OrderListRow = Prisma.OrderGetPayload<{ include: typeof orderListInclude }>;

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  source: string;
  customer: { id: string; name: string; phone: string | null } | null;
  total: string;
  itemCount: number;
  reservedUntil: Date | null;
  createdAt: Date;
}

export function toOrderListItem(row: OrderListRow): OrderListItemDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    channel: row.channel,
    source: row.source,
    customer: row.customer,
    total: money(row.total),
    itemCount: row._count.items,
    reservedUntil: row.reservedUntil,
    createdAt: row.createdAt,
  };
}

export interface OrderDetailDto {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  source: string;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  currency: string;
  exchangeRate: string;
  subtotal: string;
  discountTotal: string;
  shippingFee: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  note: string | null;
  reservedUntil: Date | null;
  secondsUntilExpiry: number | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  items: {
    id: string;
    variantId: string;
    warehouseId: string;
    productName: string;
    variantName: string | null;
    sku: string;
    unitPrice: string;
    unitCost: string;
    quantity: number;
    discount: string;
    lineTotal: string;
  }[];
  movements: { id: string; type: string; quantity: number; warehouseId: string; warehouseCode: string; createdAt: Date }[];
}

export function toOrderDetail(row: OrderDetailRow, now: Date = new Date()): OrderDetailDto {
  const pendingWithDeadline = row.status === "PENDING_PAYMENT" && row.reservedUntil !== null;
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    channel: row.channel,
    source: row.source,
    customer: row.customer
      ? { id: row.customer.id, name: row.customer.name, phone: row.customer.phone, email: row.customer.email }
      : null,
    currency: row.currency,
    exchangeRate: row.exchangeRate.toFixed(6),
    subtotal: money(row.subtotal),
    discountTotal: money(row.discountTotal),
    shippingFee: money(row.shippingFee),
    vatRate: money(row.vatRate),
    vatAmount: money(row.vatAmount),
    total: money(row.total),
    shippingName: row.shippingName,
    shippingPhone: row.shippingPhone,
    shippingAddress: row.shippingAddress,
    note: row.note,
    reservedUntil: row.reservedUntil,
    secondsUntilExpiry:
      pendingWithDeadline && row.reservedUntil
        ? Math.max(0, Math.floor((row.reservedUntil.getTime() - now.getTime()) / 1000))
        : null,
    paidAt: row.paidAt,
    shippedAt: row.shippedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    items: row.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      warehouseId: item.warehouseId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      unitPrice: money(item.unitPrice),
      unitCost: money(item.unitCost),
      quantity: item.quantity,
      discount: money(item.discount),
      lineTotal: money(item.lineTotal),
    })),
    movements: row.stockMovements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      warehouseId: movement.warehouseId,
      warehouseCode: movement.warehouse.code,
      createdAt: movement.createdAt,
    })),
  };
}
```

- [ ] **Step 4: ຂຽນ `OrdersService` (create/get/list)**

`apps/api/src/modules/inventory/orders.service.ts`:

```ts
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Prisma, type PrismaClient, reserveMany } from "@oca/database";
import { type CreateOrderInput, type OrderListQuery, calculateOrderTotals } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import {
  type OrderDetailDto,
  type OrderListItemDto,
  orderDetailInclude,
  orderListInclude,
  toOrderDetail,
  toOrderListItem,
} from "./orders.mapper";

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: OrderListQuery): Promise<Page<OrderListItemDto>> {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: "insensitive" } },
              { customer: { name: { contains: query.q, mode: "insensitive" } } },
              { customer: { phone: { contains: query.q } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderListInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.order.count({ where }),
    ]);
    return toPage(rows.map(toOrderListItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<OrderDetailDto> {
    return toOrderDetail(await this.requireDetail(id));
  }

  /** ສ້າງບິນ + ຈອງສະຕ໋ອກ ໃນ transaction ດຽວ. ສະຕ໋ອກບໍ່ພໍ → InsufficientStockError (filter ແປເປັນ 409) ແລະ rollback ທັງໝົດ. */
  async create(input: CreateOrderInput, actor: AuthUser, ip: string | undefined): Promise<OrderDetailDto> {
    const orderId = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.storeSetting.upsert({
        where: { id: 1 },
        create: { id: 1, name: "OCA Store" },
        update: {},
      });

      // 1) ສາງ
      let defaultWarehouseId: string | undefined;
      if (input.items.some((item) => item.warehouseId === undefined)) {
        const warehouse = await tx.warehouse.findFirst({
          where: { isDefault: true, isActive: true },
          select: { id: true },
        });
        if (!warehouse) throw new ConflictException("No active default warehouse is configured");
        defaultWarehouseId = warehouse.id;
      }
      const resolved = input.items.map((item) => {
        const warehouseId = item.warehouseId ?? defaultWarehouseId;
        if (!warehouseId) throw new ConflictException("No active default warehouse is configured");
        return { ...item, warehouseId };
      });
      const keys = resolved.map((item) => `${item.variantId}|${item.warehouseId}`);
      if (new Set(keys).size !== keys.length) {
        throw new BadRequestException("Duplicate (variant, warehouse) lines");
      }
      const warehouseIds = [...new Set(resolved.map((item) => item.warehouseId))];
      const warehouses = await tx.warehouse.findMany({ where: { id: { in: warehouseIds } } });
      if (warehouses.length !== warehouseIds.length) throw new BadRequestException("Warehouse not found");
      if (warehouses.some((warehouse) => !warehouse.isActive)) throw new ConflictException("Warehouse is inactive");

      // 2) variants
      const variantIds = [...new Set(resolved.map((item) => item.variantId))];
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: { select: { name: true, status: true } } },
      });
      const variantById = new Map(variants.map((variant) => [variant.id, variant]));

      // 3) ລູກຄ້າ
      let customerId: string | null = null;
      if (input.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
        if (!customer) throw new BadRequestException("Customer not found");
        customerId = customer.id;
      } else if (input.customer) {
        const customer = await tx.customer.upsert({
          where: { phone: input.customer.phone },
          create: { name: input.customer.name, phone: input.customer.phone, email: input.customer.email },
          update: {},
        });
        customerId = customer.id;
      }

      // 4) ເງິນ
      const lines = resolved.map((item) => {
        const variant = variantById.get(item.variantId);
        if (!variant) throw new NotFoundException(`Variant ${item.variantId} not found`);
        if (!variant.isActive || variant.product.status !== "ACTIVE") {
          throw new ConflictException(`Variant ${variant.sku} is not available for sale`);
        }
        return { item, variant };
      });
      let totals: ReturnType<typeof calculateOrderTotals>;
      try {
        totals = calculateOrderTotals({
          lines: lines.map(({ item, variant }) => ({
            unitPrice: variant.price.toFixed(2),
            quantity: item.quantity,
            discount: item.discount,
          })),
          shippingFee: input.shippingFee,
          vatRate: settings.vatRate.toString(),
          pricesIncludeVat: settings.pricesIncludeVat,
        });
      } catch (error) {
        if (error instanceof RangeError) throw new BadRequestException(error.message);
        throw error;
      }

      // 5) ເລກບິນ + ບັນທຶກ
      const [sequenceRow] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('"Order_number_seq"') AS n`;
      if (!sequenceRow) throw new Error("Order_number_seq returned no row");
      const n = sequenceRow.n;
      const minutes = input.reservationMinutes ?? settings.reservationMinutes;
      const order = await tx.order.create({
        data: {
          orderNumber: `SO-${String(n).padStart(6, "0")}`,
          customerId,
          channel: "OFFLINE",
          source: "MANUAL",
          currency: settings.baseCurrency,
          exchangeRate: 1,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          shippingFee: input.shippingFee,
          vatRate: settings.vatRate,
          vatAmount: totals.vatAmount,
          total: totals.total,
          shippingName: input.shippingName,
          shippingPhone: input.shippingPhone,
          shippingAddress: input.shippingAddress,
          note: input.note,
          reservedUntil: new Date(Date.now() + minutes * 60_000),
          items: {
            create: lines.map(({ item, variant }, index) => ({
              variantId: variant.id,
              warehouseId: item.warehouseId,
              productName: variant.product.name,
              variantName: variant.name,
              sku: variant.sku,
              unitPrice: variant.price,
              unitCost: variant.costPrice,
              quantity: item.quantity,
              discount: item.discount,
              lineTotal: totals.lines[index]?.lineTotal ?? "0.00",
            })),
          },
        },
        select: { id: true },
      });

      // 6) ຈອງສະຕ໋ອກ (ບໍ່ພໍ → throw → rollback ທັງບິນ)
      await reserveMany(
        tx,
        resolved.map((item) => ({ variantId: item.variantId, warehouseId: item.warehouseId, quantity: item.quantity })),
        { orderId: order.id, actorId: actor.id },
      );
      return order.id;
    });

    const created = await this.requireDetail(orderId);
    await this.audit.record({
      userId: actor.id,
      action: "order.create",
      entity: "Order",
      entityId: orderId,
      after: {
        orderNumber: created.orderNumber,
        status: created.status,
        total: created.total.toFixed(2),
        itemCount: created.items.length,
      },
      ip,
    });
    return toOrderDetail(created);
  }

  async requireDetail(id: string) {
    const row = await this.prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
    if (!row) throw new NotFoundException("Order not found");
    return row;
  }
}
```

- [ ] **Step 5: ຂຽນ controller ແລະລົງທະບຽນ**

`apps/api/src/modules/inventory/orders.controller.ts`:

```ts
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import {
  type CreateOrderInput,
  type OrderListQuery,
  createOrderSchema,
  orderListQuerySchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions("inventory:read")
  list(@Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery) {
    return this.orders.list(query);
  }

  @Get(":id")
  @RequirePermissions("inventory:read")
  get(@Param("id") id: string) {
    return this.orders.get(id);
  }

  @Post()
  @RequirePermissions("inventory:write")
  create(
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.orders.create(body, actor, req.ip);
  }
}
```

ເພີ່ມ `OrdersController` / `OrdersService` ໃນ `inventory.module.ts`.

- [ ] **Step 6: ຮັນ → pass (ຍົກເວັ້ນ test ທີ່ `it.skip`)**

Run: `pnpm --filter @oca/api test -- orders.e2e`
Expected: PASS. ຈຸດທີ່ມັກຜິດ:
  * `unitPrice`/`total` ເປັນ `"100"` ແທນ `"100.00"`: ກວດວ່າ mapper ໃຊ້ `money()` ທຸກບ່ອນ.
  * `Date`/`bigint`: `String(n)` ເຮັດວຽກກັບ `bigint` ✓. ຖ້າ driver ຄືນ `n` ເປັນ `string`/`number` ກໍ່ເຮັດວຽກຄືກັນ.
  * ເລກບິນຊ້ຳໃນ test concurrency: sequence ເປັນ atomic ຈຶ່ງບໍ່ຊ້ຳ.
  * `exchangeRate: 1` ຮັບ number ໄດ້ສຳລັບ Decimal.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): add order creation with atomic stock reservation, get and list

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ວົງຈອນບິນ pay/pack/ship/complete/cancel (TDD e2e)

**Files:**
- Modify: `apps/api/src/modules/inventory/orders.service.ts`, `orders.controller.ts`, `apps/api/test/orders.e2e.test.ts`

- [ ] **Step 1: ເພີ່ມ test**

ໃນ `apps/api/test/orders.e2e.test.ts` ເອົາ `.skip` ອອກຈາກ test "GET /orders: filter ..." ແລ້ວເພີ່ມ block ໃໝ່ ກ່ອນ `});` ສຸດທ້າຍ:

```ts
  describe("ວົງຈອນບິນ", () => {
    const newOrder = async (quantity = 2) =>
      (await createOrder({ items: [{ variantId: f.v1.id, quantity }] }).expect(201)).body as { id: string };
    const statusOf = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).status;

    it("pay → pack → ship → complete: ສະຖານະ, timestamp, ສະຕ໋ອກ (ship ຕັດ onHand ແລະ reserved)", async () => {
      const { id } = await newOrder(2);

      const paid = await act(id, "pay").expect(200);
      expect(paid.body.status).toBe("PAID");
      expect(paid.body.paidAt).not.toBeNull();
      expect(paid.body.secondsUntilExpiry).toBeNull();
      expect(await level()).toEqual({ onHand: 10, reserved: 2 });

      expect((await act(id, "pack").expect(200)).body.status).toBe("PACKING");
      const shipped = await act(id, "ship").expect(200);
      expect(shipped.body.status).toBe("SHIPPED");
      expect(shipped.body.shippedAt).not.toBeNull();
      expect(await level()).toEqual({ onHand: 8, reserved: 0 });

      const done = await act(id, "complete").expect(200);
      expect(done.body.status).toBe("COMPLETED");
      expect(done.body.completedAt).not.toBeNull();

      const types = (await db.stockMovement.findMany({ where: { orderId: id }, orderBy: { createdAt: "asc" } })).map((m) => m.type);
      expect(types).toEqual(["RESERVE", "SHIP"]);
      for (const action of ["pay", "pack", "ship", "complete"]) {
        expect(await db.auditLog.count({ where: { action: `order.${action}`, entityId: id } })).toBe(1);
      }
    });

    it("ຂ້າມຂັ້ນ/ຍ້ອນຫຼັງ → 409 ແລະ ບໍ່ປ່ຽນຫຍັງ; ບໍ່ມີບິນ → 404", async () => {
      const { id } = await newOrder();
      await act(id, "pack").expect(409);
      await act(id, "ship").expect(409);
      await act(id, "complete").expect(409);
      expect(await statusOf(id)).toBe("PENDING_PAYMENT");

      await act(id, "pay").expect(200);
      await act(id, "pay").expect(409);
      await act("nope", "pay").expect(404);
      expect(await level()).toEqual({ onHand: 10, reserved: 2 });
    });

    it("pay ຫຼັງ reservedUntil → 409 (ໝົດເວລາແລ້ວ) ແລະ ຍັງ PENDING_PAYMENT", async () => {
      const { id } = await newOrder();
      await db.order.update({ where: { id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      const res = await act(id, "pay").expect(409);
      expect(res.body.message).toMatch(/expired/i);
      expect(await statusOf(id)).toBe("PENDING_PAYMENT");
    });

    it("cancel ຈາກ PENDING_PAYMENT / PAID / PACKING ຄືນສະຕ໋ອກທີ່ຈອງ ແລະ ເກັບເຫດຜົນໃນ note", async () => {
      const a = await newOrder(1);
      const b = await newOrder(2);
      const c = await newOrder(3);
      await act(b.id, "pay").expect(200);
      await act(c.id, "pay").expect(200);
      await act(c.id, "pack").expect(200);
      expect(await level()).toEqual({ onHand: 10, reserved: 6 });

      const res = await act(a.id, "cancel", { reason: "ລູກຄ້າຍົກເລີກ" }).expect(200);
      expect(res.body.status).toBe("CANCELLED");
      expect(res.body.cancelledAt).not.toBeNull();
      expect(res.body.note).toContain("ລູກຄ້າຍົກເລີກ");
      await act(b.id, "cancel").expect(200);
      await act(c.id, "cancel").expect(200);

      expect(await level()).toEqual({ onHand: 10, reserved: 0 });
      expect(await db.stockMovement.count({ where: { type: "RELEASE" } })).toBe(3);
      expect(await db.auditLog.count({ where: { action: "order.cancel" } })).toBe(3);
    });

    it("cancel ຊ້ຳ, ຫຼັງ SHIPPED, COMPLETED, ຫຼື EXPIRED → 409 ແລະ ບໍ່ຄືນສະຕ໋ອກຊ້ຳ", async () => {
      const { id } = await newOrder(2);
      await act(id, "cancel").expect(200);
      await act(id, "cancel").expect(409);
      expect(await level()).toEqual({ onHand: 10, reserved: 0 });

      const shipped = await newOrder(1);
      await act(shipped.id, "pay").expect(200);
      await act(shipped.id, "pack").expect(200);
      await act(shipped.id, "ship").expect(200);
      await act(shipped.id, "cancel").expect(409);
      await act(shipped.id, "complete").expect(200);
      await act(shipped.id, "cancel").expect(409);

      const expired = await newOrder(1);
      await db.order.update({ where: { id: expired.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
      expect(await expireOrder(db, expired.id)).toBe(true);
      await act(expired.id, "cancel").expect(409);
      expect(await level()).toEqual({ onHand: 9, reserved: 0 });
    });

    it("cancel ແຂ່ງກັບ expire ພ້ອມກັນ (30 ຮອບ): ຜູ້ຊະນະຄົນດຽວ, ຄືນສະຕ໋ອກຄັ້ງດຽວ, reserved ບໍ່ຕິດລົບ", async () => {
      for (let i = 0; i < 30; i += 1) {
        const { id } = await newOrder(1);
        await db.order.update({ where: { id }, data: { reservedUntil: new Date(Date.now() - 1000) } });

        const [cancelRes, expired] = await Promise.all([act(id, "cancel"), expireOrder(db, id)]);

        const finalStatus = await statusOf(id);
        expect(["CANCELLED", "EXPIRED"]).toContain(finalStatus);
        expect(cancelRes.status === 200 ? 1 : 0).toBe(finalStatus === "CANCELLED" ? 1 : 0);
        expect(expired).toBe(finalStatus === "EXPIRED");
        expect(await db.stockMovement.count({ where: { orderId: id, type: "RELEASE" } })).toBe(1);
        expect(await level()).toEqual({ onHand: 10, reserved: 0 });
      }
    });

    it("pay ແຂ່ງກັບ expire (30 ຮອບ): ຖ້າ pay ຊະນະ ສະຕ໋ອກຍັງຈອງ; ຖ້າ expire ຊະນະ ສະຕ໋ອກຄືນ", async () => {
      for (let i = 0; i < 30; i += 1) {
        const { id } = await newOrder(1);
        // reservedUntil ເກືອບໝົດ: pay ຕ້ອງການ reservedUntil > now, expire ຕ້ອງການ reservedUntil < now
        await db.order.update({ where: { id }, data: { reservedUntil: new Date(Date.now() + 15) } });
        await new Promise((resolve) => setTimeout(resolve, 10));

        await Promise.all([act(id, "pay"), expireOrder(db, id)]);

        const finalStatus = await statusOf(id);
        expect(["PAID", "EXPIRED"]).toContain(finalStatus);
        expect(await level()).toEqual({ onHand: 10, reserved: finalStatus === "PAID" ? 1 : 0 });
        await db.order.update({ where: { id }, data: { status: "CANCELLED" } }); // ລ້າງສຳລັບຮອບຕໍ່ໄປ
        await db.stockLevel.update({
          where: { variantId_warehouseId: { variantId: f.v1.id, warehouseId: f.whA.id } },
          data: { reserved: 0 },
        });
      }
    });

    it("ສິດ: read-only ປ່ຽນສະຖານະບໍ່ໄດ້ 403", async () => {
      const { id } = await newOrder();
      for (const action of ["pay", "pack", "ship", "complete", "cancel"]) {
        await request(server()).post(`/orders/${id}/${action}`).set(reader).send({}).expect(403);
      }
    });
  });
```

- [ ] **Step 2: ຮັນ → fail** (route `/orders/:id/pay` ຍັງບໍ່ມີ → 404)

- [ ] **Step 3: ເພີ່ມ method ການປ່ຽນສະຖານະໃນ `OrdersService`**

ເພີ່ມ import: `releaseMany, shipMany` ຈາກ `@oca/database`; `type CancelOrderInput, type OrderStatus` ຈາກ `@oca/shared`. ເພີ່ມ method ໃນ class:

```ts
  pay(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "pay", {
      from: ["PENDING_PAYMENT"],
      to: "PAID",
      data: { paidAt: new Date() },
      // ຕ້ອງຍັງບໍ່ໝົດເວລາຈອງ: guard ຢູ່ໃນ WHERE ເພື່ອແຂ່ງກັບ worker expire ໄດ້ຢ່າງປອດໄພ
      extraWhere: { reservedUntil: { gt: new Date() } },
      stock: null,
      actor,
      ip,
    });
  }

  pack(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "pack", { from: ["PAID"], to: "PACKING", data: {}, stock: null, actor, ip });
  }

  ship(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "ship", {
      from: ["PACKING"],
      to: "SHIPPED",
      data: { shippedAt: new Date() },
      stock: "ship",
      actor,
      ip,
    });
  }

  complete(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "complete", {
      from: ["SHIPPED"],
      to: "COMPLETED",
      data: { completedAt: new Date() },
      stock: null,
      actor,
      ip,
    });
  }

  cancel(id: string, input: CancelOrderInput, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "cancel", {
      from: ["PENDING_PAYMENT", "PAID", "PACKING"],
      to: "CANCELLED",
      data: { cancelledAt: new Date() },
      stock: "release",
      reason: input.reason,
      actor,
      ip,
    });
  }

  /**
   * UPDATE ... WHERE id AND status IN (from) [AND extraWhere]: ກະທົບ 0 ແຖວ = ບໍ່ມີບິນ ຫຼື ສະຖານະບໍ່ຖືກ ຫຼື ແພ້ການແຂ່ງ.
   * ເມື່ອຜ່ານ ເຮັດການຕັດ/ປ່ອຍສະຕ໋ອກໃນ transaction ດຽວກັນ (ຜິດ → rollback ທັງສະຖານະ).
   */
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
    const changed = await this.prisma.$transaction(async (tx) => {
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
    });

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

  private async failTransition(id: string, action: string): Promise<never> {
    const order = await this.prisma.order.findUnique({ where: { id }, select: { status: true, reservedUntil: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (action === "pay" && order.status === "PENDING_PAYMENT") {
      throw new ConflictException("Reservation expired; the order can no longer be paid");
    }
    throw new ConflictException(`Order is ${order.status}; cannot ${action}`);
  }
```

> `failTransition` ຕອນ `pay` ແລະ ບິນຍັງ `PENDING_PAYMENT` ໝາຍຄວາມວ່າ guard `reservedUntil > now` ບໍ່ຜ່ານ ຈຶ່ງຕອບ "expired" (test ກວດ `/expired/i`). ຖ້າ worker expire ໄປກ່ອນ ສະຖານະເປັນ `EXPIRED` ຈະຕອບ "Order is EXPIRED; cannot pay".

- [ ] **Step 4: ເພີ່ມ route**

ໃນ `orders.controller.ts` ເພີ່ມ `HttpCode` ໃນ import ຂອງ `@nestjs/common`, import `type CancelOrderInput, cancelOrderSchema` ຈາກ `@oca/shared`, ແລ້ວເພີ່ມ method:

```ts
  @Post(":id/pay")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  pay(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.pay(id, actor, req.ip);
  }

  @Post(":id/pack")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  pack(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.pack(id, actor, req.ip);
  }

  @Post(":id/ship")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  ship(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.ship(id, actor, req.ip);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  complete(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.complete(id, actor, req.ip);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: CancelOrderInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.orders.cancel(id, body, actor, req.ip);
  }
```

(ຕ້ອງສົ່ງ body `{}` ໄດ້ ຫຼືບໍ່ສົ່ງ body ກໍ່ໄດ້ສຳລັບ `cancel`: ຖ້າ client ບໍ່ສົ່ງ body Express ຈະໃຫ້ `req.body = {}` ຈຶ່ງຜ່ານ `cancelOrderSchema`.)

- [ ] **Step 5: ຮັນ → pass**

Run: `pnpm --filter @oca/api test -- orders.e2e`
Expected: PASS ທັງໝົດ. ຖ້າ test race ບໍ່ stable:
  * "cancel ແຂ່ງກັບ expire": ຖ້າທັງສອງ fail (ບໍ່ຄວນ) ກວດວ່າ `expireOrder` ໃຊ້ `reservedUntil: { lt: now }` ກັບ `now = new Date()` ທີ່ສ້າງ ຫຼັງ ຈາກຕັ້ງ `reservedUntil` ໃນອະດີດ.
  * "pay ແຂ່ງກັບ expire": ໃຊ້ `setTimeout 10ms` ແລະ `reservedUntil = now+15ms`. ຖ້າ flaky ເພີ່ມ margin ເປັນ 30ms/20ms. ເປົ້າໝາຍຂອງ test = ຜູ້ຊະນະຄົນດຽວ ບໍ່ວ່າໃຜຊະນະ.

- [ ] **Step 6: Lint + test ທັງ api + commit**

Run: `pnpm --filter @oca/api lint && pnpm --filter @oca/api test`
Expected: PASS ທັງໝົດ.

```bash
git add apps/api
git commit -m "feat(api): add order lifecycle (pay, pack, ship, complete, cancel) with guarded transitions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ກວດສຸດທ້າຍ

- [ ] **Step 1: Lint + build + test ທັງ repo**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: ຜ່ານທັງໝົດ.

- [ ] **Step 2: ກວດວ່າບໍ່ມີໂຄດນອກເຄື່ອງຈັກທີ່ແກ້ StockLevel / ຂຽນ StockMovement**

Run:
```bash
grep -rnE -A3 "stockLevel\.(update|updateMany|create|upsert|delete)|stockMovement\.(create|createMany|update|delete)|UPDATE \"StockLevel\"" apps/api/src apps/worker/src \
  | awk '/^--$/{if(b!=""&&b!~/lowStockThreshold/)printf "%s",b;b="";next}{b=b $0 "\n"}END{if(b!=""&&b!~/lowStockThreshold/)printf "%s",b}'
```
Expected: ບໍ່ມີຜົນລັບ (ມີແຕ່ໃນ `packages/database/src/inventory/` ແລະ test). `-A3` + `awk` ຕັດ block ທີ່ແກ້ພຽງ `lowStockThreshold` ອອກ (ການຕັ້ງ threshold ໃນ `StockService.setThreshold` ບໍ່ແມ່ນການເຄື່ອນໄຫວສະຕ໋ອກ ຈຶ່ງອະນຸຍາດ); ການຂຽນ `stockLevel`/`stockMovement` ອື່ນໆຍັງຖືກສະແດງ.

- [ ] **Step 3: ກວດ route ຄົບຕາມ spec §6**

Run: `grep -rhoE "@(Get|Post|Patch|Put|Delete)\(\"[^\"]*\"\)" apps/api/src/modules/inventory | sort | uniq -c`
Expected: ມີ `orders`, `orders/:id`, `:id/pay`, `:id/pack`, `:id/ship`, `:id/complete`, `:id/cancel`, `stock`, `movements`, `receive`, `adjust`, `transfer`, `return`, `:id/threshold` ພ້ອມກັບທີ່ມີຈາກ 1a-2a.

- [ ] **Step 4: ອັບເດດ memory** (`phase1-progress.md`): 1a-2b ສຳເລັດ, ຕໍ່ໄປ 1a-3.
