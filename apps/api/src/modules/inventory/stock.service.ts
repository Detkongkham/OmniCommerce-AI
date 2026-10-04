import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  type Prisma,
  type PrismaClient,
  adjust as adjustStock,
  receive as receiveStock,
  returnStock as returnToStock,
  transfer as transferStock,
} from "@oca/database";
import type {
  AdjustStockInput,
  ReceiveStockInput,
  ReturnStockInput,
  StockListQuery,
  StockMovementQuery,
  StockThresholdInput,
  TransferStockInput,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import {
  type StockLevelDto,
  type StockMovementDto,
  movementInclude,
  stockLevelInclude,
  toMovementDto,
  toStockLevelDto,
} from "./stock.mapper";

@Injectable()
export class StockService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ----- ອ່ານ -----
  async listLevels(query: StockListQuery): Promise<Page<StockLevelDto>> {
    const where: Prisma.StockLevelWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.q
        ? {
            variant: {
              OR: [
                { sku: { contains: query.q, mode: "insensitive" } },
                { name: { contains: query.q, mode: "insensitive" } },
                { product: { name: { contains: query.q, mode: "insensitive" } } },
              ],
            },
          }
        : {}),
    };
    if (query.lowStock) {
      // Prisma ປຽບທຽບສອງຖັນບໍ່ໄດ້ -> ອ່ານ id ດ້ວຍ SQL (ອ່ານຢ່າງດຽວ) ແລ້ວ filter
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "StockLevel"
        WHERE "lowStockThreshold" IS NOT NULL AND "onHand" - "reserved" <= "lowStockThreshold"`;
      where.id = { in: rows.map((row) => row.id) };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockLevel.findMany({
        where,
        include: stockLevelInclude,
        orderBy: [{ variant: { sku: "asc" } }, { warehouse: { code: "asc" } }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.stockLevel.count({ where }),
    ]);
    return toPage(rows.map(toStockLevelDto), total, query.page, query.pageSize);
  }

  async listMovements(query: StockMovementQuery): Promise<Page<StockMovementDto>> {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const actorIds = [...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
    const users = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(users.map((user) => [user.id, user.name]));
    return toPage(
      rows.map((row) => toMovementDto(row, names)),
      total,
      query.page,
      query.pageSize,
    );
  }

  // ----- ເຄື່ອນໄຫວ -----
  async receive(input: ReceiveStockInput, actor: AuthUser, ip: string | undefined): Promise<StockLevelDto> {
    await this.requireTargets(input.variantId, [input.warehouseId]);
    await this.prisma.$transaction((tx) =>
      receiveStock(tx, input, { actorId: actor.id, note: input.note }),
    );
    return this.finish("stock.receive", actor, ip, input, input.variantId, input.warehouseId);
  }

  async adjust(input: AdjustStockInput, actor: AuthUser, ip: string | undefined): Promise<StockLevelDto> {
    await this.requireTargets(input.variantId, [input.warehouseId]);
    await this.prisma.$transaction((tx) =>
      adjustStock(tx, input, { actorId: actor.id, note: input.note }),
    );
    return this.finish("stock.adjust", actor, ip, input, input.variantId, input.warehouseId);
  }

  async returnStock(input: ReturnStockInput, actor: AuthUser, ip: string | undefined): Promise<StockLevelDto> {
    await this.requireTargets(input.variantId, [input.warehouseId]);
    if (input.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: input.orderId }, select: { id: true } });
      if (!order) throw new NotFoundException("Order not found");
    }
    await this.prisma.$transaction((tx) =>
      returnToStock(tx, input, { actorId: actor.id, note: input.note, orderId: input.orderId }),
    );
    return this.finish("stock.return", actor, ip, input, input.variantId, input.warehouseId);
  }

  async transfer(
    input: TransferStockInput,
    actor: AuthUser,
    ip: string | undefined,
  ): Promise<{ from: StockLevelDto; to: StockLevelDto }> {
    await this.requireTargets(input.variantId, [input.fromWarehouseId, input.toWarehouseId]);
    await this.prisma.$transaction((tx) =>
      transferStock(tx, input, { actorId: actor.id, note: input.note }),
    );
    const from = await this.level(input.variantId, input.fromWarehouseId);
    const to = await this.level(input.variantId, input.toWarehouseId);
    await this.audit.record({
      userId: actor.id,
      action: "stock.transfer",
      entity: "StockLevel",
      entityId: from.id,
      after: { ...input },
      ip,
    });
    return { from, to };
  }

  async setThreshold(
    id: string,
    input: StockThresholdInput,
    actor: AuthUser,
    ip: string | undefined,
  ): Promise<StockLevelDto> {
    const before = await this.prisma.stockLevel.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Stock level not found");
    const row = await this.prisma.stockLevel.update({
      where: { id },
      data: { lowStockThreshold: input.lowStockThreshold },
      include: stockLevelInclude,
    });
    await this.audit.record({
      userId: actor.id,
      action: "stock.threshold",
      entity: "StockLevel",
      entityId: id,
      before: { lowStockThreshold: before.lowStockThreshold },
      after: { lowStockThreshold: row.lowStockThreshold },
      ip,
    });
    return toStockLevelDto(row);
  }

  // ----- helpers -----
  private async requireTargets(variantId: string, warehouseIds: string[]): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
    if (!variant) throw new NotFoundException("Variant not found");
    const warehouses = await this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } });
    if (warehouses.length !== new Set(warehouseIds).size) throw new NotFoundException("Warehouse not found");
    if (warehouses.some((warehouse) => !warehouse.isActive)) {
      throw new ConflictException("Warehouse is inactive");
    }
  }

  private async level(variantId: string, warehouseId: string): Promise<StockLevelDto> {
    const row = await this.prisma.stockLevel.findUniqueOrThrow({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      include: stockLevelInclude,
    });
    return toStockLevelDto(row);
  }

  private async finish(
    action: string,
    actor: AuthUser,
    ip: string | undefined,
    input: object,
    variantId: string,
    warehouseId: string,
  ): Promise<StockLevelDto> {
    const level = await this.level(variantId, warehouseId);
    await this.audit.record({
      userId: actor.id,
      action,
      entity: "StockLevel",
      entityId: level.id,
      after: { ...input },
      ip,
    });
    return level;
  }
}
