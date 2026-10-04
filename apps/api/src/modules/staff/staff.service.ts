import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { type CreateStaffInput, SYSTEM_ROLE_OWNER, type UpdateStaffInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { PasswordService } from "../../auth/password.service";
import type { AuthUser } from "../../common/auth-types";
import { PRISMA } from "../../prisma/prisma.module";
import { type StaffDto, staffInclude, staffSnapshot, toStaffDto } from "./staff.mapper";

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export function isOwner(actor: AuthUser): boolean {
  return actor.roleName === SYSTEM_ROLE_OWNER;
}

@Injectable()
export class StaffService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<StaffDto[]> {
    const users = await this.prisma.user.findMany({ include: staffInclude, orderBy: { createdAt: "asc" } });
    return users.map(toStaffDto);
  }

  async get(id: string): Promise<StaffDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: staffInclude });
    if (!user) throw new NotFoundException("Staff not found");
    return toStaffDto(user);
  }

  async create(input: CreateStaffInput, actor: AuthUser, ip: string | undefined): Promise<StaffDto> {
    const role = await this.requireRole(input.roleId);
    if (role.name === SYSTEM_ROLE_OWNER && !isOwner(actor)) {
      throw new ForbiddenException("Only an OWNER can assign the OWNER role");
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await this.passwords.hash(input.password),
          roleId: input.roleId,
        },
        include: staffInclude,
      });
      await this.audit.record({
        userId: actor.id,
        action: "staff.create",
        entity: "User",
        entityId: user.id,
        after: staffSnapshot(user),
        ip,
      });
      return toStaffDto(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Email already in use");
      throw error;
    }
  }

  async update(id: string, input: UpdateStaffInput, actor: AuthUser, ip: string | undefined): Promise<StaffDto> {
    const before = await this.prisma.user.findUnique({ where: { id }, include: staffInclude });
    if (!before) throw new NotFoundException("Staff not found");

    const actorIsOwner = isOwner(actor);
    if (before.role.name === SYSTEM_ROLE_OWNER && !actorIsOwner) {
      throw new ForbiddenException("Only an OWNER can modify an OWNER");
    }
    const targetRole = input.roleId === undefined ? undefined : await this.requireRole(input.roleId);
    if (targetRole?.name === SYSTEM_ROLE_OWNER && !actorIsOwner) {
      throw new ForbiddenException("Only an OWNER can assign the OWNER role");
    }
    if (
      actor.id === id &&
      ((input.roleId !== undefined && input.roleId !== before.roleId) || input.isActive === false)
    ) {
      throw new ForbiddenException("Cannot change your own role or status");
    }

    const leavesOwner =
      before.isActive &&
      before.role.name === SYSTEM_ROLE_OWNER &&
      (input.isActive === false || (input.roleId !== undefined && input.roleId !== before.roleId));
    if (leavesOwner) {
      const otherOwners = await this.prisma.user.count({
        where: { id: { not: id }, isActive: true, role: { name: SYSTEM_ROLE_OWNER } },
      });
      if (otherOwners === 0) throw new ConflictException("Cannot remove the last active OWNER");
    }
    const passwordHash = input.password === undefined ? undefined : await this.passwords.hash(input.password);
    const revokeSessions = input.password !== undefined || input.isActive === false;

    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          roleId: input.roleId,
          isActive: input.isActive,
          passwordHash,
        },
        include: staffInclude,
      });
      if (revokeSessions) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });

    await this.audit.record({
      userId: actor.id,
      action: "staff.update",
      entity: "User",
      entityId: id,
      before: staffSnapshot(before),
      after: { ...staffSnapshot(after), passwordChanged: input.password !== undefined },
      ip,
    });
    return toStaffDto(after);
  }

  private async requireRole(roleId: string): Promise<{ id: string; name: string }> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
    if (!role) throw new BadRequestException("Role not found");
    return role;
  }
}
