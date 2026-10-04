import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "@oca/database";
import { PERMISSIONS } from "@oca/shared";
import request from "supertest";
import { expect } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { parseEnv } from "../src/config/env";
import { PRISMA } from "../src/prisma/prisma.module";

export const TEST_PASSWORD = "Password123!";

export async function createTestApp(
  overrides: Record<string, string> = {},
): Promise<{ app: INestApplication; db: PrismaClient }> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    configureApp(app, parseEnv(process.env));
    await app.init();
    return { app, db: app.get<PrismaClient>(PRISMA) };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export async function resetDb(db: PrismaClient): Promise<void> {
  const [row] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (row?.name !== "oca_test") {
    throw new Error(`Refusing to truncate non-test database "${row?.name}"`);
  }
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
}

/** OWNER (ທຸກ permission, role ລະບົບ) + VIEWER (staff:read) ແລະ user ຢ່າງລະຄົນ. */
export async function seedBasics(db: PrismaClient) {
  const owner = await db.role.create({
    data: {
      name: "OWNER",
      isSystem: true,
      permissions: { create: PERMISSIONS.map((permission) => ({ permission })) },
    },
  });
  const viewer = await db.role.create({
    data: { name: "VIEWER", permissions: { create: [{ permission: "staff:read" }] } },
  });
  const passwordHash = await hash(TEST_PASSWORD);
  const ownerUser = await db.user.create({
    data: { email: "owner@test.local", name: "Owner", passwordHash, roleId: owner.id },
  });
  const viewerUser = await db.user.create({
    data: { email: "viewer@test.local", name: "Viewer", passwordHash, roleId: viewer.id },
  });
  return { owner, viewer, ownerUser, viewerUser };
}

/** Non-owner "HR" role (staff:read + staff:write) and a user hr@test.local with it. */
export async function seedHr(db: PrismaClient) {
  const hr = await db.role.create({
    data: {
      name: "HR",
      permissions: { create: [{ permission: "staff:read" }, { permission: "staff:write" }] },
    },
  });
  const hrUser = await db.user.create({
    data: { email: "hr@test.local", name: "HR", passwordHash: await hash(TEST_PASSWORD), roleId: hr.id },
  });
  return { hr, hrUser };
}

/** ດຶງ cookie refresh (ຮູບ "oca_rt=...") ຈາກ response; undefined ຖ້າບໍ່ມີ ຫຼື ຖືກລ້າງແລ້ວ. */
export function refreshCookieOf(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  return list
    .map((cookie) => cookie.split(";")[0] ?? "")
    .find((pair) => pair.startsWith("oca_rt=") && pair.length > "oca_rt=".length);
}

export async function loginAs(app: INestApplication, email: string, password = TEST_PASSWORD) {
  const res = await request(app.getHttpServer()).post("/auth/login").send({ email, password }).expect(200);
  return {
    accessToken: res.body.accessToken as string,
    cookie: refreshCookieOf(res) as string,
    body: res.body as Record<string, unknown>,
  };
}

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

/** onHand/reserved ຂອງທຸກ StockLevel ຕ້ອງເທົ່າກັບຜົນລວມຂອງ StockMovement (spec §4 invariant). */
export async function expectLedgerMatches(db: PrismaClient): Promise<void> {
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
