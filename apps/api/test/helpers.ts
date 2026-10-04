import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "@oca/database";
import { PERMISSIONS } from "@oca/shared";
import request from "supertest";
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
    'TRUNCATE TABLE "AuditLog", "RefreshToken", "User", "RolePermission", "Role" RESTART IDENTITY CASCADE',
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
