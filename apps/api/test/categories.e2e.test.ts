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
    const root = await create({ name: "Alpha", position: 5 }).expect(201);
    await create({ name: "Zeta", position: 0 }).expect(201);
    await db.product.create({ data: { name: "P", slug: "p", categoryId: root.body.id } });

    const list = await request(server()).get("/categories").set(reader).expect(200);
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["Zeta", "Alpha"]);
    expect(list.body[1]).toMatchObject({ name: "Alpha", productCount: 1, parentId: null });
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

  it("DELETE ທີ່ບໍ່ມີ id → 404", async () => {
    await request(server()).delete("/categories/nope").set(writer).expect(404);
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
