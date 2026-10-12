# Phase 3 D1: Customer 360 + RFM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admin gets a `/customers` area: searchable list with RFM segments, a customer detail page (stats, orders, chats, editable profile) and merging of duplicate customers.

**Architecture:** A new `CrmCustomersService` in the existing empty `crm` API module serves `/crm/customers/*` (the old `GET /customers` lookup used by the order form stays untouched). Stats and RFM are computed live from `Order` in one SQL CTE shared by list, count, segment summary and detail. Admin UI follows the existing list/detail/dialog patterns (TanStack Query hooks in `lib/queries.ts`, strings in a dictionary fragment).

**Tech Stack:** NestJS 11, Prisma 7 (`$queryRaw` + `Prisma.sql`), Zod 4 (`@oca/shared`), Next 16 + React Query (admin), Vitest + supertest.

Spec: `docs/superpowers/specs/2026-10-12-phase3-d-crm-loyalty-design.md` §2. Tier, points and PIN are **not** in this plan (D2/D3).

**Conventions used below**

- "Counted orders" = status in `PAID`, `PACKING`, `SHIPPED`, `COMPLETED`. Order value = `subtotal`.
- API tests: `OCA_TEST_DB_NAME=oca_test_crm pnpm --filter @oca/api exec vitest run <file>`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never touch the Postgres on port 5432; dev/test DB is the isolated one on 5433 (already in `.env`).

## File map

| File | Responsibility |
|---|---|
| `packages/database/prisma/schema.prisma` (modify) | `Customer.note` |
| `packages/database/prisma/migrations/20261012000000_crm/migration.sql` (create) | add the column |
| `packages/shared/src/schemas/crm.ts` (create) | RFM constants, list query, update and merge schemas |
| `packages/shared/src/schemas/crm.test.ts` (create) | schema tests |
| `packages/shared/src/error-codes.ts`, `packages/shared/src/index.ts` (modify) | `CUSTOMER_PHONE_TAKEN`, export |
| `apps/api/src/common/api-error.ts` (modify) | status of the new code |
| `apps/api/src/modules/crm/customer-stats.sql.ts` (create) | the RFM CTE (single source) |
| `apps/api/src/modules/crm/crm-customers.service.ts` (create) | list, segments, detail, tabs, update, merge |
| `apps/api/src/modules/crm/crm-customers.controller.ts` (create) | routes + permissions |
| `apps/api/src/modules/crm/crm.module.ts` (modify) | wiring |
| `apps/api/test/crm-fixtures.ts` (create) | `seedCustomerOrder` helper |
| `apps/api/test/crm-customers.e2e.test.ts` (create) | API tests |
| `apps/admin/src/lib/types.ts`, `apps/admin/src/lib/queries.ts` (modify) | DTOs + hooks |
| `apps/admin/src/lib/i18n/crm-dictionary.ts` (create), `dictionary.ts` (modify) | strings |
| `apps/admin/src/lib/nav.ts`, `nav.test.ts` (modify) | menu entry |
| `apps/admin/src/components/customers/segment.ts` (create) | segment → pill tone |
| `apps/admin/src/components/customers/customer-list.tsx` + test (create) | list page |
| `apps/admin/src/components/customers/customer-detail.tsx` + test (create) | detail page |
| `apps/admin/src/components/customers/customer-edit-dialog.tsx` (create) | profile form |
| `apps/admin/src/components/customers/merge-customer-dialog.tsx` + test (create) | merge flow |
| `apps/admin/src/app/(app)/customers/page.tsx`, `[id]/page.tsx` (create) | routes |
| `apps/admin/src/components/orders/order-detail.tsx` (modify) | customer name links to `/customers/[id]` |
| `docs/DATABASE.md` (modify) | document `note` |

---

### Task 1: Schema, shared schemas, error code

**Files:** `schema.prisma`, migration, `packages/shared/src/schemas/crm.ts` (+ test), `error-codes.ts`, `index.ts`, `apps/api/src/common/api-error.ts`, admin `dictionary.ts` (error strings).

- [ ] **Step 1: failing shared test** — create `packages/shared/src/schemas/crm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RFM_SEGMENTS, crmCustomerListQuerySchema, mergeCustomerSchema, updateCustomerSchema } from "./crm";

describe("crmCustomerListQuerySchema", () => {
  it("ຄ່າເລີ່ມຕົ້ນ: page 1, pageSize 20, sort lastOrder", () => {
    expect(crmCustomerListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, sort: "lastOrder" });
  });
  it("ຮັບ q, segment, sort ແລະ ແປງ page ຈາກ string", () => {
    expect(crmCustomerListQuerySchema.parse({ q: " mali ", segment: "AT_RISK", sort: "spent", page: "2", pageSize: "50" })).toEqual({
      q: "mali",
      segment: "AT_RISK",
      sort: "spent",
      page: 2,
      pageSize: 50,
    });
  });
  it("ປະຕິເສດ segment/sort ທີ່ບໍ່ຮູ້ຈັກ ແລະ pageSize > 100", () => {
    expect(crmCustomerListQuerySchema.safeParse({ segment: "VIP" }).success).toBe(false);
    expect(crmCustomerListQuerySchema.safeParse({ sort: "name" }).success).toBe(false);
    expect(crmCustomerListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
  it("ມີ 6 ກຸ່ມ", () => {
    expect(RFM_SEGMENTS).toEqual(["CHAMPION", "LOYAL", "NEW", "AT_RISK", "LOST", "REGULAR"]);
  });
});

describe("updateCustomerSchema", () => {
  it("trim ແລະ ແປງຄ່າເປົ່າເປັນ null", () => {
    expect(updateCustomerSchema.parse({ name: " ມະລິ ", phone: "", email: "", note: "  " })).toEqual({ name: "ມະລິ", phone: null, email: null, note: null });
  });
  it("ຮັບເບີ ແລະ ອີເມວທີ່ຖືກຕ້ອງ", () => {
    expect(updateCustomerSchema.parse({ phone: "02055550001", email: "a@b.co" })).toEqual({ phone: "02055550001", email: "a@b.co" });
  });
  it("ປະຕິເສດ: ບໍ່ມີ field, ຊື່ເປົ່າ, ເບີຜິດ, ອີເມວຜິດ, field ແປກ", () => {
    for (const body of [{}, { name: " " }, { phone: "abc" }, { email: "nope" }, { tier: "GOLD" }]) {
      expect(updateCustomerSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("mergeCustomerSchema", () => {
  it("ຕ້ອງມີ sourceId", () => {
    expect(mergeCustomerSchema.parse({ sourceId: "c1" })).toEqual({ sourceId: "c1" });
    expect(mergeCustomerSchema.safeParse({}).success).toBe(false);
    expect(mergeCustomerSchema.safeParse({ sourceId: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/shared exec vitest run src/schemas/crm.test.ts` → FAIL (module not found).

- [ ] **Step 3: implement** — create `packages/shared/src/schemas/crm.ts`:

```ts
import { z } from "zod";

/** ກຸ່ມ RFM (ລຳດັບ = ລຳດັບການສະແດງ). ກົດການຈັດກຸ່ມຢູ່ໃນ SQL ຂອງ API (customer-stats.sql.ts) */
export const RFM_SEGMENTS = ["CHAMPION", "LOYAL", "NEW", "AT_RISK", "LOST", "REGULAR"] as const;
export type RfmSegment = (typeof RFM_SEGMENTS)[number];

export const CRM_CUSTOMER_SORTS = ["lastOrder", "spent", "created"] as const;
export type CrmCustomerSort = (typeof CRM_CUSTOMER_SORTS)[number];

const pageShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const crmCustomerListQuerySchema = z.object({
  ...pageShape,
  q: z.string().trim().max(100).optional(),
  segment: z.enum(RFM_SEGMENTS).optional(),
  sort: z.enum(CRM_CUSTOMER_SORTS).default("lastOrder"),
});
export type CrmCustomerListQuery = z.infer<typeof crmCustomerListQuerySchema>;

export const crmPageQuerySchema = z.object(pageShape);
export type CrmPageQuery = z.infer<typeof crmPageQuerySchema>;

const PHONE = /^\+?[0-9]{6,15}$/;
/** ຄ່າເປົ່າ = ລ້າງ field (null) */
const blankToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const updateCustomerSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    phone: blankToNull(16)
      .refine((value) => value === null || PHONE.test(value), "ເບີໂທບໍ່ຖືກຕ້ອງ")
      .optional(),
    email: blankToNull(200)
      .refine((value) => value === null || z.email().safeParse(value).success, "ອີເມວບໍ່ຖືກຕ້ອງ")
      .optional(),
    note: blankToNull(500).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "ຕ້ອງມີຢ່າງໜ້ອຍ 1 field");
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const mergeCustomerSchema = z.strictObject({ sourceId: z.string().min(1) });
export type MergeCustomerInput = z.infer<typeof mergeCustomerSchema>;
```

Add `export * from "./schemas/crm";` at the end of `packages/shared/src/index.ts`.

In `packages/shared/src/error-codes.ts` append to `ERROR_CODES` (after `"FLASH_SALE_PRICE_INVALID",`):

```ts
  // crm
  "CUSTOMER_PHONE_TAKEN",
```

In `apps/api/src/common/api-error.ts` add to `STATUS_BY_CODE`: `CUSTOMER_PHONE_TAKEN: HttpStatus.CONFLICT,`.

In `apps/admin/src/lib/i18n/dictionary.ts` add next to the existing `error.CUSTOMER_NOT_FOUND` lines: lo `"error.CUSTOMER_PHONE_TAKEN": "ເບີນີ້ເປັນຂອງລູກຄ້າຄົນອື່ນແລ້ວ",` and en `"error.CUSTOMER_PHONE_TAKEN": "This phone number already belongs to another customer",`.

- [ ] **Step 4:** `pnpm --filter @oca/shared test` → PASS (all).

- [ ] **Step 5: schema + migration.** In `schema.prisma` `model Customer`, after `facebookUserId`: `note           String? // ບັນທຶກພາຍໃນຂອງແອດມິນ (CRM)`. Create `packages/database/prisma/migrations/20261012000000_crm/migration.sql`:

```sql
-- CRM (3d D1): ບັນທຶກພາຍໃນຕໍ່ລູກຄ້າ
ALTER TABLE "Customer" ADD COLUMN "note" TEXT;
```

Run `pnpm --filter @oca/database db:validate && pnpm --filter @oca/database db:generate` → no errors. Run `pnpm --filter @oca/shared build` so dependants see the new exports.

- [ ] **Step 6:** `pnpm --filter @oca/admin exec vitest run src/lib/errors.test.ts src/lib/i18n` → PASS. Commit: `feat(crm): customer note column, CRM schemas and CUSTOMER_PHONE_TAKEN`.

---

### Task 2: API list, segment summary and RFM

**Files:** create `apps/api/src/modules/crm/customer-stats.sql.ts`, `crm-customers.service.ts`, `crm-customers.controller.ts`, `apps/api/test/crm-fixtures.ts`, `apps/api/test/crm-customers.e2e.test.ts`; modify `crm.module.ts`.

- [ ] **Step 1: fixture** — `apps/api/test/crm-fixtures.ts`:

```ts
import type { OrderStatus, PrismaClient } from "@oca/database";

const DAY_MS = 24 * 60 * 60 * 1000;
let sequence = 0;

/** ບິນສຳເລັດຮູບຂອງລູກຄ້າ (ຂ້າມ stock engine): ໃຊ້ທົດສອບສະຖິຕິ/RFM. paidDaysAgo = ອາຍຸຂອງ paidAt */
export async function seedCustomerOrder(
  db: PrismaClient,
  customerId: string,
  options: { subtotal?: string; paidDaysAgo?: number; status?: OrderStatus } = {},
) {
  sequence += 1;
  const status = options.status ?? "COMPLETED";
  const subtotal = options.subtotal ?? "100.00";
  const paid = ["PAID", "PACKING", "SHIPPED", "COMPLETED"].includes(status);
  const paidAt = paid ? new Date(Date.now() - (options.paidDaysAgo ?? 0) * DAY_MS) : null;
  return db.order.create({
    data: {
      orderNumber: `CRM-${String(sequence).padStart(5, "0")}`,
      customerId,
      channel: "OFFLINE",
      source: "MANUAL",
      status,
      currency: "LAK",
      subtotal,
      vatRate: "0",
      vatAmount: "0",
      total: subtotal,
      paidAt,
      createdAt: paidAt ?? new Date(),
    },
  });
}

/** ຫຼາຍບິນ: ບິນຫຼ້າສຸດອາຍຸ lastDaysAgo, ບິນກ່ອນໜ້າເກົ່າຂຶ້ນບິນລະ 1 ມື້ */
export async function seedCustomerOrders(db: PrismaClient, customerId: string, count: number, lastDaysAgo: number, subtotal = "100.00") {
  for (let index = 0; index < count; index += 1) {
    await seedCustomerOrder(db, customerId, { subtotal, paidDaysAgo: lastDaysAgo + index });
  }
}
```

- [ ] **Step 2: failing test** — `apps/api/test/crm-customers.e2e.test.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCustomerOrder, seedCustomerOrders } from "./crm-fixtures";
import { bearerFor, createTestApp, resetDb, seedRoleUsers } from "./helpers";

describe("crm customers (e2e)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let manager: { Authorization: string };
  let chat: { Authorization: string };
  let warehouse: { Authorization: string };
  const server = () => app.getHttpServer();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
    manager = await bearerFor(app, "manager@role.test");
    chat = await bearerFor(app, "chat_admin@role.test");
    warehouse = await bearerFor(app, "warehouse@role.test");
  });

  /** ລູກຄ້າ 7 ຄົນ ກວມທຸກກຸ່ມ. ຍອດຊື້: A 10000, D 2000, B 900, F 400, C 50, E 40 */
  async function seedSegments() {
    const make = async (key: string, name: string, phone: string | null) => {
      const row = await db.customer.create({ data: { name, phone } });
      ids[key] = row.id;
      return row.id;
    };
    await seedCustomerOrders(db, await make("A", "Anou Champion", "02055550001"), 10, 5, "1000.00"); // R5 F5 M5
    await seedCustomerOrders(db, await make("B", "Bounmy Loyal", "02055550002"), 3, 80, "300.00"); // R3 F3
    await seedCustomerOrders(db, await make("C", "Chan New", "02055550003"), 1, 10, "50.00"); // R5 F1
    await seedCustomerOrders(db, await make("D", "Deng Risk", "02055550004"), 4, 150, "500.00"); // R2 F3
    await seedCustomerOrders(db, await make("E", "Eak Lost", "02055550005"), 1, 400, "40.00"); // R1 F1 M1
    await seedCustomerOrders(db, await make("F", "Fa Regular", "02055550006"), 2, 70, "200.00"); // R3 F2
    const g = await make("G", "Gai Prospect", null);
    await seedCustomerOrder(db, g, { status: "PENDING_PAYMENT" });
    await seedCustomerOrder(db, g, { status: "CANCELLED" });
  }
  const list = (query = "", auth = manager) => request(server()).get(`/crm/customers${query}`).set(auth);

  describe("GET /crm/customers", () => {
    beforeEach(seedSegments);

    it("ສະຖິຕິ ແລະ ກຸ່ມ RFM ຂອງແຕ່ລະຄົນ; ບິນຄ້າງຈ່າຍ/ຍົກເລີກບໍ່ນັບ", async () => {
      const res = await list("?pageSize=50").expect(200);
      expect(res.body).toMatchObject({ total: 7, page: 1, pageSize: 50 });
      const byName = Object.fromEntries(res.body.items.map((row: { name: string }) => [row.name.split(" ")[0], row]));
      expect(byName.Anou).toMatchObject({ orderCount: 10, totalSpent: "10000.00", segment: "CHAMPION", phone: "02055550001" });
      expect(byName.Bounmy).toMatchObject({ orderCount: 3, totalSpent: "900.00", segment: "LOYAL" });
      expect(byName.Chan).toMatchObject({ orderCount: 1, segment: "NEW" });
      expect(byName.Deng).toMatchObject({ orderCount: 4, segment: "AT_RISK" });
      expect(byName.Eak).toMatchObject({ orderCount: 1, segment: "LOST" });
      expect(byName.Fa).toMatchObject({ orderCount: 2, segment: "REGULAR" });
      expect(byName.Gai).toMatchObject({ orderCount: 0, totalSpent: "0.00", lastPaidAt: null, segment: null });
      expect(typeof byName.Anou.lastPaidAt).toBe("string");
    });

    it("ລຽງ: lastOrder (ຄ່າເລີ່ມ, ບໍ່ເຄີຍຊື້ຢູ່ທ້າຍ), spent, created", async () => {
      const names = async (query: string) => (await list(query).expect(200)).body.items.map((row: { name: string }) => row.name.split(" ")[0]);
      expect(await names("")).toEqual(["Anou", "Chan", "Fa", "Bounmy", "Deng", "Eak", "Gai"]);
      expect(await names("?sort=spent")).toEqual(["Anou", "Deng", "Bounmy", "Fa", "Chan", "Eak", "Gai"]);
      expect((await names("?sort=created"))[0]).toBe("Gai");
    });

    it("ຄົ້ນຊື່ (ບໍ່ສົນຕົວພິມ) ຫຼື ເບີ; ກັ່ນຕອງກຸ່ມ; ແບ່ງໜ້າ", async () => {
      expect((await list("?q=deng").expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([ids.D]);
      expect((await list("?q=5550003").expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([ids.C]);
      // ຕົວອັກສອນພິເສດຂອງ LIKE ບໍ່ຖືກຕີຄວາມເປັນ wildcard
      expect((await list("?q=%25").expect(200)).body.total).toBe(0);
      const risk = await list("?segment=AT_RISK").expect(200);
      expect(risk.body).toMatchObject({ total: 1 });
      expect(risk.body.items[0].id).toBe(ids.D);
      const page2 = await list("?pageSize=3&page=2").expect(200);
      expect(page2.body).toMatchObject({ total: 7, page: 2, pageSize: 3 });
      expect(page2.body.items).toHaveLength(3);
    });

    it("query ຜິດ → 400", async () => {
      await list("?segment=VIP").expect(400);
      await list("?sort=name").expect(400);
    });
  });

  describe("GET /crm/customers/segments", () => {
    it("ຈຳນວນຕໍ່ກຸ່ມ + ຄົນທີ່ຍັງບໍ່ເຄີຍຊື້", async () => {
      await seedSegments();
      const res = await request(server()).get("/crm/customers/segments").set(manager).expect(200);
      expect(res.body).toEqual({ total: 7, noOrders: 1, segments: { CHAMPION: 1, LOYAL: 1, NEW: 1, AT_RISK: 1, LOST: 1, REGULAR: 1 } });
    });
    it("ບໍ່ມີລູກຄ້າ: ທຸກຄ່າເປັນ 0", async () => {
      const res = await request(server()).get("/crm/customers/segments").set(manager).expect(200);
      expect(res.body).toEqual({ total: 0, noOrders: 0, segments: { CHAMPION: 0, LOYAL: 0, NEW: 0, AT_RISK: 0, LOST: 0, REGULAR: 0 } });
    });
  });

  describe("ສິດ", () => {
    it("crm:read ອ່ານໄດ້; ບໍ່ມີ crm:read → 403; ບໍ່ login → 401", async () => {
      await list("", chat).expect(200);
      await list("", warehouse).expect(403);
      await request(server()).get("/crm/customers").expect(401);
      await request(server()).get("/crm/customers/segments").set(warehouse).expect(403);
    });
  });
});
```

- [ ] **Step 3:** `OCA_TEST_DB_NAME=oca_test_crm pnpm --filter @oca/api exec vitest run test/crm-customers.e2e.test.ts` → FAIL (404s).

- [ ] **Step 4: the CTE** — `apps/api/src/modules/crm/customer-stats.sql.ts`:

```ts
import { Prisma } from "@oca/database";

/**
 * ຈຸດດຽວຂອງສະຖິຕິ ແລະ RFM ຕໍ່ລູກຄ້າ (spec 3d §2). CTE `rfm` ມີແຖວສະເພາະລູກຄ້າທີ່ມີບິນທີ່ນັບ >= 1.
 *   R: ມື້ນັບຈາກບິນຫຼ້າສຸດ  <=30:5  <=60:4  <=90:3  <=180:2  ອື່ນ:1
 *   F: ຈຳນວນບິນ            >=10:5  >=5:4   >=3:3   2:2      1:1
 *   M: ceil(CUME_DIST ຂອງຍອດຊື້ x 5): ທຽບກັບລູກຄ້າຄົນອື່ນ, ຍອດເທົ່າກັນໄດ້ຄະແນນເທົ່າກັນ
 * ກຸ່ມ = ກົດທຳອິດທີ່ກົງ. ຜູ້ໃຊ້ຕ້ອງຕໍ່ທ້າຍດ້ວຍ SELECT ... FROM rfm (ຫຼື JOIN ກັບ "Customer").
 */
export function customerStatsCte(now: Date): Prisma.Sql {
  return Prisma.sql`
    WITH stats AS (
      SELECT o."customerId" AS id,
             COUNT(*)::int AS "orderCount",
             SUM(o."subtotal") AS "totalSpent",
             MIN(o."paidAt") AS "firstPaidAt",
             MAX(o."paidAt") AS "lastPaidAt"
      FROM "Order" o
      WHERE o."customerId" IS NOT NULL AND o."status" IN ('PAID', 'PACKING', 'SHIPPED', 'COMPLETED')
      GROUP BY o."customerId"
    ),
    scored AS (
      SELECT s.*,
             CASE
               WHEN s."lastPaidAt" >= ${now}::timestamp - INTERVAL '30 days' THEN 5
               WHEN s."lastPaidAt" >= ${now}::timestamp - INTERVAL '60 days' THEN 4
               WHEN s."lastPaidAt" >= ${now}::timestamp - INTERVAL '90 days' THEN 3
               WHEN s."lastPaidAt" >= ${now}::timestamp - INTERVAL '180 days' THEN 2
               ELSE 1
             END AS r,
             CASE
               WHEN s."orderCount" >= 10 THEN 5
               WHEN s."orderCount" >= 5 THEN 4
               WHEN s."orderCount" >= 3 THEN 3
               WHEN s."orderCount" = 2 THEN 2
               ELSE 1
             END AS f,
             CEIL(CUME_DIST() OVER (ORDER BY s."totalSpent") * 5)::int AS m
      FROM stats s
    ),
    rfm AS (
      SELECT sc.*,
             CASE
               WHEN sc.r >= 4 AND sc.f >= 4 AND sc.m >= 4 THEN 'CHAMPION'
               WHEN sc.r >= 3 AND sc.f >= 3 THEN 'LOYAL'
               WHEN sc.r >= 4 AND sc.f = 1 THEN 'NEW'
               WHEN sc.r <= 2 AND (sc.f >= 3 OR sc.m >= 4) THEN 'AT_RISK'
               WHEN sc.r = 1 THEN 'LOST'
               ELSE 'REGULAR'
             END AS segment
      FROM scored sc
    )`;
}
```

- [ ] **Step 5: service (list + segments)** — `apps/api/src/modules/crm/crm-customers.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@oca/database";
import { type CrmCustomerListQuery, RFM_SEGMENTS, type RfmSegment } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { money } from "../../common/money";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import { customerStatsCte } from "./customer-stats.sql";

export interface CrmCustomerListItemDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  /** ບິນທີ່ນັບ (PAID..COMPLETED) */
  orderCount: number;
  totalSpent: string;
  lastPaidAt: Date | null;
  /** null = ຍັງບໍ່ເຄີຍຊື້ */
  segment: RfmSegment | null;
}

export interface CrmSegmentSummaryDto {
  total: number;
  noOrders: number;
  segments: Record<RfmSegment, number>;
}

interface ListRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  orderCount: number | null;
  totalSpent: Prisma.Decimal | null;
  lastPaidAt: Date | null;
  segment: RfmSegment | null;
}

const ZERO = new Prisma.Decimal(0);

const ORDER_BY: Record<CrmCustomerListQuery["sort"], Prisma.Sql> = {
  lastOrder: Prisma.sql`r."lastPaidAt" DESC NULLS LAST, c."createdAt" DESC, c.id`,
  spent: Prisma.sql`COALESCE(r."totalSpent", 0) DESC, c."createdAt" DESC, c.id`,
  created: Prisma.sql`c."createdAt" DESC, c.id`,
};

function toListItem(row: ListRow): CrmCustomerListItemDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    createdAt: row.createdAt,
    orderCount: row.orderCount ?? 0,
    totalSpent: money(row.totalSpent ?? ZERO),
    lastPaidAt: row.lastPaidAt,
    segment: row.segment,
  };
}

/** Customer 360 (ໂມດູນ 11). ຄົ້ນລູກຄ້າສຳລັບຟອມເປີດບິນ ຍັງຢູ່ GET /customers ຂອງໂມດູນ orders */
@Injectable()
export class CrmCustomersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: CrmCustomerListQuery): Promise<Page<CrmCustomerListItemDto>> {
    const conditions: Prisma.Sql[] = [];
    if (query.q) {
      // position() ແທນ LIKE: ຄຳຄົ້ນບໍ່ຖືກຕີຄວາມເປັນ wildcard
      conditions.push(Prisma.sql`(position(lower(${query.q}) in lower(c."name")) > 0 OR position(${query.q} in COALESCE(c."phone", '')) > 0)`);
    }
    if (query.segment) conditions.push(Prisma.sql`r.segment = ${query.segment}`);
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
    const cte = customerStatsCte(new Date());
    const { skip, take } = pageArgs(query.page, query.pageSize);

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<ListRow[]>(Prisma.sql`
        ${cte}
        SELECT c.id, c."name", c."phone", c."email", c."createdAt",
               r."orderCount", r."totalSpent", r."lastPaidAt", r.segment
        FROM "Customer" c LEFT JOIN rfm r ON r.id = c.id
        ${where}
        ORDER BY ${ORDER_BY[query.sort]}
        LIMIT ${take} OFFSET ${skip}`),
      this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        ${cte}
        SELECT COUNT(*)::int AS total FROM "Customer" c LEFT JOIN rfm r ON r.id = c.id ${where}`),
    ]);
    return toPage(rows.map(toListItem), counted[0]?.total ?? 0, query.page, query.pageSize);
  }

  async segments(): Promise<CrmSegmentSummaryDto> {
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<{ segment: RfmSegment; count: number }[]>(Prisma.sql`
        ${customerStatsCte(new Date())}
        SELECT segment, COUNT(*)::int AS count FROM rfm GROUP BY segment`),
      this.prisma.customer.count(),
    ]);
    const segments = Object.fromEntries(RFM_SEGMENTS.map((segment) => [segment, 0])) as Record<RfmSegment, number>;
    for (const row of rows) segments[row.segment] = row.count;
    const withOrders = rows.reduce((sum, row) => sum + row.count, 0);
    return { total, noOrders: total - withOrders, segments };
  }
}
```

- [ ] **Step 6: controller + module.** `apps/api/src/modules/crm/crm-customers.controller.ts`:

```ts
import { Controller, Get, Inject, Query } from "@nestjs/common";
import { type CrmCustomerListQuery, crmCustomerListQuerySchema } from "@oca/shared";
import { RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CrmCustomersService } from "./crm-customers.service";

@Controller("crm/customers")
export class CrmCustomersController {
  constructor(@Inject(CrmCustomersService) private readonly customers: CrmCustomersService) {}

  @Get()
  @RequirePermissions("crm:read")
  list(@Query(new ZodValidationPipe(crmCustomerListQuerySchema)) query: CrmCustomerListQuery) {
    return this.customers.list(query);
  }

  // ຕ້ອງຢູ່ກ່ອນ route ":id" (Task 3)
  @Get("segments")
  @RequirePermissions("crm:read")
  segments() {
    return this.customers.segments();
  }
}
```

`crm.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { CrmCustomersController } from "./crm-customers.controller";
import { CrmCustomersService } from "./crm-customers.service";

/** ໂມດູນ 11 (CRM): Customer 360 + RFM. ແຕ້ມ/ລະດັບສະມາຊິກ ເພີ່ມໃນ D2 */
@Module({
  controllers: [CrmCustomersController],
  providers: [CrmCustomersService],
})
export class CrmModule {}
```

Check how `PromotionModule` gets `AuditService` (it does not import an audit module, so it is global); if the app fails to resolve `AuditService`, import the same module `PromotionModule`'s siblings use.

- [ ] **Step 7:** run the test file → PASS. If a segment assertion fails, print the row's `r/f/m` with a temporary query before changing any rule; the rules in the spec are the source of truth, the fixture is what should be adjusted.

- [ ] **Step 8:** `pnpm --filter @oca/api exec tsc --noEmit -p tsconfig.json && pnpm --filter @oca/api exec eslint src/modules/crm test/crm-customers.e2e.test.ts test/crm-fixtures.ts` → clean. Commit: `feat(api): CRM customer list with live RFM segments`.

---

### Task 3: API customer detail, orders and conversations

**Files:** modify `crm-customers.service.ts`, `crm-customers.controller.ts`, `crm-customers.e2e.test.ts`.

- [ ] **Step 1: failing tests** — add inside the top-level `describe` (import `seedConversation` from `./helpers`):

```ts
  describe("GET /crm/customers/:id", () => {
    it("ຂໍ້ມູນ + ສະຖິຕິ + ຄະແນນ R/F/M", async () => {
      await seedSegments();
      await db.customer.update({ where: { id: ids.A }, data: { note: "ມັກສີແດງ", facebookUserId: "FB_A" } });
      await seedCustomerOrder(db, ids.A, { status: "PENDING_PAYMENT" });
      await seedConversation(db, { customerId: ids.A });
      const res = await request(server()).get(`/crm/customers/${ids.A}`).set(chat).expect(200);
      expect(res.body).toMatchObject({
        id: ids.A,
        name: "Anou Champion",
        phone: "02055550001",
        email: null,
        note: "ມັກສີແດງ",
        facebookLinked: true,
        orderCount: 10,
        totalSpent: "10000.00",
        averageOrder: "1000.00",
        openOrderCount: 1,
        conversationCount: 1,
        segment: "CHAMPION",
        rfm: { recency: 5, frequency: 5, monetary: 5 },
      });
      expect(new Date(res.body.firstPaidAt).getTime()).toBeLessThan(new Date(res.body.lastPaidAt).getTime());
    });

    it("ຍັງບໍ່ເຄີຍຊື້: ສະຖິຕິ 0, segment/rfm null", async () => {
      await seedSegments();
      const res = await request(server()).get(`/crm/customers/${ids.G}`).set(manager).expect(200);
      expect(res.body).toMatchObject({ orderCount: 0, totalSpent: "0.00", averageOrder: "0.00", firstPaidAt: null, lastPaidAt: null, openOrderCount: 1, segment: null, rfm: null, facebookLinked: false });
    });

    it("ບໍ່ພົບ → 404 CUSTOMER_NOT_FOUND; ບໍ່ມີສິດ → 403", async () => {
      const res = await request(server()).get("/crm/customers/nope").set(manager).expect(404);
      expect(res.body.code).toBe("CUSTOMER_NOT_FOUND");
      await request(server()).get("/crm/customers/nope").set(warehouse).expect(403);
    });
  });

  describe("ແຖບຂອງລູກຄ້າ", () => {
    it("orders: ທຸກສະຖານະ ໃໝ່ສຸດກ່ອນ ແບ່ງໜ້າ", async () => {
      await seedSegments();
      const res = await request(server()).get(`/crm/customers/${ids.G}/orders`).set(manager).expect(200);
      expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
      expect(res.body.items.map((row: { status: string }) => row.status).sort()).toEqual(["CANCELLED", "PENDING_PAYMENT"]);
      expect(res.body.items[0]).toEqual({
        id: expect.any(String),
        orderNumber: expect.stringMatching(/^CRM-/),
        status: expect.any(String),
        channel: "OFFLINE",
        total: "100.00",
        createdAt: expect.any(String),
      });
      const paged = await request(server()).get(`/crm/customers/${ids.A}/orders?pageSize=4&page=3`).set(manager).expect(200);
      expect(paged.body).toMatchObject({ total: 10, page: 3, pageSize: 4 });
      expect(paged.body.items).toHaveLength(2);
    });

    it("conversations: ເຄສຂອງລູກຄ້າ ຫຼ້າສຸດກ່ອນ", async () => {
      await seedSegments();
      await seedConversation(db, { customerId: ids.B, displayName: "Old", lastMessageAt: new Date("2026-10-01T00:00:00Z") });
      await seedConversation(db, { customerId: ids.B, displayName: "Recent", lastMessageAt: new Date("2026-10-10T00:00:00Z"), lastMessagePreview: "ສະບາຍດີ" });
      await seedConversation(db, { customerId: ids.A });
      const res = await request(server()).get(`/crm/customers/${ids.B}/conversations`).set(manager).expect(200);
      expect(res.body.map((row: { displayName: string }) => row.displayName)).toEqual(["Recent", "Old"]);
      expect(res.body[0]).toMatchObject({ channel: "FACEBOOK", status: "OPEN", lastMessagePreview: "ສະບາຍດີ" });
    });

    it("ລູກຄ້າບໍ່ພົບ → 404", async () => {
      await request(server()).get("/crm/customers/nope/orders").set(manager).expect(404);
      await request(server()).get("/crm/customers/nope/conversations").set(manager).expect(404);
    });
  });
```

- [ ] **Step 2:** run the file → the new tests FAIL (404).

- [ ] **Step 3: service** — add imports `apiError` (`../../common/api-error`), `type CrmPageQuery` (`@oca/shared`), then add to `crm-customers.service.ts`:

```ts
export interface CrmCustomerDetailDto extends CrmCustomerListItemDto {
  note: string | null;
  /** ຜູກກັບບັນຊີ Facebook (ລູກຄ້າຈາກ CF) */
  facebookLinked: boolean;
  averageOrder: string;
  firstPaidAt: Date | null;
  /** ບິນ PENDING_PAYMENT */
  openOrderCount: number;
  conversationCount: number;
  /** ຄະແນນ 1–5; null = ຍັງບໍ່ເຄີຍຊື້ */
  rfm: { recency: number; frequency: number; monetary: number } | null;
}

export interface CrmCustomerOrderDto {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  total: string;
  createdAt: Date;
}

export interface CrmCustomerConversationDto {
  id: string;
  channel: string;
  displayName: string;
  status: string;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
}

interface StatsRow {
  orderCount: number;
  totalSpent: Prisma.Decimal;
  firstPaidAt: Date;
  lastPaidAt: Date;
  r: number;
  f: number;
  m: number;
  segment: RfmSegment;
}
```

and inside the class:

```ts
  async get(id: string): Promise<CrmCustomerDetailDto> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    const [stats, openOrderCount, conversationCount] = await Promise.all([
      this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
        ${customerStatsCte(new Date())}
        SELECT "orderCount", "totalSpent", "firstPaidAt", "lastPaidAt", r, f, m, segment FROM rfm WHERE id = ${id}`),
      this.prisma.order.count({ where: { customerId: id, status: "PENDING_PAYMENT" } }),
      this.prisma.conversation.count({ where: { customerId: id } }),
    ]);
    const row = stats[0];
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      createdAt: customer.createdAt,
      note: customer.note,
      facebookLinked: customer.facebookUserId !== null,
      orderCount: row?.orderCount ?? 0,
      totalSpent: money(row?.totalSpent ?? ZERO),
      averageOrder: money(row ? row.totalSpent.div(row.orderCount) : ZERO),
      firstPaidAt: row?.firstPaidAt ?? null,
      lastPaidAt: row?.lastPaidAt ?? null,
      openOrderCount,
      conversationCount,
      segment: row?.segment ?? null,
      rfm: row ? { recency: row.r, frequency: row.f, monetary: row.m } : null,
    };
  }

  async orders(id: string, query: CrmPageQuery): Promise<Page<CrmCustomerOrderDto>> {
    await this.requireCustomer(id);
    const where = { customerId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: { id: true, orderNumber: true, status: true, channel: true, total: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.order.count({ where }),
    ]);
    return toPage(
      rows.map((row) => ({ ...row, total: money(row.total) })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async conversations(id: string): Promise<CrmCustomerConversationDto[]> {
    await this.requireCustomer(id);
    return this.prisma.conversation.findMany({
      where: { customerId: id },
      select: { id: true, channel: true, displayName: true, status: true, lastMessageAt: true, lastMessagePreview: true },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: 50,
    });
  }

  private async requireCustomer(id: string): Promise<void> {
    const found = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
  }
```

- [ ] **Step 4: controller** — add `Param` to the Nest import, `type CrmPageQuery, crmPageQuerySchema` to the shared import, and after `segments()`:

```ts
  @Get(":id")
  @RequirePermissions("crm:read")
  get(@Param("id") id: string) {
    return this.customers.get(id);
  }

  @Get(":id/orders")
  @RequirePermissions("crm:read")
  orders(@Param("id") id: string, @Query(new ZodValidationPipe(crmPageQuerySchema)) query: CrmPageQuery) {
    return this.customers.orders(id, query);
  }

  @Get(":id/conversations")
  @RequirePermissions("crm:read")
  conversations(@Param("id") id: string) {
    return this.customers.conversations(id);
  }
```

- [ ] **Step 5:** run the file → PASS. Commit: `feat(api): CRM customer detail, orders and conversations`.

---

### Task 4: API update and merge

**Files:** modify service, controller, e2e test.

- [ ] **Step 1: failing tests** — add:

```ts
  describe("PATCH /crm/customers/:id", () => {
    it("ແກ້ຊື່/ເບີ/ອີເມວ/ບັນທຶກ + audit; ຄ່າເປົ່າ = ລ້າງ", async () => {
      const row = await db.customer.create({ data: { name: "Old", phone: "02011111111", email: "old@x.co" } });
      const res = await request(server())
        .patch(`/crm/customers/${row.id}`)
        .set(manager)
        .send({ name: " ມະລິ ", phone: "02022222222", email: "", note: "ລູກຄ້າປະຈຳ" })
        .expect(200);
      expect(res.body).toMatchObject({ id: row.id, name: "ມະລິ", phone: "02022222222", email: null, note: "ລູກຄ້າປະຈຳ" });
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "customer.update", entityId: row.id } });
      expect(audit.before).toMatchObject({ name: "Old", phone: "02011111111" });
      expect(audit.after).toMatchObject({ name: "ມະລິ", phone: "02022222222" });
    });

    it("ເບີຊ້ຳກັບຄົນອື່ນ → 409 CUSTOMER_PHONE_TAKEN ພ້ອມ customerId; ເບີເດີມຂອງຕົນເອງ ຜ່ານ", async () => {
      const owner = await db.customer.create({ data: { name: "Owner", phone: "02033333333" } });
      const other = await db.customer.create({ data: { name: "Other", phone: "02044444444" } });
      const res = await request(server()).patch(`/crm/customers/${other.id}`).set(manager).send({ phone: "02033333333" }).expect(409);
      expect(res.body).toMatchObject({ code: "CUSTOMER_PHONE_TAKEN", customerId: owner.id });
      await request(server()).patch(`/crm/customers/${other.id}`).set(manager).send({ phone: "02044444444", name: "Other 2" }).expect(200);
    });

    it("body ຜິດ → 400; ບໍ່ພົບ → 404; crm:read ຢ່າງດຽວ → 403", async () => {
      const row = await db.customer.create({ data: { name: "X" } });
      await request(server()).patch(`/crm/customers/${row.id}`).set(manager).send({}).expect(400);
      await request(server()).patch(`/crm/customers/${row.id}`).set(manager).send({ phone: "abc" }).expect(400);
      await request(server()).patch("/crm/customers/nope").set(manager).send({ name: "Y" }).expect(404);
      await request(server()).patch(`/crm/customers/${row.id}`).set(chat).send({ name: "Y" }).expect(403);
    });
  });

  describe("POST /crm/customers/:id/merge", () => {
    it("ຍ້າຍບິນ + ແຊັດ, ເຕີມຊ່ອງທີ່ຫວ່າງຂອງ target, ລຶບ source, audit", async () => {
      const target = await db.customer.create({ data: { name: "ມະລິ (ເວັບ)", phone: "02055550001" } });
      const source = await db.customer.create({ data: { name: "Mali FB", facebookUserId: "FB_1", email: "mali@x.co", note: "ຈາກ Live" } });
      await seedCustomerOrders(db, target.id, 1, 3, "100.00");
      await seedCustomerOrders(db, source.id, 2, 5, "200.00");
      const conversation = await seedConversation(db, { customerId: source.id });

      const res = await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: source.id }).expect(200);
      expect(res.body).toMatchObject({
        id: target.id,
        name: "ມະລິ (ເວັບ)",
        phone: "02055550001",
        email: "mali@x.co",
        note: "ຈາກ Live",
        facebookLinked: true,
        orderCount: 3,
        totalSpent: "500.00",
        conversationCount: 1,
      });
      expect(await db.customer.findUnique({ where: { id: source.id } })).toBeNull();
      expect(await db.order.count({ where: { customerId: target.id } })).toBe(3);
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).customerId).toBe(target.id);
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "customer.merge", entityId: target.id } });
      expect(audit.before).toMatchObject({ source: { id: source.id, name: "Mali FB", facebookUserId: "FB_1" } });
      expect(audit.after).toMatchObject({ movedOrders: 2, movedConversations: 1 });
    });

    it("ທັງສອງມີເບີ/Facebook: target ຮັກສາຂອງຕົນ, ຂອງ source ຖືກຖິ້ມ", async () => {
      const target = await db.customer.create({ data: { name: "T", phone: "02011111111", facebookUserId: "FB_T", note: "T note" } });
      const source = await db.customer.create({ data: { name: "S", phone: "02022222222", facebookUserId: "FB_S", note: "S note" } });
      const res = await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: source.id }).expect(200);
      expect(res.body).toMatchObject({ phone: "02011111111", note: "T note" });
      expect((await db.customer.findUniqueOrThrow({ where: { id: target.id } })).facebookUserId).toBe("FB_T");
      // ເບີທີ່ຖືກຖິ້ມ ວ່າງໃຫ້ລູກຄ້າໃໝ່ໃຊ້ໄດ້
      expect(await db.customer.findUnique({ where: { phone: "02022222222" } })).toBeNull();
    });

    it("ລວມເຂົ້າຕົວເອງ → 400; ບໍ່ພົບ → 404; crm:read ຢ່າງດຽວ → 403; ລົ້ມ = ບໍ່ມີຫຍັງປ່ຽນ", async () => {
      const target = await db.customer.create({ data: { name: "T" } });
      await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: target.id }).expect(400);
      await request(server()).post(`/crm/customers/${target.id}/merge`).set(manager).send({ sourceId: "nope" }).expect(404);
      await request(server()).post("/crm/customers/nope/merge").set(manager).send({ sourceId: target.id }).expect(404);
      await request(server()).post(`/crm/customers/${target.id}/merge`).set(chat).send({ sourceId: "x" }).expect(403);
      expect(await db.customer.count()).toBe(1);
      expect(await db.auditLog.count({ where: { action: "customer.merge" } })).toBe(0);
    });
  });
```

- [ ] **Step 2:** run → new tests FAIL.

- [ ] **Step 3: service** — add imports: `BadRequestException` (`@nestjs/common`), `type Customer` (`@oca/database`), `type MergeCustomerInput, type UpdateCustomerInput` (`@oca/shared`), `type AuthUser` (`../../common/auth-types`), `isUniqueViolation` (`../../common/prisma-errors`). Add to the class:

```ts
  async update(id: string, input: UpdateCustomerInput, actor: AuthUser, ip: string | undefined): Promise<CrmCustomerDetailDto> {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    if (input.phone) {
      const owner = await this.prisma.customer.findUnique({ where: { phone: input.phone }, select: { id: true } });
      if (owner && owner.id !== id) throw phoneTaken(owner.id);
    }
    let row: Customer;
    try {
      row = await this.prisma.customer.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
    } catch (error) {
      // ແຂ່ງກັບຄຳຂໍອື່ນທີ່ເອົາເບີດຽວກັນ ລະຫວ່າງກວດ ແລະ ບັນທຶກ
      if (isUniqueViolation(error)) throw phoneTaken(undefined);
      throw error;
    }
    await this.audit.record({ userId: actor.id, action: "customer.update", entity: "Customer", entityId: id, before: auditOf(existing), after: auditOf(row), ip });
    return this.get(id);
  }

  /** ລວມ source ເຂົ້າ target: ຍ້າຍບິນ + ແຊັດ, ເຕີມຊ່ອງທີ່ target ຍັງຫວ່າງ, ລຶບ source (spec 3d §2) */
  async merge(targetId: string, input: MergeCustomerInput, actor: AuthUser, ip: string | undefined): Promise<CrmCustomerDetailDto> {
    if (input.sourceId === targetId) throw new BadRequestException("Cannot merge a customer into itself");
    const result = await this.prisma.$transaction(async (tx) => {
      // ລັອກທັງສອງແຖວຕາມລຳດັບ id: ການລວມສອງທິດທາງພ້ອມກັນບໍ່ deadlock
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id IN (${targetId}, ${input.sourceId}) ORDER BY id FOR UPDATE`;
      const target = await tx.customer.findUnique({ where: { id: targetId } });
      const source = await tx.customer.findUnique({ where: { id: input.sourceId } });
      if (!target || !source) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");

      const orders = await tx.order.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
      const conversations = await tx.conversation.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
      // ລຶບ source ກ່ອນ ເພື່ອປ່ອຍ unique (phone, facebookUserId) ໃຫ້ target ຮັບໄດ້
      await tx.customer.delete({ where: { id: source.id } });
      await tx.customer.update({
        where: { id: target.id },
        data: {
          phone: target.phone ?? source.phone,
          email: target.email ?? source.email,
          facebookUserId: target.facebookUserId ?? source.facebookUserId,
          note: target.note ?? source.note,
        },
      });
      return { source, movedOrders: orders.count, movedConversations: conversations.count };
    });
    await this.audit.record({
      userId: actor.id,
      action: "customer.merge",
      entity: "Customer",
      entityId: targetId,
      before: { source: { id: result.source.id, ...auditOf(result.source), facebookUserId: result.source.facebookUserId } },
      after: { movedOrders: result.movedOrders, movedConversations: result.movedConversations },
      ip,
    });
    return this.get(targetId);
  }
```

and at module level:

```ts
function phoneTaken(customerId: string | undefined) {
  return apiError("CUSTOMER_PHONE_TAKEN", "Phone number belongs to another customer", customerId ? { customerId } : {});
}

function auditOf(row: Customer) {
  return { name: row.name, phone: row.phone, email: row.email, note: row.note };
}
```

- [ ] **Step 4: controller** — extend imports (`Body, HttpCode, Patch, Post, Req`; `mergeCustomerSchema, updateCustomerSchema` + types; `Request` from express; `AuthUser`; `CurrentUser`) and add:

```ts
  @Patch(":id")
  @RequirePermissions("crm:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.update(id, body, actor, req.ip);
  }

  @Post(":id/merge")
  @HttpCode(200)
  @RequirePermissions("crm:write")
  merge(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(mergeCustomerSchema)) body: MergeCustomerInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.merge(id, body, actor, req.ip);
  }
```

- [ ] **Step 5:** run the file → PASS. Then the whole API suite: `OCA_TEST_DB_NAME=oca_test_crm pnpm --filter @oca/api test` → PASS (was 754 before this plan; expect 754 + new). tsc + eslint clean. Commit: `feat(api): edit and merge customers`.

---

### Task 5: Admin data layer, strings, menu

**Files:** `apps/admin/src/lib/types.ts`, `queries.ts`, `i18n/crm-dictionary.ts` (create), `i18n/dictionary.ts`, `nav.ts`, `nav.test.ts`, `components/customers/segment.ts` (create).

- [ ] **Step 1: nav test first.** In `nav.test.ts`: change `expect(visibleNavGroups(["crm:read"])).toEqual([]);` to

```ts
    expect(visibleNavGroups(["payments:read"])).toEqual([]);
  });

  it("crm:read ເຫັນກຸ່ມລູກຄ້າ", () => {
    const groups = visibleNavGroups(["crm:read"]);
    expect(groups.map((group) => group.id)).toEqual(["customers"]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(["/customers"]);
```

and the last test's `expect(firstAllowedHref(["crm:read", "payments:read"])).toBeNull();` to `expect(firstAllowedHref(["payments:read", "costs:read"])).toBeNull();`. Run `pnpm --filter @oca/admin exec vitest run src/lib/nav.test.ts` → FAIL.

- [ ] **Step 2: nav.** In `nav.ts` import `Contact` from `lucide-react` and insert after the `live` group:

```ts
  {
    id: "customers",
    labelKey: "nav.group.customers",
    items: [{ href: "/customers", labelKey: "nav.customers", icon: Contact, permission: "crm:read" }],
  },
```

- [ ] **Step 3: strings.** Create `apps/admin/src/lib/i18n/crm-dictionary.ts`:

```ts
// ຂໍ້ຄວາມຂອງ CRM (ແຍກໄຟລ໌ຄືກັບ posts-dictionary.ts; ລວມເຂົ້າ `lo`/`en` ໃນ dictionary.ts)

export const crmLo = {
  "nav.group.customers": "ລູກຄ້າ",
  "nav.customers": "ລູກຄ້າ",

  "customers.title": "ລູກຄ້າ",
  "customers.description": "ລູກຄ້າທຸກຊ່ອງທາງ ພ້ອມຍອດຊື້ ແລະ ກຸ່ມຕາມພຶດຕິກຳການຊື້ (RFM)",
  "customers.count": "{count} ຄົນ",
  "customers.found": "ພົບ {count} ຄົນ",
  "customers.search": "ຄົ້ນຫາຊື່ ຫຼື ເບີໂທ...",
  "customers.table": "ລາຍຊື່ລູກຄ້າ",
  "customers.segments.label": "ກັ່ນຕອງຕາມກຸ່ມ",
  "customers.segments.all": "ທັງໝົດ",
  "customers.sort": "ລຽງຕາມ",
  "customers.sort.lastOrder": "ຊື້ຫຼ້າສຸດ",
  "customers.sort.spent": "ຍອດຊື້ສູງສຸດ",
  "customers.sort.created": "ເພີ່ມຫຼ້າສຸດ",
  "customers.col.customer": "ລູກຄ້າ",
  "customers.col.segment": "ກຸ່ມ",
  "customers.col.orders": "ບິນ",
  "customers.col.spent": "ຍອດຊື້",
  "customers.col.lastOrder": "ຊື້ຫຼ້າສຸດ",
  "customers.noPhone": "ບໍ່ມີເບີ",
  "customers.never": "ຍັງບໍ່ເຄີຍຊື້",
  "customers.empty.title": "ຍັງບໍ່ມີລູກຄ້າ",
  "customers.empty.noResults": "ບໍ່ພົບລູກຄ້າທີ່ກົງກັບເງື່ອນໄຂ",
  "customers.segment.CHAMPION": "ຊັ້ນຍອດ",
  "customers.segment.LOYAL": "ຂາປະຈຳ",
  "customers.segment.NEW": "ລູກຄ້າໃໝ່",
  "customers.segment.AT_RISK": "ສ່ຽງຫາຍ",
  "customers.segment.LOST": "ຫາຍໄປ",
  "customers.segment.REGULAR": "ທົ່ວໄປ",

  "customers.detail.back": "ກັບໄປລາຍຊື່ລູກຄ້າ",
  "customers.detail.profile": "ຂໍ້ມູນລູກຄ້າ",
  "customers.detail.phone": "ເບີໂທ",
  "customers.detail.email": "ອີເມວ",
  "customers.detail.note": "ບັນທຶກ",
  "customers.detail.since": "ເປັນລູກຄ້າຕັ້ງແຕ່",
  "customers.detail.facebook": "ຜູກກັບ Facebook",
  "customers.detail.none": "—",
  "customers.detail.stats": "ສະຖິຕິການຊື້",
  "customers.detail.totalSpent": "ຍອດຊື້ລວມ",
  "customers.detail.orderCount": "ບິນທີ່ຈ່າຍແລ້ວ",
  "customers.detail.averageOrder": "ສະເລ່ຍຕໍ່ບິນ",
  "customers.detail.lastPaid": "ຊື້ຫຼ້າສຸດ",
  "customers.detail.firstPaid": "ຊື້ຄັ້ງທຳອິດ",
  "customers.detail.openOrders": "ບິນຄ້າງຈ່າຍ",
  "customers.detail.rfm": "ຄະແນນ RFM",
  "customers.detail.rfm.recency": "ຄວາມໃໝ່ (R)",
  "customers.detail.rfm.frequency": "ຄວາມຖີ່ (F)",
  "customers.detail.rfm.monetary": "ຍອດເງິນ (M)",
  "customers.detail.rfmHint": "ຄະແນນ 1–5; 5 ດີທີ່ສຸດ",
  "customers.detail.tabs": "ປະຫວັດຂອງລູກຄ້າ",
  "customers.detail.tab.orders": "ບິນ ({count})",
  "customers.detail.tab.conversations": "ແຊັດ ({count})",
  "customers.detail.orders.table": "ບິນຂອງລູກຄ້າ",
  "customers.detail.orders.empty": "ລູກຄ້ານີ້ຍັງບໍ່ມີບິນ",
  "customers.detail.conversations.empty": "ລູກຄ້ານີ້ຍັງບໍ່ມີແຊັດ",
  "customers.detail.conversations.open": "ເປີດແຊັດ",
  "customers.detail.notFound": "ບໍ່ພົບລູກຄ້ານີ້ (ອາດຖືກລວມເຂົ້າກັບລູກຄ້າຄົນອື່ນແລ້ວ)",

  "customers.edit": "ແກ້ໄຂຂໍ້ມູນ",
  "customers.edit.title": "ແກ້ໄຂຂໍ້ມູນລູກຄ້າ",
  "customers.edit.name": "ຊື່",
  "customers.edit.nameRequired": "ກະລຸນາໃສ່ຊື່",
  "customers.edit.phoneInvalid": "ເບີໂທຕ້ອງເປັນຕົວເລກ 6–15 ຫຼັກ",
  "customers.edit.emailInvalid": "ອີເມວບໍ່ຖືກຕ້ອງ",
  "customers.edit.phoneTaken": "ເບີນີ້ເປັນຂອງລູກຄ້າຄົນອື່ນແລ້ວ",
  "customers.edit.openOwner": "ເປີດລູກຄ້າຄົນນັ້ນ (ເພື່ອລວມ)",
  "customers.edit.saved": "ບັນທຶກຂໍ້ມູນລູກຄ້າແລ້ວ",

  "customers.merge": "ລວມລູກຄ້າ",
  "customers.merge.title": "ລວມລູກຄ້າຊ້ຳເຂົ້າ {name}",
  "customers.merge.description": "ບິນ ແລະ ແຊັດ ຂອງລູກຄ້າທີ່ເລືອກ ຈະຖືກຍ້າຍມາທີ່ນີ້ ແລ້ວລູກຄ້າຄົນນັ້ນຈະຖືກລຶບ",
  "customers.merge.search": "ຄົ້ນຫາລູກຄ້າທີ່ຊ້ຳ (ຊື່ ຫຼື ເບີ)",
  "customers.merge.results": "ຜົນການຄົ້ນຫາ",
  "customers.merge.noResults": "ບໍ່ພົບລູກຄ້າ",
  "customers.merge.pick": "ເລືອກ {name}",
  "customers.merge.summary": "ຈະຍ້າຍ {orders} ບິນ ຂອງ {name} ມາທີ່ {target}",
  "customers.merge.phoneDropped": "ທັງສອງມີເບີຕ່າງກັນ: ເບີ {phone} ຂອງ {name} ຈະຖືກຖິ້ມ",
  "customers.merge.irreversible": "ການລວມກູ້ຄືນບໍ່ໄດ້",
  "customers.merge.change": "ເລືອກຄົນອື່ນ",
  "customers.merge.confirm": "ຢືນຢັນການລວມ",
  "customers.merge.done": "ລວມລູກຄ້າແລ້ວ",
} as const;

export const crmEn: Record<keyof typeof crmLo, string> = {
  "nav.group.customers": "Customers",
  "nav.customers": "Customers",

  "customers.title": "Customers",
  "customers.description": "Customers from every channel with their spend and buying-behaviour segment (RFM)",
  "customers.count": "{count} customers",
  "customers.found": "{count} customers found",
  "customers.search": "Search name or phone...",
  "customers.table": "Customers",
  "customers.segments.label": "Filter by segment",
  "customers.segments.all": "All",
  "customers.sort": "Sort by",
  "customers.sort.lastOrder": "Last purchase",
  "customers.sort.spent": "Highest spend",
  "customers.sort.created": "Recently added",
  "customers.col.customer": "Customer",
  "customers.col.segment": "Segment",
  "customers.col.orders": "Orders",
  "customers.col.spent": "Spent",
  "customers.col.lastOrder": "Last purchase",
  "customers.noPhone": "No phone",
  "customers.never": "No purchase yet",
  "customers.empty.title": "No customers yet",
  "customers.empty.noResults": "No customers match these filters",
  "customers.segment.CHAMPION": "Champion",
  "customers.segment.LOYAL": "Loyal",
  "customers.segment.NEW": "New",
  "customers.segment.AT_RISK": "At risk",
  "customers.segment.LOST": "Lost",
  "customers.segment.REGULAR": "Regular",

  "customers.detail.back": "Back to customers",
  "customers.detail.profile": "Profile",
  "customers.detail.phone": "Phone",
  "customers.detail.email": "Email",
  "customers.detail.note": "Note",
  "customers.detail.since": "Customer since",
  "customers.detail.facebook": "Linked to Facebook",
  "customers.detail.none": "—",
  "customers.detail.stats": "Purchase stats",
  "customers.detail.totalSpent": "Total spent",
  "customers.detail.orderCount": "Paid orders",
  "customers.detail.averageOrder": "Average order",
  "customers.detail.lastPaid": "Last purchase",
  "customers.detail.firstPaid": "First purchase",
  "customers.detail.openOrders": "Unpaid orders",
  "customers.detail.rfm": "RFM score",
  "customers.detail.rfm.recency": "Recency (R)",
  "customers.detail.rfm.frequency": "Frequency (F)",
  "customers.detail.rfm.monetary": "Monetary (M)",
  "customers.detail.rfmHint": "Scores 1–5; 5 is best",
  "customers.detail.tabs": "Customer history",
  "customers.detail.tab.orders": "Orders ({count})",
  "customers.detail.tab.conversations": "Chats ({count})",
  "customers.detail.orders.table": "Customer orders",
  "customers.detail.orders.empty": "This customer has no orders yet",
  "customers.detail.conversations.empty": "This customer has no chats yet",
  "customers.detail.conversations.open": "Open chat",
  "customers.detail.notFound": "Customer not found (it may have been merged into another customer)",

  "customers.edit": "Edit profile",
  "customers.edit.title": "Edit customer",
  "customers.edit.name": "Name",
  "customers.edit.nameRequired": "Enter a name",
  "customers.edit.phoneInvalid": "Phone must be 6–15 digits",
  "customers.edit.emailInvalid": "Email is not valid",
  "customers.edit.phoneTaken": "This phone number already belongs to another customer",
  "customers.edit.openOwner": "Open that customer (to merge)",
  "customers.edit.saved": "Customer saved",

  "customers.merge": "Merge customer",
  "customers.merge.title": "Merge a duplicate into {name}",
  "customers.merge.description": "The selected customer's orders and chats move here, then that customer is deleted",
  "customers.merge.search": "Search the duplicate (name or phone)",
  "customers.merge.results": "Search results",
  "customers.merge.noResults": "No customers found",
  "customers.merge.pick": "Select {name}",
  "customers.merge.summary": "{orders} orders of {name} will move to {target}",
  "customers.merge.phoneDropped": "Both have different phone numbers: {phone} of {name} will be dropped",
  "customers.merge.irreversible": "Merging cannot be undone",
  "customers.merge.change": "Choose another",
  "customers.merge.confirm": "Confirm merge",
  "customers.merge.done": "Customers merged",
};
```

In `dictionary.ts`: `import { crmEn, crmLo } from "./crm-dictionary";`, add `...crmLo,` after `...postsLo,` in `lo` and `...crmEn,` after the posts spread in `en`.

- [ ] **Step 4: types.** Append to `apps/admin/src/lib/types.ts` (import `RfmSegment` type from `@oca/shared` at the top with the other shared types):

```ts
// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
export interface CrmCustomerListItemDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  orderCount: number;
  totalSpent: string;
  lastPaidAt: string | null;
  segment: RfmSegment | null;
}

export interface CrmCustomerDetailDto extends CrmCustomerListItemDto {
  note: string | null;
  facebookLinked: boolean;
  averageOrder: string;
  firstPaidAt: string | null;
  openOrderCount: number;
  conversationCount: number;
  rfm: { recency: number; frequency: number; monetary: number } | null;
}

export interface CrmSegmentSummaryDto {
  total: number;
  noOrders: number;
  segments: Record<RfmSegment, number>;
}

export interface CrmCustomerOrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  channel: SalesChannel;
  total: string;
  createdAt: string;
}

export interface CrmCustomerConversationDto {
  id: string;
  channel: SalesChannel;
  displayName: string;
  status: ConversationStatus;
  lastMessageAt: string;
  lastMessagePreview: string | null;
}
```

- [ ] **Step 5: hooks.** In `queries.ts`: add `crmCustomers: ["crm-customers"] as const,` to `queryKeys`; add the five DTO types to the `./types` import and `CrmCustomerSort, RfmSegment, UpdateCustomerInput` to the `@oca/shared` type import; append:

```ts
// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
export interface CrmCustomerListParams {
  q?: string;
  segment?: RfmSegment | "";
  sort?: CrmCustomerSort;
  page: number;
  pageSize: number;
}

export function useCrmCustomers(params: CrmCustomerListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...queryKeys.crmCustomers, "list", params],
    queryFn: () => apiFetch<Page<CrmCustomerListItemDto>>(`/crm/customers${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useCrmSegments() {
  return useQuery({ queryKey: [...queryKeys.crmCustomers, "segments"], queryFn: () => apiFetch<CrmSegmentSummaryDto>("/crm/customers/segments") });
}

export function useCrmCustomer(id: string) {
  return useQuery({
    queryKey: [...queryKeys.crmCustomers, "detail", id],
    queryFn: () => apiFetch<CrmCustomerDetailDto>(`/crm/customers/${encodeURIComponent(id)}`),
    retry: false,
  });
}

export function useCrmCustomerOrders(id: string, params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: [...queryKeys.crmCustomers, "orders", id, params],
    queryFn: () => apiFetch<Page<CrmCustomerOrderDto>>(`/crm/customers/${encodeURIComponent(id)}/orders${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

export function useCrmCustomerConversations(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...queryKeys.crmCustomers, "conversations", id],
    queryFn: () => apiFetch<CrmCustomerConversationDto[]>(`/crm/customers/${encodeURIComponent(id)}/conversations`),
    enabled: options.enabled ?? true,
  });
}

/** ຊື່/ເບີຂອງລູກຄ້າຢູ່ໃນບິນ, ແຊັດ ແລະ ຕົວຄົ້ນລູກຄ້າ → invalidate ທັງໝົດ */
export function useUpdateCrmCustomer() {
  const invalidate = useInvalidate(queryKeys.crmCustomers, queryKeys.customers, queryKeys.orders, queryKeys.conversations);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) =>
      apiFetch<CrmCustomerDetailDto>(`/crm/customers/${encodeURIComponent(id)}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useMergeCrmCustomer() {
  const invalidate = useInvalidate(queryKeys.crmCustomers, queryKeys.customers, queryKeys.orders, queryKeys.conversations);
  return useMutation({
    mutationFn: ({ targetId, sourceId }: { targetId: string; sourceId: string }) =>
      apiFetch<CrmCustomerDetailDto>(`/crm/customers/${encodeURIComponent(targetId)}/merge`, { method: "POST", body: { sourceId } }),
    onSuccess: invalidate,
  });
}
```

Check `toQueryString` in `lib/query-string.ts` drops `""`/`undefined` values (the orders list relies on it with `status: ""`); if it does not, filter them in the hooks.

- [ ] **Step 6: segment tone** — `apps/admin/src/components/customers/segment.ts`:

```ts
import type { RfmSegment } from "@oca/shared";
import type { StatusTone } from "@oca/ui";

export const SEGMENT_TONE: Record<RfmSegment, StatusTone> = {
  CHAMPION: "success",
  LOYAL: "info",
  NEW: "info",
  AT_RISK: "warning",
  LOST: "neutral",
  REGULAR: "neutral",
};
```

- [ ] **Step 7:** `pnpm --filter @oca/admin exec vitest run src/lib` → PASS; `pnpm --filter @oca/admin typecheck` → clean. Commit: `feat(admin): CRM data hooks, strings and Customers menu`.

---

### Task 6: Admin customer list page

**Files:** create `components/customers/customer-list.tsx`, `customer-list.test.tsx`, `app/(app)/customers/page.tsx`.

- [ ] **Step 1: failing test** — `customer-list.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { CrmCustomerListItemDto, CrmSegmentSummaryDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CustomerList } from "./customer-list";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const items: CrmCustomerListItemDto[] = [
  { id: "c1", name: "Mali", phone: "02055550001", email: null, createdAt: "2026-09-01T00:00:00.000Z", orderCount: 12, totalSpent: "1250000.00", lastPaidAt: "2026-10-05T05:30:00.000Z", segment: "CHAMPION" },
  { id: "c2", name: "Kham", phone: null, email: null, createdAt: "2026-10-01T00:00:00.000Z", orderCount: 0, totalSpent: "0.00", lastPaidAt: null, segment: null },
];
const summary: CrmSegmentSummaryDto = { total: 9, noOrders: 2, segments: { CHAMPION: 1, LOYAL: 2, NEW: 1, AT_RISK: 3, LOST: 0, REGULAR: 0 } };

function mockApi(page: Page<CrmCustomerListItemDto> = { items, total: 2, page: 1, pageSize: 10 }) {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => (path.startsWith("/crm/customers/segments") ? summary : page)) as typeof apiFetch);
}
const listUrls = () => vi.mocked(apiFetch).mock.calls.map((call) => call[0]).filter((url) => !url.includes("/segments"));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("CustomerList", () => {
  it("ຕາຕະລາງ: ຊື່ (ລິ້ງ), ເບີ, ກຸ່ມ, ບິນ, ຍອດຊື້, ຊື້ຫຼ້າສຸດ", async () => {
    renderWithProviders(<CustomerList />);
    const first = await screen.findByTestId("row-customer-c1");
    expect(within(first).getByRole("link", { name: "Mali" })).toHaveAttribute("href", "/customers/c1");
    expect(within(first).getByText("02055550001")).toBeInTheDocument();
    expect(within(first).getByText("Champion")).toBeInTheDocument();
    expect(within(first).getByText("12")).toBeInTheDocument();
    expect(within(first).getByText("1,250,000.00")).toBeInTheDocument();
    expect(within(first).getByText("05/10/2026 12:30")).toBeInTheDocument();
    const second = screen.getByTestId("row-customer-c2");
    expect(within(second).getByText("No phone")).toBeInTheDocument();
    expect(within(second).getAllByText("No purchase yet").length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: "Customers" })).toBeInTheDocument();
    expect(listUrls()[0]).toBe("/crm/customers?sort=lastOrder&page=1&pageSize=10");
  });

  it("ປຸ່ມກຸ່ມສະແດງຈຳນວນ; ກົດເພື່ອກັ່ນຕອງ ແລະ ກົດຊ້ຳເພື່ອຍົກເລີກ", async () => {
    const { user } = renderWithProviders(<CustomerList />);
    const atRisk = await screen.findByRole("button", { name: "At risk 3" });
    expect(screen.getByRole("button", { name: "All 9" })).toHaveAttribute("aria-pressed", "true");
    await user.click(atRisk);
    await waitFor(() => expect(listUrls().at(-1)).toBe("/crm/customers?segment=AT_RISK&sort=lastOrder&page=1&pageSize=10"));
    expect(atRisk).toHaveAttribute("aria-pressed", "true");
    await user.click(atRisk);
    await waitFor(() => expect(listUrls().at(-1)).toBe("/crm/customers?sort=lastOrder&page=1&pageSize=10"));
  });

  it("ຄົ້ນຫາ (debounce) ແລະ ປ່ຽນການລຽງ ກັບໄປໜ້າ 1", async () => {
    mockApi({ items, total: 25, page: 1, pageSize: 10 });
    const { user } = renderWithProviders(<CustomerList />);
    await screen.findByTestId("row-customer-c1");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(listUrls().at(-1)).toContain("page=2"));
    await user.selectOptions(screen.getByLabelText("Sort by"), "spent");
    await waitFor(() => expect(listUrls().at(-1)).toBe("/crm/customers?sort=spent&page=1&pageSize=10"));
    await user.type(screen.getByLabelText("Search name or phone..."), "mali");
    await waitFor(() => expect(listUrls().at(-1)).toBe("/crm/customers?q=mali&sort=spent&page=1&pageSize=10"));
  });

  it("ວ່າງ: ບໍ່ມີລູກຄ້າ / ບໍ່ພົບຕາມເງື່ອນໄຂ; ໂຫຼດລົ້ມ: ປຸ່ມລອງໃໝ່", async () => {
    mockApi({ items: [], total: 0, page: 1, pageSize: 10 });
    const { user, unmount } = renderWithProviders(<CustomerList />);
    expect(await screen.findByText("No customers yet")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search name or phone..."), "zzz");
    expect(await screen.findByText("No customers match these filters")).toBeInTheDocument();
    unmount();
    vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
    renderWithProviders(<CustomerList />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2:** `pnpm --filter @oca/admin exec vitest run src/components/customers/customer-list.test.tsx` → FAIL.

- [ ] **Step 3: component** — `customer-list.tsx`:

```tsx
"use client";

import { CRM_CUSTOMER_SORTS, type CrmCustomerSort, RFM_SEGMENTS, type RfmSegment } from "@oca/shared";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  cn,
} from "@oca/ui";
import { AlertCircle, Contact, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ServerPager } from "@/components/common/server-pager";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useCrmCustomers, useCrmSegments } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import { SEGMENT_TONE } from "./segment";

const COLUMNS = 5;
const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** ລາຍຊື່ລູກຄ້າ: ຄົ້ນຫາ, ກັ່ນຕອງຕາມກຸ່ມ RFM, ລຽງ, ແບ່ງໜ້າຝັ່ງ server */
export function CustomerList() {
  const { t } = useT();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<RfmSegment | "">("");
  const [sort, setSort] = useState<CrmCustomerSort>("lastOrder");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const trimmed = search.trim();
  const debounced = useDebounced(trimmed, 300);
  const q = trimmed === "" ? "" : debounced;

  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setPage(1);
  }

  const summary = useCrmSegments();
  const query = useCrmCustomers({ q, segment, sort, page, pageSize });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const filtered = q !== "" || segment !== "";
  const busy = query.isPending || query.isPlaceholderData;
  const isEmpty = !busy && rows.length === 0 && total === 0;

  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > 1 && rows.length === 0 && total > 0) {
      setPage(Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [query.data, query.isPlaceholderData, page, pageSize, rows.length, total]);

  const pickSegment = (value: RfmSegment | "") => {
    setSegment((current) => (current === value ? "" : value));
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setSegment("");
    setPage(1);
  };
  const chip = (value: RfmSegment | "", label: string, count: number | undefined) => (
    <button
      key={value || "all"}
      type="button"
      aria-pressed={segment === value}
      onClick={() => pickSegment(value)}
      className={cn(CHIP_CLASS, segment === value ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-secondary hover:text-ink")}
    >
      {label}
      <span className="tabular-nums text-ink-muted">{count ?? "–"}</span>
    </button>
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("customers.title")]}
        title={t("customers.title")}
        badge={query.data ? t("customers.count", { count: query.data.total }) : undefined}
        description={t("customers.description")}
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <div role="group" aria-label={t("customers.segments.label")} className="flex flex-wrap gap-2">
          {chip("", t("customers.segments.all"), summary.data?.total)}
          {RFM_SEGMENTS.map((value) => chip(value, t(`customers.segment.${value}`), summary.data?.segments[value]))}
        </div>
        <Card className="overflow-hidden rounded-[20px]">
          <div className="flex flex-wrap items-end gap-3 px-3 py-4 sm:px-6">
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("customers.search")}
                aria-label={t("customers.search")}
                className="h-10 w-full rounded-lg border border-line bg-subtle pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Select
              aria-label={t("customers.sort")}
              className="w-48"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as CrmCustomerSort);
                setPage(1);
              }}
            >
              {CRM_CUSTOMER_SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`customers.sort.${value}`)}
                </option>
              ))}
            </Select>
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
              <p role="status" className="sr-only">
                {!busy && rows.length > 0 ? t("customers.found", { count: total }) : ""}
              </p>
              <Table aria-label={t("customers.table")} aria-busy={busy}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">{t("customers.col.customer")}</TableHead>
                    <TableHead scope="col">{t("customers.col.segment")}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {t("customers.col.orders")}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {t("customers.col.spent")}
                    </TableHead>
                    <TableHead scope="col">{t("customers.col.lastOrder")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending ? <TableSkeletonRows columns={COLUMNS} /> : null}
                  {rows.map((customer) => (
                    <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <Link href={`/customers/${customer.id}`} className="font-semibold text-brand-ink hover:underline">
                          {customer.name}
                        </Link>
                        <p className="text-xs text-ink-muted">{customer.phone ?? t("customers.noPhone")}</p>
                      </th>
                      <TableCell>
                        {customer.segment ? (
                          <StatusPill tone={SEGMENT_TONE[customer.segment]}>{t(`customers.segment.${customer.segment}`)}</StatusPill>
                        ) : (
                          <span className="text-sm text-ink-muted">{t("customers.never")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{customer.orderCount}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(customer.totalSpent)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">
                        {customer.lastPaidAt ? formatDateTime(customer.lastPaidAt) : t("customers.never")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isEmpty ? (
                <div role="status">
                  <EmptyState
                    icon={Contact}
                    title={filtered ? t("customers.empty.noResults") : t("customers.empty.title")}
                    action={
                      filtered ? (
                        <Button variant="outlinePrimary" className="rounded-lg" onClick={clearFilters}>
                          {t("common.clearSearch")}
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : null}
              <ServerPager
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
```

Verify the class names `bg-brand-soft`, `bg-surface` exist in `packages/ui` tokens (grep `globals.css`); if not, use the pair the promotions tabs use (`border-brand text-brand-ink` / `border-line text-ink-secondary`).

- [ ] **Step 4: route** — `apps/admin/src/app/(app)/customers/page.tsx`:

```tsx
import { PermissionGate } from "@/components/auth/permission-gate";
import { CustomerList } from "@/components/customers/customer-list";

export default function CustomersRoute() {
  return (
    <PermissionGate permission="crm:read">
      <CustomerList />
    </PermissionGate>
  );
}
```

- [ ] **Step 5:** run the test → PASS (adjust only the exact URL parameter order to what `toQueryString` emits, keeping the same parameters). Commit: `feat(admin): customers list with RFM segment filter`.

---

### Task 7: Admin customer detail, edit and merge

**Files:** create `customer-detail.tsx` (+ test), `customer-edit-dialog.tsx`, `merge-customer-dialog.tsx` (+ test), `app/(app)/customers/[id]/page.tsx`; modify `components/orders/order-detail.tsx`.

- [ ] **Step 1: failing detail test** — `customer-detail.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CrmCustomerConversationDto, CrmCustomerDetailDto, CrmCustomerOrderDto, Page } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { CustomerDetail } from "./customer-detail";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
const auth = vi.hoisted(() => ({ canWrite: true, canOrders: true, canInbox: true }));
vi.mock("@/components/auth/auth-provider", () => ({
  useCan: (permission: string) => (permission === "crm:write" ? auth.canWrite : permission === "orders:read" ? auth.canOrders : auth.canInbox),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const customer: CrmCustomerDetailDto = {
  id: "c1",
  name: "Mali",
  phone: "02055550001",
  email: "mali@x.co",
  createdAt: "2026-09-01T00:00:00.000Z",
  note: "Likes red",
  facebookLinked: true,
  orderCount: 12,
  totalSpent: "1250000.00",
  averageOrder: "104166.67",
  firstPaidAt: "2026-09-02T03:00:00.000Z",
  lastPaidAt: "2026-10-05T05:30:00.000Z",
  openOrderCount: 1,
  conversationCount: 1,
  segment: "CHAMPION",
  rfm: { recency: 5, frequency: 5, monetary: 4 },
};
const orders: Page<CrmCustomerOrderDto> = {
  items: [{ id: "o1", orderNumber: "SO-000001", status: "PAID", channel: "FACEBOOK", total: "195.00", createdAt: "2026-10-05T05:30:00.000Z" }],
  total: 13,
  page: 1,
  pageSize: 10,
};
const conversations: CrmCustomerConversationDto[] = [
  { id: "cv1", channel: "FACEBOOK", displayName: "Mali FB", status: "OPEN", lastMessageAt: "2026-10-06T05:30:00.000Z", lastMessagePreview: "ສະບາຍດີ" },
];

function mockApi(detail: CrmCustomerDetailDto | Error = customer) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (options?.method === "PATCH") return { ...customer, name: "Mali 2" };
    if (path.includes("/orders")) return orders;
    if (path.includes("/conversations")) return conversations;
    if (detail instanceof Error) throw detail;
    return detail;
  }) as typeof apiFetch);
}

beforeEach(() => {
  auth.canWrite = true;
  auth.canOrders = true;
  auth.canInbox = true;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(toast.success).mockReset();
  mockApi();
});

describe("CustomerDetail", () => {
  it("ຂໍ້ມູນ, ສະຖິຕິ, RFM ແລະ ກຸ່ມ", async () => {
    renderWithProviders(<CustomerDetail id="c1" />);
    expect(await screen.findByRole("heading", { name: "Mali" })).toBeInTheDocument();
    expect(screen.getByText("Champion")).toBeInTheDocument();
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(within(profile).getByText("02055550001")).toBeInTheDocument();
    expect(within(profile).getByText("mali@x.co")).toBeInTheDocument();
    expect(within(profile).getByText("Likes red")).toBeInTheDocument();
    expect(within(profile).getByText("Linked to Facebook")).toBeInTheDocument();
    const stats = screen.getByRole("region", { name: "Purchase stats" });
    expect(within(stats).getByText("1,250,000.00")).toBeInTheDocument();
    expect(within(stats).getByText("104,166.67")).toBeInTheDocument();
    expect(within(stats).getByText("12")).toBeInTheDocument();
    const rfm = screen.getByRole("region", { name: "RFM score" });
    expect(within(rfm).getByText("Recency (R)").parentElement).toHaveTextContent("5");
    expect(within(rfm).getByText("Monetary (M)").parentElement).toHaveTextContent("4");
  });

  it("ແຖບບິນ (ລິ້ງໄປບິນ) ແລະ ແຖບແຊັດ (ລິ້ງໄປ inbox)", async () => {
    const { user } = renderWithProviders(<CustomerDetail id="c1" />);
    const row = await screen.findByTestId("row-customer-order-o1");
    expect(within(row).getByRole("link", { name: "SO-000001" })).toHaveAttribute("href", "/orders/o1");
    expect(within(row).getByText("195.00")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Orders (13)" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Chats (1)" }));
    expect(await screen.findByText("Mali FB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open chat" })).toHaveAttribute("href", "/inbox?c=cv1");
  });

  it("ບໍ່ມີ orders:read / inbox:read: ເລກບິນ ແລະ ແຊັດ ບໍ່ເປັນລິ້ງ", async () => {
    auth.canOrders = false;
    auth.canInbox = false;
    const { user } = renderWithProviders(<CustomerDetail id="c1" />);
    const row = await screen.findByTestId("row-customer-order-o1");
    expect(within(row).queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Chats (1)" }));
    await screen.findByText("Mali FB");
    expect(screen.queryByRole("link", { name: "Open chat" })).toBeNull();
  });

  it("ແກ້ໄຂ: ກວດຟອມ, ສົ່ງ PATCH, toast", async () => {
    const { user } = renderWithProviders(<CustomerDetail id="c1" />);
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByLabelText(/Name/);
    await user.clear(name);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Enter a name")).toBeInTheDocument();
    await user.type(name, "Mali 2");
    await user.clear(within(dialog).getByLabelText(/Email/));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Customer saved"));
    const patch = vi.mocked(apiFetch).mock.calls.find((call) => call[1]?.method === "PATCH");
    expect(patch?.[0]).toBe("/crm/customers/c1");
    expect(patch?.[1]?.body).toEqual({ name: "Mali 2", phone: "02055550001", email: "", note: "Likes red" });
  });

  it("ເບີຊ້ຳ: ຂໍ້ຄວາມ + ລິ້ງໄປລູກຄ້າເຈົ້າຂອງເບີ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
      if (options?.method === "PATCH") throw new ApiError(409, "taken", [], "CUSTOMER_PHONE_TAKEN", { customerId: "c9" });
      if (path.includes("/orders")) return orders;
      return customer;
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<CustomerDetail id="c1" />);
    await user.click(await screen.findByRole("button", { name: "Edit profile" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This phone number already belongs to another customer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open that customer (to merge)" })).toHaveAttribute("href", "/customers/c9");
  });

  it("crm:read ຢ່າງດຽວ: ບໍ່ມີປຸ່ມແກ້ໄຂ/ລວມ; 404: ຂໍ້ຄວາມບໍ່ພົບ", async () => {
    auth.canWrite = false;
    const { unmount } = renderWithProviders(<CustomerDetail id="c1" />);
    await screen.findByRole("heading", { name: "Mali" });
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Merge customer" })).toBeNull();
    unmount();
    mockApi(new ApiError(404, "nope", [], "CUSTOMER_NOT_FOUND"));
    renderWithProviders(<CustomerDetail id="zz" />);
    expect(await screen.findByText(/Customer not found/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to customers" })).toHaveAttribute("href", "/customers");
  });
});
```

- [ ] **Step 2:** run → FAIL.

- [ ] **Step 3: edit dialog** — `customer-edit-dialog.tsx`:

```tsx
"use client";

import { updateCustomerSchema } from "@oca/shared";
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useUpdateCrmCustomer } from "@/lib/queries";
import type { CrmCustomerDetailDto } from "@/lib/types";

type FieldName = "name" | "phone" | "email";

export function CustomerEditDialog({ customer, open, onOpenChange }: { customer: CrmCustomerDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        {/* key: ເປີດໃໝ່ທຸກຄັ້ງເລີ່ມຈາກຄ່າຫຼ້າສຸດຂອງລູກຄ້າ */}
        {open ? <EditForm key={customer.id} customer={customer} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ customer, onDone }: { customer: CrmCustomerDetailDto; onDone: () => void }) {
  const { t } = useT();
  const save = useUpdateCrmCustomer();
  const [state, setState] = useState({ name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", note: customer.note ?? "" });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneOwnerId, setPhoneOwnerId] = useState<string | null>(null);

  const set = (name: keyof typeof state, value: string) => {
    setState((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setFormError(null);
    setPhoneOwnerId(null);
    const parsed = updateCustomerSchema.safeParse(state);
    if (!parsed.success) {
      const found: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "name") found.name = t("customers.edit.nameRequired");
        else if (field === "phone") found.phone = t("customers.edit.phoneInvalid");
        else if (field === "email") found.email = t("customers.edit.emailInvalid");
      }
      setErrors(found);
      return;
    }
    try {
      // ສົ່ງຄ່າດິບ (trim ແລ້ວ): API ແປງຄ່າເປົ່າເປັນ null ເອງ
      await save.mutateAsync({
        id: customer.id,
        input: { name: state.name.trim(), phone: state.phone.trim(), email: state.email.trim(), note: state.note.trim() },
      });
      toast.success(t("customers.edit.saved"));
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.code === "CUSTOMER_PHONE_TAKEN") {
        setErrors({ phone: t("customers.edit.phoneTaken") });
        const ownerId = error.body?.customerId;
        setPhoneOwnerId(typeof ownerId === "string" ? ownerId : null);
      } else {
        setFormError(errorMessage(error, t));
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t("customers.edit.title")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4">
          <Field label={t("customers.edit.name")} htmlFor="customer-name" required error={errors.name}>
            <Input id="customer-name" maxLength={120} value={state.name} invalid={!!errors.name} onChange={(event) => set("name", event.target.value)} />
          </Field>
          <Field label={t("customers.detail.phone")} htmlFor="customer-phone" error={errors.phone}>
            <Input id="customer-phone" inputMode="tel" maxLength={16} value={state.phone} invalid={!!errors.phone} onChange={(event) => set("phone", event.target.value)} />
          </Field>
          {phoneOwnerId ? (
            <Link href={`/customers/${phoneOwnerId}`} className="-mt-2 text-sm font-medium text-brand-ink hover:underline">
              {t("customers.edit.openOwner")}
            </Link>
          ) : null}
          <Field label={t("customers.detail.email")} htmlFor="customer-email" error={errors.email}>
            <Input id="customer-email" type="email" maxLength={200} value={state.email} invalid={!!errors.email} onChange={(event) => set("email", event.target.value)} />
          </Field>
          <Field label={t("customers.detail.note")} htmlFor="customer-note">
            <textarea
              id="customer-note"
              rows={3}
              maxLength={500}
              value={state.note}
              onChange={(event) => set("note", event.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-10 rounded-xl px-6 font-bold" loading={save.isPending}>
          {save.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 4: detail component** — `customer-detail.tsx`:

```tsx
"use client";

import {
  Button,
  Card,
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
  cn,
} from "@oca/ui";
import { AlertCircle, ArrowLeft, Combine, MessageSquare, Pencil } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { useCan } from "@/components/auth/auth-provider";
import { ServerPager } from "@/components/common/server-pager";
import { OrderStatusPill } from "@/components/orders/order-status";
import { ApiError } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/language-provider";
import { useCrmCustomer, useCrmCustomerConversations, useCrmCustomerOrders } from "@/lib/queries";
import type { CrmCustomerDetailDto } from "@/lib/types";
import { CustomerEditDialog } from "./customer-edit-dialog";
import { MergeCustomerDialog } from "./merge-customer-dialog";
import { SEGMENT_TONE } from "./segment";

const TAB_IDS = ["orders", "conversations"] as const;
type TabId = (typeof TAB_IDS)[number];

/** Customer 360: ຂໍ້ມູນ, ສະຖິຕິ, RFM, ບິນ ແລະ ແຊັດ ຂອງລູກຄ້າຄົນດຽວ */
export function CustomerDetail({ id }: { id: string }) {
  const { t } = useT();
  const canWrite = useCan("crm:write");
  const query = useCrmCustomer(id);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const back = (
    <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("customers.detail.back")}
    </Link>
  );

  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="px-3 py-10 sm:px-6">
        <EmptyState
          icon={AlertCircle}
          title={missing ? t("customers.detail.notFound") : t("common.error.load")}
          action={
            missing ? (
              back
            ) : (
              <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }
  if (!query.data) {
    return (
      <p role="status" className="px-3 py-10 text-sm text-ink-secondary sm:px-6">
        {t("common.loading")}
      </p>
    );
  }
  const customer = query.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[t("nav.home"), t("customers.title"), customer.name]}
        title={customer.name}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setMergeOpen(true)}>
                <Combine aria-hidden="true" />
                {t("customers.merge")}
              </Button>
              <Button className="rounded-xl" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" />
                {t("customers.edit")}
              </Button>
            </div>
          ) : undefined
        }
      />
      <div className="space-y-6 px-3 pb-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          {back}
          {customer.segment ? (
            <StatusPill tone={SEGMENT_TONE[customer.segment]}>{t(`customers.segment.${customer.segment}`)}</StatusPill>
          ) : (
            <StatusPill>{t("customers.never")}</StatusPill>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Section id="customer-profile" title={t("customers.detail.profile")}>
            <dl className="space-y-2 text-sm">
              <Row label={t("customers.detail.phone")} value={customer.phone} />
              <Row label={t("customers.detail.email")} value={customer.email} />
              <Row label={t("customers.detail.since")} value={formatDateTime(customer.createdAt)} />
              <Row label={t("customers.detail.note")} value={customer.note} />
            </dl>
            {customer.facebookLinked ? <p className="mt-3 text-xs font-medium text-ink-secondary">{t("customers.detail.facebook")}</p> : null}
          </Section>
          <Section id="customer-stats" title={t("customers.detail.stats")}>
            <dl className="space-y-2 text-sm">
              <Row label={t("customers.detail.totalSpent")} value={formatMoney(customer.totalSpent)} strong />
              <Row label={t("customers.detail.orderCount")} value={String(customer.orderCount)} />
              <Row label={t("customers.detail.averageOrder")} value={formatMoney(customer.averageOrder)} />
              <Row label={t("customers.detail.lastPaid")} value={customer.lastPaidAt ? formatDateTime(customer.lastPaidAt) : null} />
              <Row label={t("customers.detail.firstPaid")} value={customer.firstPaidAt ? formatDateTime(customer.firstPaidAt) : null} />
              <Row label={t("customers.detail.openOrders")} value={String(customer.openOrderCount)} />
            </dl>
          </Section>
          <Section id="customer-rfm" title={t("customers.detail.rfm")}>
            {customer.rfm ? (
              <>
                <dl className="space-y-2 text-sm">
                  <Row label={t("customers.detail.rfm.recency")} value={String(customer.rfm.recency)} strong />
                  <Row label={t("customers.detail.rfm.frequency")} value={String(customer.rfm.frequency)} strong />
                  <Row label={t("customers.detail.rfm.monetary")} value={String(customer.rfm.monetary)} strong />
                </dl>
                <p className="mt-3 text-xs text-ink-muted">{t("customers.detail.rfmHint")}</p>
              </>
            ) : (
              <p className="text-sm text-ink-secondary">{t("customers.never")}</p>
            )}
          </Section>
        </div>

        <HistoryTabs customer={customer} />
      </div>
      {canWrite ? (
        <>
          <CustomerEditDialog customer={customer} open={editOpen} onOpenChange={setEditOpen} />
          <MergeCustomerDialog target={customer} open={mergeOpen} onOpenChange={setMergeOpen} />
        </>
      ) : null}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card className="rounded-[20px] p-6">
      <section aria-labelledby={id}>
        <h2 id={id} className="mb-3 text-base font-bold text-ink">
          {title}
        </h2>
        {children}
      </section>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  const { t } = useT();
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-ink-secondary">{label}</dt>
      <dd className={cn("min-w-0 break-words text-right tabular-nums text-ink", strong && "font-semibold")}>{value ?? t("customers.detail.none")}</dd>
    </div>
  );
}

function HistoryTabs({ customer }: { customer: CrmCustomerDetailDto }) {
  const { t } = useT();
  const [tab, setTab] = useState<TabId>("orders");
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  // ຈຳນວນບິນທັງໝົດ (ທຸກສະຖານະ) ມາຈາກ response ຂອງແຖບບິນ; ກ່ອນໂຫຼດແລ້ວໃຊ້ຈຳນວນທີ່ຮູ້
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const counts: Record<TabId, number> = { orders: orderTotal ?? customer.orderCount + customer.openOrderCount, conversations: customer.conversationCount };

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TAB_IDS[(index + step + TAB_IDS.length) % TAB_IDS.length] ?? "orders";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div role="tablist" aria-label={t("customers.detail.tabs")} className="flex gap-1 border-b border-line px-3 sm:px-6">
        {TAB_IDS.map((id, index) => (
          <button
            key={id}
            ref={(node) => {
              tabRefs.current[id] = node;
            }}
            type="button"
            role="tab"
            id={`customer-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`customer-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === id ? "border-brand text-brand-ink" : "border-transparent text-ink-secondary hover:text-ink",
            )}
          >
            {t(`customers.detail.tab.${id}`, { count: counts[id] })}
          </button>
        ))}
      </div>
      {TAB_IDS.map((id) => (
        <div key={id} role="tabpanel" id={`customer-panel-${id}`} aria-labelledby={`customer-tab-${id}`} hidden={tab !== id}>
          {tab === id ? id === "orders" ? <OrdersPanel customerId={customer.id} onTotal={setOrderTotal} /> : <ConversationsPanel customerId={customer.id} /> : null}
        </div>
      ))}
    </Card>
  );
}

function OrdersPanel({ customerId, onTotal }: { customerId: string; onTotal: (total: number) => void }) {
  const { t } = useT();
  const canOpenOrder = useCan("orders:read");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useCrmCustomerOrders(customerId, { page, pageSize });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  const [seenTotal, setSeenTotal] = useState<number | null>(null);
  if (query.data && seenTotal !== total) {
    setSeenTotal(total);
    onTotal(total);
  }

  if (query.isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t("common.error.load")}
        action={
          <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  return (
    <>
      <Table aria-label={t("customers.detail.orders.table")} aria-busy={query.isPending}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">{t("orders.col.number")}</TableHead>
            <TableHead scope="col">{t("orders.col.channel")}</TableHead>
            <TableHead scope="col">{t("orders.col.status")}</TableHead>
            <TableHead scope="col" className="text-right">
              {t("orders.col.total")}
            </TableHead>
            <TableHead scope="col">{t("orders.col.created")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isPending ? <TableSkeletonRows columns={5} /> : null}
          {rows.map((order) => (
            <TableRow key={order.id} data-testid={`row-customer-order-${order.id}`}>
              <th scope="row" className="px-4 py-3 text-left font-mono font-semibold">
                {canOpenOrder ? (
                  <Link href={`/orders/${order.id}`} className="text-brand-ink hover:underline">
                    {order.orderNumber}
                  </Link>
                ) : (
                  <span className="text-ink">{order.orderNumber}</span>
                )}
              </th>
              <TableCell className="text-ink-secondary">{t(`orders.channel.${order.channel}`)}</TableCell>
              <TableCell>
                <OrderStatusPill status={order.status} />
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMoney(order.total)}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-ink-secondary">{formatDateTime(order.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!query.isPending && rows.length === 0 ? (
        <div role="status">
          <EmptyState icon={AlertCircle} title={t("customers.detail.orders.empty")} />
        </div>
      ) : null}
      <ServerPager
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </>
  );
}

function ConversationsPanel({ customerId }: { customerId: string }) {
  const { t } = useT();
  const canOpenChat = useCan("inbox:read");
  const query = useCrmCustomerConversations(customerId);
  const rows = query.data ?? [];
  if (query.isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t("common.error.load")}
        action={
          <Button variant="outlinePrimary" className="rounded-lg" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (query.isPending) {
    return (
      <p role="status" className="px-6 py-6 text-sm text-ink-secondary">
        {t("common.loading")}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <div role="status">
        <EmptyState icon={MessageSquare} title={t("customers.detail.conversations.empty")} />
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {rows.map((conversation) => (
        <li key={conversation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="font-medium text-ink">{conversation.displayName}</p>
            <p className="truncate text-sm text-ink-secondary">{conversation.lastMessagePreview ?? t("customers.detail.none")}</p>
            <p className="text-xs tabular-nums text-ink-muted">
              {t(`orders.channel.${conversation.channel}`)} · {formatDateTime(conversation.lastMessageAt)}
            </p>
          </div>
          {canOpenChat ? (
            <Link href={`/inbox?c=${encodeURIComponent(conversation.id)}`} className="text-sm font-medium text-brand-ink hover:underline">
              {t("customers.detail.conversations.open")}
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

Notes for the implementer: the test looks sections up by `role="region"` with the heading as name, which `<section aria-labelledby>` provides. `Combine` is a lucide icon; if this lucide version lacks it use `Merge`. `StatusPill` without `tone` renders neutral.

- [ ] **Step 5: failing merge test** — `merge-customer-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "@oca/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import type { CrmCustomerDetailDto, CrmCustomerListItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { MergeCustomerDialog } from "./merge-customer-dialog";

vi.mock("@oca/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@oca/ui")>();
  return { ...original, toast: { ...original.toast, success: vi.fn(), error: vi.fn() } };
});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const target = { id: "c1", name: "Mali", phone: "02055550001" } as CrmCustomerDetailDto;
const row = (patch: Partial<CrmCustomerListItemDto>): CrmCustomerListItemDto => ({
  id: "c2",
  name: "Mali FB",
  phone: null,
  email: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  orderCount: 2,
  totalSpent: "400.00",
  lastPaidAt: null,
  segment: "REGULAR",
  ...patch,
});
const results = [row({}), row({ id: "c1", name: "Mali" }), row({ id: "c3", name: "Mali Shop", phone: "02099990000", orderCount: 5 })];
const onOpenChange = vi.fn();

beforeEach(() => {
  onOpenChange.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) =>
    options?.method === "POST" ? target : { items: results, total: 3, page: 1, pageSize: 8 }) as typeof apiFetch);
});

describe("MergeCustomerDialog", () => {
  it("ຄົ້ນຫາ (ບໍ່ສະແດງລູກຄ້າປາຍທາງ) → ເລືອກ → ສະຫຼຸບ → ຢືນຢັນ", async () => {
    const { user } = renderWithProviders(<MergeCustomerDialog target={target} open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole("dialog", { name: "Merge a duplicate into Mali" });
    await user.type(within(dialog).getByLabelText("Search the duplicate (name or phone)"), "mali");
    await user.click(await within(dialog).findByRole("button", { name: "Select Mali FB" }));
    expect(within(dialog).queryByRole("button", { name: "Select Mali" })).toBeNull();
    expect(within(dialog).getByText("2 orders of Mali FB will move to Mali")).toBeInTheDocument();
    expect(within(dialog).getByText("Merging cannot be undone")).toBeInTheDocument();
    expect(within(dialog).queryByText(/will be dropped/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Customers merged"));
    const post = vi.mocked(apiFetch).mock.calls.find((call) => call[1]?.method === "POST");
    expect(post?.[0]).toBe("/crm/customers/c1/merge");
    expect(post?.[1]?.body).toEqual({ sourceId: "c2" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ທັງສອງມີເບີຕ່າງກັນ: ເຕືອນວ່າເບີຂອງ source ຈະຖືກຖິ້ມ; ປ່ຽນໃຈເລືອກຄົນອື່ນໄດ້", async () => {
    const { user } = renderWithProviders(<MergeCustomerDialog target={target} open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Search the duplicate (name or phone)"), "mali");
    await user.click(await screen.findByRole("button", { name: "Select Mali Shop" }));
    expect(screen.getByText("Both have different phone numbers: 02099990000 of Mali Shop will be dropped")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose another" }));
    expect(screen.getByLabelText("Search the duplicate (name or phone)")).toBeInTheDocument();
  });

  it("API ລົ້ມ: ສະແດງຂໍ້ຜິດພາດ ແລະ ບໍ່ປິດ", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw new Error("down");
      return { items: results, total: 3, page: 1, pageSize: 8 };
    }) as typeof apiFetch);
    const { user } = renderWithProviders(<MergeCustomerDialog target={target} open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Search the duplicate (name or phone)"), "mali");
    await user.click(await screen.findByRole("button", { name: "Select Mali FB" }));
    await user.click(screen.getByRole("button", { name: "Confirm merge" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 6: merge dialog** — `merge-customer-dialog.tsx`:

```tsx
"use client";

import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from "@oca/ui";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { useCrmCustomers, useMergeCrmCustomer } from "@/lib/queries";
import type { CrmCustomerDetailDto, CrmCustomerListItemDto } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

/** ລວມລູກຄ້າຊ້ຳ (source) ເຂົ້າລູກຄ້າທີ່ກຳລັງເປີດ (target): ຄົ້ນຫາ → ເລືອກ → ຢືນຢັນ */
export function MergeCustomerDialog({ target, open, onOpenChange }: { target: CrmCustomerDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("common.close")}>
        {open ? <MergeFlow target={target} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MergeFlow({ target, onDone }: { target: CrmCustomerDetailDto; onDone: () => void }) {
  const { t } = useT();
  const merge = useMergeCrmCustomer();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<CrmCustomerListItemDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const trimmed = search.trim();
  const q = useDebounced(trimmed, 300);
  const query = useCrmCustomers({ q, page: 1, pageSize: 8 }, { enabled: q !== "" && source === null });
  const candidates = (query.data?.items ?? []).filter((row) => row.id !== target.id);
  const phoneDropped = source?.phone && target.phone && source.phone !== target.phone ? source.phone : null;

  async function confirm() {
    if (!source || merge.isPending) return;
    setFormError(null);
    try {
      await merge.mutateAsync({ targetId: target.id, sourceId: source.id });
      toast.success(t("customers.merge.done"));
      onDone();
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  }

  return (
    <>
      <DialogHeader title={t("customers.merge.title", { name: target.name })} description={t("customers.merge.description")} />
      <DialogBody>
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        {source ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-ink">{t("customers.merge.summary", { orders: source.orderCount, name: source.name, target: target.name })}</p>
            {phoneDropped ? (
              <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-warning-ink">
                {t("customers.merge.phoneDropped", { phone: phoneDropped, name: source.name })}
              </p>
            ) : null}
            <p className="text-ink-secondary">{t("customers.merge.irreversible")}</p>
            <Button type="button" variant="ghost" className="rounded-lg px-0" onClick={() => setSource(null)}>
              {t("customers.merge.change")}
            </Button>
          </div>
        ) : (
          <>
            <Field label={t("customers.merge.search")} htmlFor="merge-search">
              <Input id="merge-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            </Field>
            {q !== "" && !query.isPending ? (
              candidates.length > 0 ? (
                <ul aria-label={t("customers.merge.results")} className="divide-y divide-line rounded-xl border border-line">
                  {candidates.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        aria-label={t("customers.merge.pick", { name: row.name })}
                        onClick={() => setSource(row)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-ink">{row.name}</span>
                          <span className="block text-xs text-ink-muted">{row.phone ?? t("customers.noPhone")}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-secondary">
                          {t("customers.col.orders")}: {row.orderCount}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p role="status" className="text-sm text-ink-secondary">
                  {t("customers.merge.noResults")}
                </p>
              )
            ) : null}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-5" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="button" variant="destructive" className="h-10 rounded-xl px-6 font-bold" disabled={!source} loading={merge.isPending} onClick={() => void confirm()}>
          {t("customers.merge.confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}
```

Check the `Button` variants in `packages/ui/src/components/button.tsx`: use its danger variant name (`destructive` or `danger`), and the warning token classes (`warning-line`/`warning-soft`/`warning-ink`) against `StatusPill`'s `warning` tone; substitute the names that exist. The dialog's accessible name comes from `DialogHeader title`; confirm with the coupon dialog test how the name is exposed and match it.

- [ ] **Step 7: route + order link.** `apps/admin/src/app/(app)/customers/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { PermissionGate } from "@/components/auth/permission-gate";
import { CustomerDetail } from "@/components/customers/customer-detail";

const CUSTOMER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CUSTOMER_ID.test(id)) notFound();
  return (
    <PermissionGate permission="crm:read">
      {/* key = id: ໄປລູກຄ້າອື່ນ (ເຊັ່ນ ຫຼັງລວມ) ແລ້ວ state ເກົ່າບໍ່ຕິດໄປ */}
      <CustomerDetail key={id} id={id} />
    </PermissionGate>
  );
}
```

In `components/orders/order-detail.tsx` (customer card, ~line 330) replace `<p className="font-medium text-ink">{order.customer.name}</p>` with:

```tsx
                {canOpenCustomer ? (
                  <Link href={`/customers/${order.customer.id}`} className="font-medium text-brand-ink hover:underline">
                    {order.customer.name}
                  </Link>
                ) : (
                  <p className="font-medium text-ink">{order.customer.name}</p>
                )}
```

with `const canOpenCustomer = useCan("crm:read");` next to the component's other `useCan` calls (import `Link` from `next/link` if the file does not already). Add one test to `order-detail.test.tsx` following its existing `useCan` mock: with `crm:read` the customer name is a link to `/customers/<id>`; without it there is no such link. If the existing mock returns one boolean for every permission, extend it per permission the same way `order-list.test.tsx` does.

- [ ] **Step 8:** `pnpm --filter @oca/admin test` → PASS (was 1136; expect more). `pnpm --filter @oca/admin typecheck && pnpm --filter @oca/admin exec eslint src` → clean. Commit: `feat(admin): customer detail with edit and merge`.

---

### Task 8: Verify in the browser, docs

- [ ] **Step 1: full checks.** `pnpm --filter @oca/shared test`, `OCA_TEST_DB_NAME=oca_test_crm pnpm --filter @oca/api test`, `pnpm --filter @oca/admin test`, `pnpm --filter @oca/storefront test` → all PASS. `pnpm --filter @oca/api build` → clean.

- [ ] **Step 2: migrate the isolated dev DB (5433 only)** — `pnpm --filter @oca/database db:deploy`. Confirm the target first: `grep DATABASE_URL .env` must show port 5433.

- [ ] **Step 3: smoke in Chrome.** Start API + admin (`pnpm --filter @oca/api dev`, `pnpm --filter @oca/admin dev`), log in as the seeded owner and check, with real data: menu shows "ລູກຄ້າ"; `/customers` lists customers with segment chips whose counts match the table when filtered; search by phone; open a customer: stats match that customer's orders page; edit note and see it persist; merge a CF-only customer into a phone customer and see the orders move and the source page show "not found"; order detail customer name links back. Check both light and dark mode and a 390px-wide viewport (no horizontal page scroll; the table scrolls inside its card).

- [ ] **Step 4: docs.** `docs/DATABASE.md`: in the Customer section add `note` (internal CRM note); in "ຍັງບໍ່ທັນມີ" keep the points/VIP line (D2). Spec header: `ສະຖານະ: D1 ສຳເລັດ`. Commit: `docs: customer 360 notes`.

## Self-review

- Spec §2 coverage: note column (T1); stats + RFM table and segment rules (T2 CTE + tests for all six segments and no-orders); merge rules for orders/conversations/blank fields/phone conflict/audit (T4); API list/segments/detail/tabs/patch/merge (T2–T4); UI menu, list with chips, detail, merge, order link (T5–T7). Tier, points, `hasPin`, `nextTier`, `spend12m` and the points tab are D2/D3 by the spec's split note.
- Deviations recorded in the spec: routes live under `/crm/customers` because `GET /customers` already exists as the order form's lookup (`orders:read`); M uses `CEIL(CUME_DIST × 5)` instead of `NTILE(5)` so equal spenders score equally and a single customer scores 5.
- Names are consistent across tasks: `CrmCustomerListItemDto`, `CrmCustomerDetailDto`, `CrmSegmentSummaryDto`, `CrmCustomerOrderDto`, `CrmCustomerConversationDto`; hooks `useCrmCustomers`, `useCrmSegments`, `useCrmCustomer`, `useCrmCustomerOrders`, `useCrmCustomerConversations`, `useUpdateCrmCustomer`, `useMergeCrmCustomer`; query key `crmCustomers`.
