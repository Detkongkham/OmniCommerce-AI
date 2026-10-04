import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

type WarehouseRow = Awaited<ReturnType<PrismaClient["warehouse"]["findUniqueOrThrow"]>>;

export function toWarehouseDto(row: WarehouseRow): WarehouseDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    isDefault: row.isDefault,
    isActive: row.isActive,
  };
}

@Injectable()
export class WarehousesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<WarehouseDto[]> {
    const rows = await this.prisma.warehouse.findMany({ orderBy: [{ isDefault: "desc" }, { code: "asc" }] });
    return rows.map(toWarehouseDto);
  }

  async create(input: CreateWarehouseInput, actor: AuthUser, ip: string | undefined): Promise<WarehouseDto> {
    try {
      const row = await this.prisma.warehouse.create({
        data: { code: input.code, name: input.name, address: input.address, isActive: input.isActive },
      });
      await this.record(actor, "warehouse.create", row.id, null, row, ip);
      return toWarehouseDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Warehouse code already in use");
      throw error;
    }
  }

  async update(id: string, input: UpdateWarehouseInput, actor: AuthUser, ip: string | undefined): Promise<WarehouseDto> {
    const before = await this.require(id);
    if (input.isActive === false && before.isActive) {
      if (before.isDefault) throw new ConflictException("Cannot deactivate the default warehouse");
      const stocked = await this.prisma.stockLevel.findFirst({
        where: { warehouseId: id, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] },
        select: { id: true },
      });
      if (stocked) throw new ConflictException("Cannot deactivate a warehouse that still holds stock");
    }
    try {
      const after = await this.prisma.warehouse.update({
        where: { id },
        data: { code: input.code, name: input.name, address: input.address, isActive: input.isActive },
      });
      await this.record(actor, "warehouse.update", id, before, after, ip);
      return toWarehouseDto(after);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Warehouse code already in use");
      throw error;
    }
  }

  async setDefault(id: string, actor: AuthUser, ip: string | undefined): Promise<WarehouseDto> {
    const before = await this.require(id);
    if (!before.isActive) throw new ConflictException("Cannot make an inactive warehouse the default");
    try {
      const after = await this.prisma.$transaction(async (tx) => {
        await tx.warehouse.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
        return tx.warehouse.update({ where: { id }, data: { isDefault: true } });
      });
      await this.record(actor, "warehouse.setDefault", id, before, after, ip);
      return toWarehouseDto(after);
    } catch (error) {
      // ສອງຄໍາຂໍຕັ້ງ default ພ້ອມກັນ: partial unique index ກັນໄວ້ ຜູ້ແພ້ໄດ້ 409
      if (isUniqueViolation(error)) throw new ConflictException("Default warehouse changed concurrently, retry");
      throw error;
    }
  }

  private async require(id: string): Promise<WarehouseRow> {
    const row = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Warehouse not found");
    return row;
  }

  private record(actor: AuthUser, action: string, id: string, before: WarehouseRow | null, after: WarehouseRow, ip: string | undefined) {
    return this.audit.record({
      userId: actor.id,
      action,
      entity: "Warehouse",
      entityId: id,
      before: before ? { ...toWarehouseDto(before) } : undefined,
      after: { ...toWarehouseDto(after) },
      ip,
    });
  }
}
