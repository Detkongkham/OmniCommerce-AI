import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { RoleInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { PRISMA } from "../../prisma/prisma.module";
import { type RoleDto, roleInclude, roleSnapshot, toRoleDto } from "./staff.mapper";
import { isUniqueViolation } from "./staff.service";

@Injectable()
export class RolesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({ include: roleInclude, orderBy: { createdAt: "asc" } });
    return roles.map(toRoleDto);
  }

  async get(id: string): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw new NotFoundException("Role not found");
    return toRoleDto(role);
  }

  async create(input: RoleInput, actor: AuthUser, ip: string | undefined): Promise<RoleDto> {
    try {
      const role = await this.prisma.role.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          permissions: { create: input.permissions.map((permission) => ({ permission })) },
        },
        include: roleInclude,
      });
      const dto = toRoleDto(role);
      await this.audit.record({
        userId: actor.id,
        action: "role.create",
        entity: "Role",
        entityId: role.id,
        after: roleSnapshot(dto),
        ip,
      });
      return dto;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Role name already in use");
      throw error;
    }
  }

  async update(id: string, input: RoleInput, actor: AuthUser, ip: string | undefined): Promise<RoleDto> {
    const before = await this.get(id);
    if (before.isSystem) throw new ConflictException("System role cannot be modified");

    try {
      const role = await this.prisma.$transaction(async (tx) => {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        return tx.role.update({
          where: { id },
          data: {
            name: input.name,
            description: input.description ?? null,
            permissions: { create: input.permissions.map((permission) => ({ permission })) },
          },
          include: roleInclude,
        });
      });
      const dto = toRoleDto(role);
      await this.audit.record({
        userId: actor.id,
        action: "role.update",
        entity: "Role",
        entityId: id,
        before: roleSnapshot(before),
        after: roleSnapshot(dto),
        ip,
      });
      return dto;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Role name already in use");
      throw error;
    }
  }

  async remove(id: string, actor: AuthUser, ip: string | undefined): Promise<void> {
    const role = await this.get(id);
    if (role.isSystem) throw new ConflictException("System role cannot be deleted");
    if (role.userCount > 0) throw new ConflictException("Role is assigned to users");

    await this.prisma.role.delete({ where: { id } });
    await this.audit.record({
      userId: actor.id,
      action: "role.delete",
      entity: "Role",
      entityId: id,
      before: roleSnapshot(role),
      ip,
    });
  }
}
