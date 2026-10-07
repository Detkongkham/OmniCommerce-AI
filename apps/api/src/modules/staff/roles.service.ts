import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { RoleInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { PRISMA } from "../../prisma/prisma.module";
import { type RoleDto, roleInclude, roleSnapshot, toRoleDto } from "./staff.mapper";
import { isOwner, prismaErrorCode, uniqueViolationFields } from "./staff.service";
import { apiError } from "../../common/api-error";

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
    if (!role) throw apiError("ROLE_NOT_FOUND", "Role not found");
    return toRoleDto(role);
  }

  async create(input: RoleInput, actor: AuthUser, ip: string | undefined): Promise<RoleDto> {
    this.assertCanGrant(input, actor);
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
      throw this.mapWriteError(error);
    }
  }

  async update(id: string, input: RoleInput, actor: AuthUser, ip: string | undefined): Promise<RoleDto> {
    this.assertCanGrant(input, actor);
    const before = await this.get(id);
    if (before.isSystem) throw new ConflictException("System role cannot be modified");

    try {
      const role = await this.prisma.$transaction(async (tx) => {
        // Serialise concurrent updates of the same role.
        await tx.$queryRaw`SELECT "id" FROM "Role" WHERE "id" = ${id} FOR UPDATE`;
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
      throw this.mapWriteError(error);
    }
  }

  async remove(id: string, actor: AuthUser, ip: string | undefined): Promise<void> {
    const role = await this.get(id);
    if (role.isSystem) throw new ConflictException("System role cannot be deleted");
    if (role.userCount > 0) throw new ConflictException("Role is assigned to users");

    try {
      await this.prisma.role.delete({ where: { id } });
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === "P2025") throw apiError("ROLE_NOT_FOUND", "Role not found");
      if (code === "P2003") throw new ConflictException("Role is assigned to users");
      throw error;
    }
    await this.audit.record({
      userId: actor.id,
      action: "role.delete",
      entity: "Role",
      entityId: id,
      before: roleSnapshot(role),
      ip,
    });
  }

  private mapWriteError(error: unknown): unknown {
    const fields = uniqueViolationFields(error);
    if (fields) {
      return fields.some((f) => f.includes("name"))
        ? apiError("DUPLICATE_VALUE", "Role name already in use")
        : new ConflictException("Conflict");
    }
    if (prismaErrorCode(error) === "P2025") return apiError("ROLE_NOT_FOUND", "Role not found");
    return error;
  }

  private assertCanGrant(input: RoleInput, actor: AuthUser): void {
    if (isOwner(actor)) return;
    const held = new Set<string>(actor.permissions);
    if (input.permissions.some((permission) => !held.has(permission))) {
      throw new ForbiddenException("Cannot grant permissions you do not have");
    }
  }
}
