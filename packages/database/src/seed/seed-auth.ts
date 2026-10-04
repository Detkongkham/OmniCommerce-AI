import { SYSTEM_ROLE_OWNER } from "@oca/shared";
import type { PrismaClient } from "../generated/client";
import { ROLE_DEFINITIONS } from "./roles";

export type SeedDb = Pick<PrismaClient, "role" | "rolePermission" | "user">;

export interface SeedAuthInput {
  ownerEmail: string;
  ownerPasswordHash: string;
}

export async function seedAuth(db: SeedDb, input: SeedAuthInput): Promise<void> {
  for (const def of ROLE_DEFINITIONS) {
    const existing = await db.role.findUnique({ where: { name: def.name } });
    if (!existing) {
      await db.role.create({
        data: {
          name: def.name,
          description: def.description,
          isSystem: def.isSystem,
          permissions: { create: def.permissions.map((permission) => ({ permission })) },
        },
      });
    } else if (def.isSystem) {
      await db.rolePermission.deleteMany({ where: { roleId: existing.id } });
      await db.rolePermission.createMany({
        data: def.permissions.map((permission) => ({ roleId: existing.id, permission })),
      });
    }
  }

  const ownerRole = await db.role.findUnique({ where: { name: SYSTEM_ROLE_OWNER } });
  if (!ownerRole) {
    throw new Error(`Role ${SYSTEM_ROLE_OWNER} was not created`);
  }

  await db.user.upsert({
    where: { email: input.ownerEmail },
    create: {
      email: input.ownerEmail,
      name: "Owner",
      passwordHash: input.ownerPasswordHash,
      roleId: ownerRole.id,
    },
    update: {},
  });
}
