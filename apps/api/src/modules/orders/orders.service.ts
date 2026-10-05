import { createHash } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { type Prisma, type PrismaClient, releaseMany, reserveMany, shipMany } from "@oca/database";
import {
  type CancelOrderInput,
  type CreateOrderInput,
  type OrderListQuery,
  type OrderStatus,
  calculateOrderTotals,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";
import { ensureStoreSetting } from "../inventory/ensure-store-setting";
import {
  type OrderDetailDto,
  type OrderDetailRow,
  type OrderListItemDto,
  orderDetailInclude,
  orderListInclude,
  toOrderDetail,
  toOrderListItem,
} from "./orders.mapper";
import { apiError } from "../../common/api-error";

/** sha256 ຂອງ payload ທີ່ zod parse ແລ້ວ (ລຳດັບ key ຄົງທີ່ຕາມ schema) */
function hashInput(input: CreateOrderInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: OrderListQuery): Promise<Page<OrderListItemDto>> {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: "insensitive" } },
              { customer: { name: { contains: query.q, mode: "insensitive" } } },
              { customer: { phone: { contains: query.q } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderListInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.order.count({ where }),
    ]);
    return toPage(rows.map(toOrderListItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<OrderDetailDto> {
    return toOrderDetail(await this.requireDetail(id));
  }

  /** ສ້າງບິນ + ຈອງສະຕ໋ອກ ໃນ transaction ດຽວ. ສະຕ໋ອກບໍ່ພໍ → InsufficientStockError (filter ແປເປັນ 409) ແລະ rollback ທັງໝົດ. */
  async create(
    input: CreateOrderInput,
    actor: AuthUser,
    ip: string | undefined,
    idempotencyKey?: string,
  ): Promise<OrderDetailDto> {
    const idempotencyHash = idempotencyKey ? hashInput(input) : undefined;
    if (idempotencyKey && idempotencyHash) {
      const replay = await this.findReplay(idempotencyKey, idempotencyHash);
      if (replay) return replay;
    }
    let orderId: string;
    try {
      orderId = await this.createInTransaction(input, actor, idempotencyKey, idempotencyHash);
    } catch (error) {
      // ສອງ request ດ້ວຍ key ດຽວກັນແລ່ນພ້ອມກັນ: ຕົວທີ່ແພ້ unique ຖືກ rollback ທັງໝົດ (ລວມການຈອງສະຕ໋ອກ) ແລ້ວຄືນບິນຂອງຕົວທີ່ຊະນະ
      if (idempotencyKey && idempotencyHash && isUniqueViolation(error)) {
        const replay = await this.findReplay(idempotencyKey, idempotencyHash);
        if (replay) return replay;
      }
      throw error;
    }

    const created = await this.requireDetail(orderId);
    await this.audit.record({
      userId: actor.id,
      action: "order.create",
      entity: "Order",
      entityId: orderId,
      after: {
        orderNumber: created.orderNumber,
        status: created.status,
        total: created.total.toFixed(2),
        itemCount: created.items.length,
      },
      ip,
    });
    return toOrderDetail(created);
  }

  /** ບິນເດີມຂອງ key ນີ້ (ຖ້າມີ). payload ຕ່າງກັນ = ໃຊ້ key ຜິດ → 409 */
  private async findReplay(key: string, hash: string): Promise<OrderDetailDto | undefined> {
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, idempotencyHash: true },
    });
    if (!existing) return undefined;
    if (existing.idempotencyHash !== hash) {
      throw apiError("CONFLICT", "Idempotency-Key was already used with a different request body");
    }
    return toOrderDetail(await this.requireDetail(existing.id));
  }

  private async createInTransaction(
    input: CreateOrderInput,
    actor: AuthUser,
    idempotencyKey: string | undefined,
    idempotencyHash: string | undefined,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const settings = await ensureStoreSetting(tx);

      // 1) ສາງ
      let defaultWarehouseId: string | undefined;
      if (input.items.some((item) => item.warehouseId === undefined)) {
        const warehouse = await tx.warehouse.findFirst({
          where: { isDefault: true, isActive: true },
          select: { id: true },
        });
        if (!warehouse) throw apiError("NO_DEFAULT_WAREHOUSE", "No active default warehouse is configured");
        defaultWarehouseId = warehouse.id;
      }
      const resolved = input.items.map((item) => {
        const warehouseId = item.warehouseId ?? defaultWarehouseId;
        if (!warehouseId) throw apiError("NO_DEFAULT_WAREHOUSE", "No active default warehouse is configured");
        return { ...item, warehouseId };
      });
      const keys = resolved.map((item) => `${item.variantId}|${item.warehouseId}`);
      if (new Set(keys).size !== keys.length) {
        throw new BadRequestException("Duplicate (variant, warehouse) lines");
      }
      const warehouseIds = [...new Set(resolved.map((item) => item.warehouseId))];
      const warehouses = await tx.warehouse.findMany({ where: { id: { in: warehouseIds } } });
      if (warehouses.length !== warehouseIds.length) throw apiError("WAREHOUSE_NOT_FOUND", "Warehouse not found");
      if (warehouses.some((warehouse) => !warehouse.isActive)) throw apiError("WAREHOUSE_INACTIVE", "Warehouse is inactive");

      // 2) variants
      const variantIds = [...new Set(resolved.map((item) => item.variantId))];
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: { select: { name: true, status: true } } },
      });
      const variantById = new Map(variants.map((variant) => [variant.id, variant]));

      // 3) ລູກຄ້າ
      let customerId: string | null = null;
      if (input.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
        if (!customer) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
        customerId = customer.id;
      } else if (input.customer) {
        const customer = await tx.customer.upsert({
          where: { phone: input.customer.phone },
          create: { name: input.customer.name, phone: input.customer.phone, email: input.customer.email },
          update: {},
        });
        customerId = customer.id;
      }

      // 4) ເງິນ
      const lines = resolved.map((item) => {
        const variant = variantById.get(item.variantId);
        if (!variant) throw apiError("VARIANT_NOT_FOUND", `Variant ${item.variantId} not found`);
        if (!variant.isActive || variant.product.status !== "ACTIVE") {
          throw apiError("VARIANT_NOT_AVAILABLE", `Variant ${variant.sku} is not available for sale`, { sku: variant.sku });
        }
        return { item, variant };
      });
      let totals: ReturnType<typeof calculateOrderTotals>;
      try {
        totals = calculateOrderTotals({
          lines: lines.map(({ item, variant }) => ({
            unitPrice: variant.price.toFixed(2),
            quantity: item.quantity,
            discount: item.discount,
          })),
          shippingFee: input.shippingFee,
          vatRate: settings.vatRate.toString(),
          pricesIncludeVat: settings.pricesIncludeVat,
        });
      } catch (error) {
        if (error instanceof RangeError) throw new BadRequestException(error.message);
        throw error;
      }

      // 5) ເລກບິນ + ບັນທຶກ
      const [sequenceRow] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('"Order_number_seq"') AS n`;
      if (!sequenceRow) throw new Error("Order_number_seq returned no row");
      const n = sequenceRow.n;
      const minutes = input.reservationMinutes ?? settings.reservationMinutes;
      const order = await tx.order.create({
        data: {
          orderNumber: `SO-${String(n).padStart(6, "0")}`,
          customerId,
          channel: "OFFLINE",
          source: "MANUAL",
          currency: settings.baseCurrency,
          exchangeRate: 1,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          shippingFee: input.shippingFee,
          vatRate: settings.vatRate,
          vatAmount: totals.vatAmount,
          total: totals.total,
          shippingName: input.shippingName,
          shippingPhone: input.shippingPhone,
          shippingAddress: input.shippingAddress,
          note: input.note,
          idempotencyKey,
          idempotencyHash,
          reservedUntil: new Date(Date.now() + minutes * 60_000),
          items: {
            create: lines.map(({ item, variant }, index) => ({
              variantId: variant.id,
              warehouseId: item.warehouseId,
              productName: variant.product.name,
              variantName: variant.name,
              sku: variant.sku,
              unitPrice: variant.price,
              unitCost: variant.costPrice,
              quantity: item.quantity,
              discount: item.discount,
              lineTotal: totals.lines[index]?.lineTotal ?? "0.00",
            })),
          },
        },
        select: { id: true },
      });

      // 6) ຈອງສະຕ໋ອກ (ບໍ່ພໍ → throw → rollback ທັງບິນ)
      await reserveMany(
        tx,
        resolved.map((item) => ({ variantId: item.variantId, warehouseId: item.warehouseId, quantity: item.quantity })),
        { orderId: order.id, actorId: actor.id },
      );
      return order.id;
    });
  }

  pay(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "pay", {
      from: ["PENDING_PAYMENT"],
      to: "PAID",
      data: { paidAt: new Date() },
      // ຕ້ອງຍັງບໍ່ໝົດເວລາຈອງ: guard ຢູ່ໃນ WHERE ເພື່ອແຂ່ງກັບ worker expire ໄດ້ຢ່າງປອດໄພ
      // reservedUntil = null (ບໍ່ມີກຳນົດ) ຈ່າຍໄດ້ສະເໝີ
      extraWhere: { OR: [{ reservedUntil: null }, { reservedUntil: { gt: new Date() } }] },
      stock: null,
      actor,
      ip,
    });
  }

  pack(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "pack", { from: ["PAID"], to: "PACKING", data: {}, stock: null, actor, ip });
  }

  ship(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "ship", {
      from: ["PACKING"],
      to: "SHIPPED",
      data: { shippedAt: new Date() },
      stock: "ship",
      actor,
      ip,
    });
  }

  complete(id: string, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "complete", {
      from: ["SHIPPED"],
      to: "COMPLETED",
      data: { completedAt: new Date() },
      stock: null,
      actor,
      ip,
    });
  }

  cancel(id: string, input: CancelOrderInput, actor: AuthUser, ip: string | undefined) {
    return this.transition(id, "cancel", {
      from: ["PENDING_PAYMENT", "PAID", "PACKING"],
      to: "CANCELLED",
      data: { cancelledAt: new Date() },
      stock: "release",
      reason: input.reason,
      actor,
      ip,
    });
  }

  /**
   * UPDATE ... WHERE id AND status IN (from) [AND extraWhere]: ກະທົບ 0 ແຖວ = ບໍ່ມີບິນ ຫຼື ສະຖານະບໍ່ຖືກ ຫຼື ແພ້ການແຂ່ງ.
   * ເມື່ອຜ່ານ ເຮັດການຕັດ/ປ່ອຍສະຕ໋ອກໃນ transaction ດຽວກັນ (ຜິດ → rollback ທັງສະຖານະ).
   */
  private async transition(
    id: string,
    action: "pay" | "pack" | "ship" | "complete" | "cancel",
    options: {
      from: OrderStatus[];
      to: OrderStatus;
      data: Prisma.OrderUpdateManyMutationInput;
      extraWhere?: Prisma.OrderWhereInput;
      stock: "ship" | "release" | null;
      reason?: string;
      actor: AuthUser;
      ip: string | undefined;
    },
  ): Promise<OrderDetailDto> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, status: { in: options.from }, ...options.extraWhere },
        data: { status: options.to, ...options.data },
      });
      if (count === 0) return false;

      if (options.stock) {
        const items = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { variantId: true, warehouseId: true, quantity: true },
        });
        const ctx = { orderId: id, actorId: options.actor.id };
        if (options.stock === "ship") await shipMany(tx, items, ctx);
        else await releaseMany(tx, items, ctx);
      }
      if (options.reason) {
        const current = await tx.order.findUniqueOrThrow({ where: { id }, select: { note: true } });
        await tx.order.update({
          where: { id },
          data: { note: [current.note, `Cancelled: ${options.reason}`].filter(Boolean).join("\n") },
        });
      }
      return true;
    });

    if (!changed) await this.failTransition(id, action);

    await this.audit.record({
      userId: options.actor.id,
      action: `order.${action}`,
      entity: "Order",
      entityId: id,
      after: { status: options.to, ...(options.reason ? { reason: options.reason } : {}) },
      ip: options.ip,
    });
    return toOrderDetail(await this.requireDetail(id));
  }

  private async failTransition(id: string, action: string): Promise<never> {
    const order = await this.prisma.order.findUnique({ where: { id }, select: { status: true, reservedUntil: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
    if (
      action === "pay" &&
      order.status === "PENDING_PAYMENT" &&
      order.reservedUntil !== null &&
      order.reservedUntil.getTime() <= Date.now()
    ) {
      throw apiError("RESERVATION_EXPIRED", "Reservation expired; the order can no longer be paid");
    }
    throw apiError("ORDER_INVALID_STATE", `Order is ${order.status}; cannot ${action}`, { status: order.status });
  }

  async requireDetail(id: string): Promise<OrderDetailRow> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
    if (!row) throw apiError("ORDER_NOT_FOUND", "Order not found");
    return row;
  }
}
