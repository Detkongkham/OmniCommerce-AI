import { createHash } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { type OrderSource, type Prisma, type PrismaClient, releaseCfClaims, releaseMany, reserveMany, shipMany } from "@oca/database";
import {
  type CancelOrderInput,
  type CreateOrderInput,
  type OrderListQuery,
  type OrderStatus,
  type SalesChannel,
  calculateOrderTotals,
  hasPermission,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { LiveEventsService } from "../live-cf/live-events.service";
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

/** ແຫຼ່ງທີ່ມາຂອງບິນທີ່ຖືກສ້າງໂດຍລະບົບ (CF Engine); ບິນຈາກແຊັດໃຊ້ conversationId ແທນ */
export interface OrderOrigin {
  channel: SalesChannel;
  source: OrderSource;
  liveSessionId: string;
}

/** sha256 ຂອງ payload ທີ່ zod parse ແລ້ວ (ລຳດັບ key ຄົງທີ່ຕາມ schema) */
function hashInput(input: CreateOrderInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LiveEventsService) private readonly liveEvents: LiveEventsService,
  ) {}

  async list(query: OrderListQuery): Promise<Page<OrderListItemDto>> {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
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
    // ຜູກບິນກັບເຄສ = ເຮັດວຽກແຊັດ: ຕ້ອງມີ inbox:write ເພີ່ມ. ກວດກ່ອນຫາເຄສ (ບໍ່ຮົ່ວວ່າເຄສມີ/ບໍ່ມີ ໃຫ້ຜູ້ທີ່ບໍ່ມີສິດ inbox)
    if (input.conversationId !== undefined && !hasPermission(actor.permissions, "inbox:write")) {
      throw apiError("FORBIDDEN", "Opening an order from a conversation requires inbox:write");
    }
    const idempotencyHash = idempotencyKey ? hashInput(input) : undefined;
    if (idempotencyKey && idempotencyHash) {
      const replay = await this.findReplay(idempotencyKey, idempotencyHash);
      if (replay) return replay;
    }
    let orderId: string;
    try {
      orderId = await this.createInTransaction(input, actor.id, idempotencyKey, idempotencyHash);
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
        conversationId: created.conversationId,
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

  /** outerTx = ໃຊ້ transaction ຂອງຜູ້ເອີ້ນ (CF Engine ທີ່ຕ້ອງ atomic ກັບ ledger); ບໍ່ໃສ່ = ເປີດ transaction ເອງ */
  private async createInTransaction(
    input: CreateOrderInput,
    actorId: string | null,
    idempotencyKey: string | undefined,
    idempotencyHash: string | undefined,
    origin?: OrderOrigin,
    outerTx?: Prisma.TransactionClient,
  ): Promise<string> {
    const run = async (tx: Prisma.TransactionClient): Promise<string> => {
      const settings = await ensureStoreSetting(tx);

      // 0) ເຄສ (ຖ້າເປີດຈາກແຊັດ): channel ຕາມເຄສ, source = CHAT. ບໍ່ພົບ → 404 ກ່ອນຈອງສະຕ໋ອກ
      let conversation: { id: string; channel: SalesChannel } | null = null;
      if (input.conversationId !== undefined) {
        conversation = await tx.conversation.findUnique({
          where: { id: input.conversationId },
          select: { id: true, channel: true },
        });
        if (!conversation) throw apiError("CONVERSATION_NOT_FOUND", "Conversation not found");
      }

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
          channel: conversation?.channel ?? origin?.channel ?? "OFFLINE",
          source: conversation ? "CHAT" : (origin?.source ?? "MANUAL"),
          conversationId: conversation?.id,
          liveSessionId: origin?.liveSessionId,
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
        { orderId: order.id, actorId },
      );
      return order.id;
    };
    return outerTx ? run(outerTx) : this.prisma.$transaction(run);
  }

  /**
   * ສ້າງບິນຈາກ CF ໃນ transaction ຂອງຜູ້ເອີ້ນ (ຈອງສະຕ໋ອກໃນນັ້ນ; ບໍ່ພໍ → InsufficientStockError ໃຫ້ຜູ້ເອີ້ນ rollback).
   * ບໍ່ບັນທຶກ audit (ຜູ້ກະທຳແມ່ນລະບົບ; ledger ຂອງ CF ເປັນຫຼັກຖານ).
   */
  createCfOrderInTx(tx: Prisma.TransactionClient, input: CreateOrderInput, origin: OrderOrigin): Promise<string> {
    return this.createInTransaction(input, null, undefined, undefined, origin, tx);
  }

  /**
   * ເພີ່ມລາຍການເຂົ້າບິນ PENDING_PAYMENT ທີ່ຍັງບໍ່ໝົດເວລາ (CF ຊ້ຳຂອງລູກຄ້າດຽວກັນ) ໃນ transaction ຂອງຜູ້ເອີ້ນ:
   * ລວມເຂົ້າແຖວເດີມ (variant + ສາງ default) ຫຼື ສ້າງແຖວໃໝ່, ຈອງສະຕ໋ອກສະເພາະສ່ວນທີ່ເພີ່ມ, ຄິດຍອດໃໝ່ທັງບິນ
   * ແລະ ຣີເຊັດ reservedUntil ເປັນເວລາຈອງເລີ່ມຕົ້ນໃໝ່. `additions` ຕ້ອງບໍ່ມີ variant ຊ້ຳ.
   */
  async appendItemsInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    additions: readonly { variantId: string; quantity: number }[],
    actorId: string | null,
  ): Promise<void> {
    const variantIds = additions.map((addition) => addition.variantId);
    if (new Set(variantIds).size !== variantIds.length) throw new BadRequestException("Duplicate variants in additions");

    // lock ແຖວບິນ: ແຂ່ງກັບ pay/cancel/expire ໄດ້ຢ່າງປອດໄພ
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
    if (
      order.status !== "PENDING_PAYMENT" ||
      (order.reservedUntil !== null && order.reservedUntil.getTime() <= Date.now())
    ) {
      throw apiError("ORDER_INVALID_STATE", `Order is ${order.status}; cannot append items`, { status: order.status });
    }

    const settings = await ensureStoreSetting(tx);
    const warehouse = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } });
    if (!warehouse) throw apiError("NO_DEFAULT_WAREHOUSE", "No active default warehouse is configured");
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { name: true, status: true } } },
    });
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    const merged = new Map<string, number>(order.items.map((item) => [item.id, item.quantity]));
    const added: { variant: (typeof variants)[number]; quantity: number }[] = [];
    for (const addition of additions) {
      const variant = variantById.get(addition.variantId);
      if (!variant) throw apiError("VARIANT_NOT_FOUND", `Variant ${addition.variantId} not found`);
      if (!variant.isActive || variant.product.status !== "ACTIVE") {
        throw apiError("VARIANT_NOT_AVAILABLE", `Variant ${variant.sku} is not available for sale`, { sku: variant.sku });
      }
      // ສົມມຸດຖານ: ບິນ CF ໃຊ້ສາງ default ສະເໝີ; ແຖວເດີມທີ່ຢູ່ສາງອື່ນຈະບໍ່ຖືກລວມ ແຕ່ໄດ້ແຖວແຍກຕ່າງຫາກ
      const existing = order.items.find((item) => item.variantId === variant.id && item.warehouseId === warehouse.id);
      if (existing) merged.set(existing.id, (merged.get(existing.id) ?? existing.quantity) + addition.quantity);
      else added.push({ variant, quantity: addition.quantity });
    }

    let totals: ReturnType<typeof calculateOrderTotals>;
    try {
      totals = calculateOrderTotals({
        lines: [
          ...order.items.map((item) => ({
            unitPrice: item.unitPrice.toFixed(2),
            quantity: merged.get(item.id) ?? item.quantity,
            discount: item.discount.toFixed(2),
          })),
          ...added.map(({ variant, quantity }) => ({ unitPrice: variant.price.toFixed(2), quantity, discount: "0" })),
        ],
        shippingFee: order.shippingFee.toFixed(2),
        vatRate: order.vatRate.toString(),
        // ອ່ານຈາກ settings ປັດຈຸບັນ (ບໍ່ແມ່ນຄ່າ ຕອນສ້າງບິນ)
        pricesIncludeVat: settings.pricesIncludeVat,
      });
    } catch (error) {
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }

    for (const [index, item] of order.items.entries()) {
      await tx.orderItem.update({
        where: { id: item.id },
        data: { quantity: merged.get(item.id) ?? item.quantity, lineTotal: totals.lines[index]?.lineTotal ?? "0.00" },
      });
    }
    if (added.length > 0) {
      await tx.orderItem.createMany({
        data: added.map(({ variant, quantity }, index) => ({
          orderId,
          variantId: variant.id,
          warehouseId: warehouse.id,
          productName: variant.product.name,
          variantName: variant.name,
          sku: variant.sku,
          unitPrice: variant.price,
          unitCost: variant.costPrice,
          quantity,
          discount: 0,
          lineTotal: totals.lines[order.items.length + index]?.lineTotal ?? "0.00",
        })),
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
        reservedUntil: new Date(Date.now() + settings.reservationMinutes * 60_000),
      },
    });
    // ຈອງສະເພາະສ່ວນທີ່ເພີ່ມ (ບໍ່ພໍ → InsufficientStockError → ຜູ້ເອີ້ນ rollback)
    await reserveMany(
      tx,
      additions.map((addition) => ({
        variantId: addition.variantId,
        warehouseId: warehouse.id,
        quantity: addition.quantity,
      })),
      { orderId, actorId },
    );
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

  /** `inTx`: ງານເພີ່ມໃນ transaction ດຽວກັບການປ່ຽນສະຖານະ/ຕັດສະຕ໋ອກ (ເຊັ່ນ ບັນທຶກ Shipment); throw = rollback ທັງໝົດ */
  ship(id: string, actor: AuthUser, ip: string | undefined, inTx?: (tx: Prisma.TransactionClient) => Promise<void>) {
    return this.transition(id, "ship", {
      from: ["PACKING"],
      to: "SHIPPED",
      data: { shippedAt: new Date() },
      stock: "ship",
      inTx,
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
      inTx?: (tx: Prisma.TransactionClient) => Promise<void>;
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
        else {
          await releaseMany(tx, items, ctx);
          // cancel: ຄືນໂຄຕ້າ CF (ຖ້າເປັນບິນ CF) ໃນ transaction ດຽວກັນ
          await releaseCfClaims(tx, id);
        }
      }
      if (options.inTx) await options.inTx(tx);
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
    const row = await this.requireDetail(id);
    // ບິນ CF: ຍອດຈອງ/ຈ່າຍ ແລະ ໂຄຕ້າ (cancel) ຂອງ Host screen ປ່ຽນ
    if (row.liveSessionId) await this.liveEvents.sessionUpdated(row.liveSessionId);
    return toOrderDetail(row);
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
