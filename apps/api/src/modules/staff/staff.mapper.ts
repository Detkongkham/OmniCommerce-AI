import type { Prisma } from "@oca/database";
import { type Permission, isPermission } from "@oca/shared";

export const staffInclude = { role: true } as const;
export type StaffRow = Prisma.UserGetPayload<{ include: typeof staffInclude }>;

export interface StaffDto {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roleId: string;
  roleName: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function toStaffDto(user: StaffRow): StaffDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    roleId: user.roleId,
    roleName: user.role.name,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

/** ຂໍ້ມູນທີ່ປອດໄພສຳລັບ AuditLog (ບໍ່ມີ passwordHash ແລະ ບໍ່ມີ Date). */
export function staffSnapshot(user: StaffRow): Prisma.InputJsonObject {
  return {
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    roleId: user.roleId,
    roleName: user.role.name,
  };
}

export const roleInclude = { permissions: true, _count: { select: { users: true } } } as const;
export type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
}

export function toRoleDto(role: RoleRow): RoleDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions
      .map((p) => p.permission)
      .filter(isPermission)
      .sort(),
    userCount: role._count.users,
  };
}

export function roleSnapshot(role: RoleDto): Prisma.InputJsonObject {
  return {
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions,
  };
}
