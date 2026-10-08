import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@oca/database";
import type { AuditLogDto, AuditLogQuery } from "@oca/shared";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";

/** ອ່ານຢ່າງດຽວ: AuditLog ເປັນ append-only, ບໍ່ມີ endpoint ແກ້/ລຶບ */
@Injectable()
export class AuditLogsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(query: AuditLogQuery): Promise<Page<AuditLogDto>> {
    const action = query.action?.endsWith(".*")
      ? { startsWith: query.action.slice(0, -1) }
      : query.action;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(action ? { action } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return toPage(
      rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        ip: row.ip,
        user: row.user,
        before: row.before,
        after: row.after,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** ຄ່າທີ່ມີໃນ log (ສຳລັບ dropdown ກັ່ນຕອງ) */
  async facets(): Promise<{ actions: string[]; entities: string[] }> {
    const [actions, entities] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
      this.prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    ]);
    return { actions: actions.map((row) => row.action), entities: entities.map((row) => row.entity) };
  }
}
