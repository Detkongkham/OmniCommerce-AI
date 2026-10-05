import type { INestApplication } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { MetadataScanner, ModulesContainer, Reflector } from "@nestjs/core";
import { type PrismaClient, receive } from "@oca/database";
import { ERROR_CODES, type Permission, PERMISSIONS, isErrorCode } from "@oca/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from "../src/common/decorators";
import { bearerFor, createTestApp, resetDb, seedCatalog, seedRoleUsers } from "./helpers";

const HTTP_METHODS: Record<number, string> = { 0: "get", 1: "post", 2: "put", 3: "delete", 4: "patch" };

/** route ທີ່ຜູ້ໃຊ້ທີ່ login ແລ້ວທຸກຄົນເຂົ້າໄດ້ (ບໍ່ຜູກກັບ module). ເພີ່ມທີ່ນີ້ຕ້ອງມີເຫດຜົນ. */
const LOGIN_ONLY = new Set(["GET /auth/me"]);

interface RouteInfo {
  method: string;
  path: string;
  permissions: Permission[] | undefined;
  isPublic: boolean;
  label: string;
}

type Verb = (url: string) => request.Test;
const call = (app: INestApplication, method: string, path: string): request.Test => {
  const verb = (request(app.getHttpServer()) as unknown as Record<string, Verb>)[method];
  if (!verb) throw new Error(`Unsupported method ${method}`);
  return verb(path);
};

function collectRoutes(app: INestApplication): RouteInfo[] {
  const modules = app.get(ModulesContainer, { strict: false });
  const scanner = new MetadataScanner();
  const reflector = app.get(Reflector, { strict: false });
  const routes: RouteInfo[] = [];
  for (const wrapper of [...modules.values()].flatMap((module) => [...module.controllers.values()])) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const base = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? "";
    for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance) as object)) {
      const handler = (instance as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      if (verb === undefined) continue;
      const sub = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? "";
      const path = `/${[base, sub].filter((part) => part && part !== "/").join("/")}`;
      routes.push({
        method: HTTP_METHODS[verb] ?? String(verb),
        path,
        permissions: reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [handler, metatype]),
        isPublic: reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [handler, metatype]) === true,
        label: `${HTTP_METHODS[verb]?.toUpperCase()} ${path}`,
      });
    }
  }
  return routes;
}

describe("ສິດຂອງທຸກ route (sweep)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let routes: RouteInfo[];

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    routes = collectRoutes(app);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await seedRoleUsers(db);
  });

  it("ພົບ route ແທ້ (ກັນ sweep ວ່າງ)", () => {
    expect(routes.length).toBeGreaterThan(40);
    expect(routes.map((route) => route.label)).toEqual(
      expect.arrayContaining(["GET /orders", "POST /orders/:id/pay", "GET /variants", "GET /customers"]),
    );
  });

  it("ທຸກ route ຕ້ອງເປັນ @Public ຫຼື ກຳນົດ @RequirePermissions ທີ່ເປັນສິດຖືກຕ້ອງ (ຫ້າມລືມ)", () => {
    const unguarded = routes.filter(
      (route) =>
        !route.isPublic &&
        !LOGIN_ONLY.has(route.label) &&
        (!route.permissions || route.permissions.length === 0),
    );
    expect(unguarded.map((route) => route.label)).toEqual([]);
    for (const route of routes) {
      for (const permission of route.permissions ?? []) expect(PERMISSIONS).toContain(permission);
    }
  });

  it("ບໍ່ມີ token → 401 ທຸກ route ທີ່ບໍ່ public", async () => {
    for (const route of routes.filter((r) => !r.isPublic)) {
      const path = route.path.replace(/:[A-Za-z]+/g, "x");
      const res = await call(app, route.method, path);
      expect(res.status, route.label).toBe(401);
      expect(res.body.code, route.label).toBe("UNAUTHORIZED");
    }
  });

  it("ຜູ້ໃຊ້ທີ່ບໍ່ມີສິດທີ່ route ຕ້ອງການ → 403 (ທົດສອບດ້ວຍ role ທີ່ຂາດສິດນັ້ນຢ່າງດຽວ)", async () => {
    // ໃຊ້ OWNER ທີ່ຖືກຖອດສິດທີ່ route ຕ້ອງການ ເພື່ອໃຫ້ມັນຂາດສິດນັ້ນ "ຢ່າງດຽວ"
    const owner = await db.role.findUniqueOrThrow({ where: { name: "OWNER" } });
    const passwordHash = (await db.user.findFirstOrThrow({ where: { roleId: owner.id } })).passwordHash;
    const needed = [...new Set(routes.flatMap((route) => route.permissions ?? []))];
    const emailFor = (permission: Permission) => `lack-${permission.replace(":", "-")}@sweep.test`;
    for (const permission of needed) {
      const role = await db.role.create({
        data: {
          name: `LACK_${permission}`,
          permissions: { create: PERMISSIONS.filter((p) => p !== permission).map((p) => ({ permission: p })) },
        },
      });
      await db.user.create({ data: { email: emailFor(permission), name: "x", passwordHash, roleId: role.id } });
    }
    const headers = new Map<Permission, { Authorization: string }>();
    for (const permission of needed) headers.set(permission, await bearerFor(app, emailFor(permission)));

    for (const route of routes.filter((r) => !r.isPublic && r.permissions)) {
      const permission = route.permissions?.[0];
      if (!permission) continue;
      const path = route.path.replace(/:[A-Za-z]+/g, "x");
      const res = await call(app, route.method, path)
        .set(headers.get(permission) ?? {})
        .send({});
      expect(res.status, `${route.label} (ຂາດ ${permission})`).toBe(403);
      expect(res.body.code, route.label).toBe("FORBIDDEN");
    }
  });
});

describe("role model ຕາມ seed ຈິງ (ບິນ / ຊຳລະ / ຕົ້ນທຶນ)", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
  const server = () => app.getHttpServer();
  const as = (name: string) => bearerFor(app, `${name.toLowerCase()}@role.test`);

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
    await db.product.update({ where: { id: f.product.id }, data: { status: "ACTIVE" } });
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 20 }));
  });

  const body = () => ({ items: [{ variantId: f.v1.id, quantity: 1 }] });

  it("CHAT_ADMIN: ສ້າງ/ອ່ານ/ຍົກເລີກບິນໄດ້, ຄົ້ນ variant ແລະ ລູກຄ້າໄດ້; ຢືນຢັນຊຳລະ ແລະ ແພັກ/ສົ່ງບໍ່ໄດ້; ບໍ່ເຫັນຕົ້ນທຶນ", async () => {
    const chat = await as("CHAT_ADMIN");
    const created = await request(server()).post("/orders").set(chat).send(body()).expect(201);
    expect(created.body.items[0]).not.toHaveProperty("unitCost");
    expect(created.body.items[0].unitPrice).toBe("100.00");

    const id = created.body.id as string;
    await request(server()).get(`/orders/${id}`).set(chat).expect(200);
    await request(server()).get("/customers").set(chat).expect(200);
    const variants = await request(server()).get("/variants?q=SKU").set(chat).expect(200);
    expect(variants.body.items[0]).not.toHaveProperty("costPrice");
    expect(variants.body.items[0].price).toBe("100.00");

    await request(server()).post(`/orders/${id}/pay`).set(chat).expect(403);
    await request(server()).post(`/orders/${id}/pack`).set(chat).expect(403);
    await request(server()).post(`/orders/${id}/cancel`).set(chat).send({}).expect(200);
    await request(server()).post("/stock/receive").set(chat).send({ variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1 }).expect(403);
  });

  it("WAREHOUSE: ເບິ່ງບິນ + ແພັກ/ສົ່ງ/ປິດໄດ້; ສ້າງບິນ, ຢືນຢັນຊຳລະ, ຍົກເລີກບໍ່ໄດ້; ຮັບສະຕ໋ອກໄດ້ ແຕ່ບໍ່ເຫັນ ແລະ ຕັ້ງຕົ້ນທຶນບໍ່ໄດ້", async () => {
    const owner = await as("OWNER");
    const warehouse = await as("WAREHOUSE");
    const created = await request(server()).post("/orders").set(owner).send(body()).expect(201);
    const id = created.body.id as string;

    await request(server()).post("/orders").set(warehouse).send(body()).expect(403);
    await request(server()).post(`/orders/${id}/pay`).set(warehouse).expect(403);
    await request(server()).post(`/orders/${id}/cancel`).set(warehouse).send({}).expect(403);
    await request(server()).post(`/orders/${id}/pay`).set(owner).expect(200);

    const seen = await request(server()).get(`/orders/${id}`).set(warehouse).expect(200);
    expect(seen.body.items[0]).not.toHaveProperty("unitCost");
    await request(server()).post(`/orders/${id}/pack`).set(warehouse).expect(200);
    await request(server()).post(`/orders/${id}/ship`).set(warehouse).expect(200);
    await request(server()).post(`/orders/${id}/complete`).set(warehouse).expect(200);

    await request(server()).post("/stock/receive").set(warehouse).send({ variantId: f.v1.id, warehouseId: f.whA.id, quantity: 1 }).expect(201);
    const product = await request(server()).get(`/products/${f.product.id}`).set(warehouse).expect(200);
    expect(product.body.variants[0]).not.toHaveProperty("costPrice");

    // ຕັ້ງຕົ້ນທຶນແບບມືດບໍ່ໄດ້ ແຕ່ແກ້ລາຄາຂາຍ/ເປີດປິດໄດ້
    const blind = await request(server()).patch(`/variants/${f.v1.id}`).set(warehouse).send({ costPrice: "1" }).expect(403);
    expect(blind.body.code).toBe("FORBIDDEN");
    await request(server()).patch(`/variants/${f.v1.id}`).set(warehouse).send({ price: "120" }).expect(200);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: f.v1.id } })).costPrice.toFixed(2)).toBe("60.00");
  });

  it("MANAGER / OWNER: ເຫັນຕົ້ນທຶນ, ຢືນຢັນຊຳລະ, ແກ້ຕົ້ນທຶນໄດ້", async () => {
    for (const name of ["MANAGER", "OWNER"]) {
      await db.productVariant.update({ where: { id: f.v1.id }, data: { costPrice: "60.00" } });
      const headers = await as(name);
      const created = await request(server()).post("/orders").set(headers).send(body()).expect(201);
      expect(created.body.items[0].unitCost).toBe("60.00");
      await request(server()).post(`/orders/${created.body.id}/pay`).set(headers).expect(200);
      const variant = await request(server()).patch(`/variants/${f.v1.id}`).set(headers).send({ costPrice: "61" }).expect(200);
      expect(variant.body.costPrice).toBe("61.00");
    }
  });

  it("ACCOUNTANT: ອ່ານຢ່າງດຽວ + ເຫັນຕົ້ນທຶນ; ປ່ຽນຫຍັງບໍ່ໄດ້", async () => {
    const owner = await as("OWNER");
    const accountant = await as("ACCOUNTANT");
    const created = await request(server()).post("/orders").set(owner).send(body()).expect(201);
    const id = created.body.id as string;
    const seen = await request(server()).get(`/orders/${id}`).set(accountant).expect(200);
    expect(seen.body.items[0].unitCost).toBe("60.00");
    await request(server()).post("/orders").set(accountant).send(body()).expect(403);
    await request(server()).post(`/orders/${id}/pay`).set(accountant).expect(403);
    await request(server()).post(`/orders/${id}/pack`).set(accountant).expect(403);
  });
});

describe("error code ທີ່ຄົງທີ່", () => {
  let app: INestApplication;
  let db: PrismaClient;
  let f: Awaited<ReturnType<typeof seedCatalog>>;
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
    await db.product.update({ where: { id: f.product.id }, data: { status: "ACTIVE" } });
    await db.$transaction((tx) => receive(tx, { variantId: f.v1.id, warehouseId: f.whA.id, quantity: 2 }));
  });

  it("ທຸກ error ມີ code ໃນ ERROR_CODES ພ້ອມ statusCode ແລະ message", async () => {
    const owner = await bearerFor(app, "owner@role.test");
    const cases: { name: string; res: () => request.Test; status: number; code: string }[] = [
      { name: "401", res: () => request(server()).get("/orders"), status: 401, code: "UNAUTHORIZED" },
      { name: "validation", res: () => request(server()).get("/orders?status=NOPE").set(owner), status: 400, code: "VALIDATION_FAILED" },
      { name: "order 404", res: () => request(server()).get("/orders/missing").set(owner), status: 404, code: "ORDER_NOT_FOUND" },
      { name: "product 404", res: () => request(server()).get("/products/missing").set(owner), status: 404, code: "PRODUCT_NOT_FOUND" },
      { name: "variant 404 (body)", res: () => request(server()).post("/stock/receive").set(owner).send({ variantId: "nope", warehouseId: f.whA.id, quantity: 1 }), status: 404, code: "VARIANT_NOT_FOUND" },
      { name: "warehouse 404 (body)", res: () => request(server()).post("/stock/receive").set(owner).send({ variantId: f.v1.id, warehouseId: "nope", quantity: 1 }), status: 404, code: "WAREHOUSE_NOT_FOUND" },
      { name: "insufficient", res: () => request(server()).post("/orders").set(owner).send({ items: [{ variantId: f.v1.id, quantity: 99 }] }), status: 409, code: "INSUFFICIENT_STOCK" },
      { name: "duplicate sku", res: () => request(server()).patch(`/variants/${f.v1.id}`).set(owner).send({ sku: "SKU-2" }), status: 409, code: "DUPLICATE_VALUE" },
    ];
    for (const item of cases) {
      const res = await item.res();
      expect(res.status, item.name).toBe(item.status);
      expect(res.body.code, item.name).toBe(item.code);
      expect(isErrorCode(res.body.code), item.name).toBe(true);
      expect(res.body.statusCode, item.name).toBe(item.status);
      expect(typeof res.body.message, item.name).toBe("string");
    }
  });

  it("ສະຖານະບິນຜິດ = ORDER_INVALID_STATE (ພ້ອມ status ປັດຈຸບັນ); ໝົດເວລາຈອງ = RESERVATION_EXPIRED", async () => {
    const owner = await bearerFor(app, "owner@role.test");
    const created = await request(server()).post("/orders").set(owner).send({ items: [{ variantId: f.v1.id, quantity: 1 }] }).expect(201);
    const id = created.body.id as string;
    const bad = await request(server()).post(`/orders/${id}/ship`).set(owner).expect(409);
    expect(bad.body).toMatchObject({ code: "ORDER_INVALID_STATE", status: "PENDING_PAYMENT" });

    await db.order.update({ where: { id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
    const expired = await request(server()).post(`/orders/${id}/pay`).set(owner).expect(409);
    expect(expired.body.code).toBe("RESERVATION_EXPIRED");
  });

  it("INSUFFICIENT_STOCK ຍັງມີ shortages", async () => {
    const owner = await bearerFor(app, "owner@role.test");
    const res = await request(server()).post("/orders").set(owner).send({ items: [{ variantId: f.v1.id, quantity: 99 }] }).expect(409);
    expect(res.body.shortages).toEqual([expect.objectContaining({ variantId: f.v1.id, sku: "SKU-1", requested: 99, available: 2 })]);
  });

  it("ERROR_CODES ທຸກໂຕມີ status ໃນຕາຕະລາງ (ບໍ່ຂາດ)", async () => {
    const { statusOfCode } = await import("../src/common/api-error");
    for (const code of ERROR_CODES) expect(statusOfCode(code), code).toBeGreaterThanOrEqual(400);
  });
});
