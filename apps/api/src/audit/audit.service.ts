import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@oca/database";
import { PRISMA } from "../prisma/prisma.module";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: entry.before,
        after: entry.after,
        ip: entry.ip ?? null,
      },
    });
  }
}
