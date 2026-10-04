import { PERMISSIONS, SYSTEM_ROLE_OWNER } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { type SeedDb, seedAuth } from "./seed-auth";

interface FakeRole {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}
interface FakeUser {
  email: string;
  name: string;
  passwordHash: string;
  roleId: string;
}

function createFakeDb() {
  const roles: FakeRole[] = [];
  const users: FakeUser[] = [];
  let seq = 0;

  const db = {
    role: {
      findUnique: async ({ where }: { where: { name: string } }) =>
        roles.find((r) => r.name === where.name) ?? null,
      create: async ({
        data,
      }: {
        data: { name: string; isSystem: boolean; permissions: { create: { permission: string }[] } };
      }) => {
        const role: FakeRole = {
          id: `role${++seq}`,
          name: data.name,
          isSystem: data.isSystem,
          permissions: data.permissions.create.map((p) => p.permission),
        };
        roles.push(role);
        return role;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { permissions: { deleteMany: object; create: { permission: string }[] } };
      }) => {
        const role = roles.find((r) => r.id === where.id);
        if (!role) throw new Error("role not found");
        // One atomic nested write: delete all then create.
        role.permissions = data.permissions.create.map((p) => p.permission);
        return role;
      },
    },
    user: {
      upsert: async ({ where, create }: { where: { email: string }; create: FakeUser }) => {
        const existing = users.find((u) => u.email === where.email);
        if (existing) return existing;
        users.push(create);
        return create;
      },
    },
  };

  return { db: db as unknown as SeedDb, roles, users };
}

const input = { ownerEmail: "owner@example.com", ownerPasswordHash: "hash-1" };

describe("seedAuth", () => {
  it("ສ້າງ 5 role ແລະ OWNER ຄົນທຳອິດ ເມື່ອ DB ເປົ່າ", async () => {
    const { db, roles, users } = createFakeDb();
    await seedAuth(db, input);

    expect(roles).toHaveLength(5);
    const owner = roles.find((r) => r.name === SYSTEM_ROLE_OWNER);
    expect(owner?.isSystem).toBe(true);
    expect(owner?.permissions).toEqual(PERMISSIONS);
    expect(users).toEqual([
      { email: "owner@example.com", name: "Owner", passwordHash: "hash-1", roleId: owner?.id },
    ]);
  });

  it("run ຊ້ຳໄດ້ ບໍ່ສ້າງຊ້ຳ", async () => {
    const { db, roles, users } = createFakeDb();
    await seedAuth(db, input);
    await seedAuth(db, input);
    expect(roles).toHaveLength(5);
    expect(users).toHaveLength(1);
  });

  it("sync permission ຂອງ OWNER ກັບຄືນເປັນທັງໝົດທຸກຄັ້ງ", async () => {
    const { db, roles } = createFakeDb();
    await seedAuth(db, input);
    const owner = roles.find((r) => r.name === SYSTEM_ROLE_OWNER);
    if (owner) owner.permissions = ["staff:read"];
    await seedAuth(db, input);
    expect(owner?.permissions).toEqual(PERMISSIONS);
  });

  it("ບໍ່ຂຽນທັບ permission ຂອງ role ທີ່ Owner ປັບແຕ່ງແລ້ວ", async () => {
    const { db, roles } = createFakeDb();
    await seedAuth(db, input);
    const manager = roles.find((r) => r.name === "MANAGER");
    if (manager) manager.permissions = ["inbox:read"];
    await seedAuth(db, input);
    expect(manager?.permissions).toEqual(["inbox:read"]);
  });

  it("ບໍ່ປ່ຽນລະຫັດຜ່ານຂອງ user ທີ່ມີຢູ່ແລ້ວ", async () => {
    const { db, users } = createFakeDb();
    await seedAuth(db, input);
    await seedAuth(db, { ...input, ownerPasswordHash: "hash-2" });
    expect(users[0]?.passwordHash).toBe("hash-1");
  });
});
