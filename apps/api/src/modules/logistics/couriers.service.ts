import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { CreateCourierInput, UpdateCourierInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";
import { type CourierDto, toCourierDto } from "./logistics.mapper";

@Injectable()
export class CouriersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** ລວມທີ່ປິດ (ໜ້າຕັ້ງຄ່າ); ຟອມສົ່ງອອກກອງ isActive ເອງ */
  async list(): Promise<CourierDto[]> {
    const rows = await this.prisma.courier.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
    return rows.map(toCourierDto);
  }

  async create(input: CreateCourierInput, actor: AuthUser, ip: string | undefined): Promise<CourierDto> {
    try {
      const row = await this.prisma.courier.create({
        data: { code: input.code, name: input.name, trackingUrlTemplate: input.trackingUrlTemplate ?? null, isActive: input.isActive },
      });
      await this.audit.record({ userId: actor.id, action: "courier.create", entity: "Courier", entityId: row.id, after: { ...input }, ip });
      return toCourierDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "Courier code already exists", { fields: ["code"] });
      throw error;
    }
  }

  async update(id: string, input: UpdateCourierInput, actor: AuthUser, ip: string | undefined): Promise<CourierDto> {
    const existing = await this.prisma.courier.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw apiError("COURIER_NOT_FOUND", "Courier not found");
    try {
      const row = await this.prisma.courier.update({
        where: { id },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.trackingUrlTemplate !== undefined ? { trackingUrlTemplate: input.trackingUrlTemplate } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit.record({ userId: actor.id, action: "courier.update", entity: "Courier", entityId: id, after: { ...input }, ip });
      return toCourierDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "Courier code already exists", { fields: ["code"] });
      throw error;
    }
  }
}
