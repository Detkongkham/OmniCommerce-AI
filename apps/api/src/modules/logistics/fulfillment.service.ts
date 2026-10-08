import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@oca/database";
import {
  type FulfillmentListQuery,
  type NotifyShipmentInput,
  type OverridePackInput,
  type ShipOrderInput,
  type UpdateShippingInput,
  type VerifyPackInput,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import { OrdersService } from "../orders/orders.service";
import { SHIPMENT_INCLUDE, type ShipmentDto, toShipmentDto, trackingTextOf } from "./logistics.mapper";
import { ShipmentNotifierService } from "./shipment-notifier.service";

const QUEUE_STATUSES = ["PAID", "PACKING"] as const;
const SHIPPED_STATUSES = new Set(["SHIPPED", "COMPLETED"]);

const DETAIL_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  items: {
    orderBy: { id: "asc" },
    include: { variant: { select: { sku: true, barcode: true } }, warehouse: { select: { code: true } } },
  },
  shipment: { include: SHIPMENT_INCLUDE },
} as const satisfies Prisma.OrderInclude;

type DetailRow = Prisma.OrderGetPayload<{ include: typeof DETAIL_INCLUDE }>;

export interface FulfillmentListItemDto {
  id: string;
  orderNumber: string;
  status: string;
  customer: { name: string; phone: string | null } | null;
  itemCount: number;
  paidAt: Date | null;
  /** ມີຊື່ + ເບີ + ທີ່ຢູ່ ຜູ້ຮັບຄົບ */
  hasShippingInfo: boolean;
  verified: boolean;
}

export interface FulfillmentDetailDto {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  customer: { id: string; name: string; phone: string | null } | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  note: string | null;
  paidAt: Date | null;
  items: {
    id: string;
    variantId: string;
    sku: string;
    barcode: string | null;
    productName: string;
    variantName: string | null;
    quantity: number;
    warehouseId: string;
    warehouseCode: string;
  }[];
  shipment: ShipmentDto | null;
  /** ຂໍ້ຄວາມແຈ້ງ tracking (copy ໄປສົ່ງເອງໄດ້); null ຖ້າຍັງບໍ່ສົ່ງອອກ */
  notifyText: string | null;
  /** ຊື່ຮ້ານ (ໃບປະໜ້າ) */
  storeName: string;
}

const filled = (value: string | null) => value !== null && value.trim() !== "";

@Injectable()
export class FulfillmentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(ShipmentNotifierService) private readonly notifier: ShipmentNotifierService,
  ) {}

  async list(query: FulfillmentListQuery): Promise<Page<FulfillmentListItemDto>> {
    const where: Prisma.OrderWhereInput = {
      status: query.status ? query.status : { in: [...QUEUE_STATUSES] },
      ...(query.warehouseId ? { items: { some: { warehouseId: query.warehouseId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: "insensitive" } },
              { shippingName: { contains: query.q, mode: "insensitive" } },
              { shippingPhone: { contains: query.q } },
              { customer: { name: { contains: query.q, mode: "insensitive" } } },
              { customer: { phone: { contains: query.q } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true } },
          items: { select: { quantity: true } },
          shipment: { select: { verifiedAt: true } },
        },
        // ຈ່າຍກ່ອນ ແພັກກ່ອນ
        orderBy: [{ paidAt: "asc" }, { id: "asc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.order.count({ where }),
    ]);
    const items = rows.map(
      (row): FulfillmentListItemDto => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        customer: row.customer,
        itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
        paidAt: row.paidAt,
        hasShippingInfo: filled(row.shippingName) && filled(row.shippingPhone) && filled(row.shippingAddress),
        verified: row.shipment?.verifiedAt != null,
      }),
    );
    return toPage(items, total, query.page, query.pageSize);
  }

  async detail(orderId: string): Promise<FulfillmentDetailDto> {
    const [row, settings] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId }, include: DETAIL_INCLUDE }),
      this.prisma.storeSetting.findUnique({ where: { id: 1 }, select: { name: true } }),
    ]);
    if (!row) throw apiError("ORDER_NOT_FOUND", "Order not found");
    return toDetail(row, settings?.name ?? "");
  }

  /** PAID → PACKING + ສ້າງ Shipment; PACKING ຢູ່ແລ້ວ = idempotent (ສ້າງ Shipment ຖ້າຍັງບໍ່ມີ) */
  async start(orderId: string, actor: AuthUser, ip: string | undefined): Promise<FulfillmentDetailDto> {
    const order = await this.requireOrder(orderId);
    if (order.status === "PAID") await this.orders.pack(orderId, actor, ip);
    else if (order.status !== "PACKING") throw invalidState(order.status, "start packing");
    await this.prisma.shipment.upsert({
      where: { orderId },
      create: { orderId, packedById: actor.id, packedAt: new Date() },
      update: {},
    });
    return this.detail(orderId);
  }

  /**
   * ກວດຜົນການຍິງ: code = barcode ຫຼື SKU (ປັດຈຸບັນ ຫຼື ຕອນສັ່ງ, ບໍ່ສົນຕົວໃຫຍ່/ນ້ອຍ) ຂອງ variant ໃນບິນ.
   * ຈຳນວນທີ່ຍິງຕໍ່ variant ຕ້ອງເທົ່າກັບຈຳນວນໃນບິນ (ລວມທຸກແຖວ) ແລະ ບໍ່ມີ code ນອກບິນ.
   */
  async verify(orderId: string, input: VerifyPackInput, actor: AuthUser): Promise<FulfillmentDetailDto> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId }, include: DETAIL_INCLUDE });
    if (!row) throw apiError("ORDER_NOT_FOUND", "Order not found");
    if (row.status !== "PACKING") throw invalidState(row.status, "verify");

    const expected = new Map<string, { sku: string; quantity: number }>();
    const variantByCode = new Map<string, string>();
    for (const item of row.items) {
      const current = expected.get(item.variantId);
      expected.set(item.variantId, { sku: item.variant.sku, quantity: (current?.quantity ?? 0) + item.quantity });
      for (const code of [item.variant.barcode, item.variant.sku, item.sku]) {
        if (code) variantByCode.set(code.toUpperCase(), item.variantId);
      }
    }
    const scanned = new Map<string, number>();
    const extra: string[] = [];
    for (const scan of input.scans) {
      const variantId = variantByCode.get(scan.code.toUpperCase());
      if (variantId) scanned.set(variantId, (scanned.get(variantId) ?? 0) + scan.quantity);
      else if (!extra.includes(scan.code)) extra.push(scan.code);
    }
    const missing = [...expected.entries()]
      .filter(([variantId, line]) => (scanned.get(variantId) ?? 0) !== line.quantity)
      .map(([variantId, line]) => ({ sku: line.sku, expected: line.quantity, scanned: scanned.get(variantId) ?? 0 }));
    if (missing.length > 0 || extra.length > 0) {
      throw apiError("PACK_MISMATCH", "Scanned items do not match the order", { missing, extra });
    }

    await this.prisma.shipment.upsert({
      where: { orderId },
      create: { orderId, packedById: actor.id, packedAt: new Date(), verifiedAt: new Date(), verifiedById: actor.id },
      update: { verifiedAt: new Date(), verifiedById: actor.id, verifyOverrideReason: null },
    });
    return this.detail(orderId);
  }

  /** ຂ້າມການຍິງ (ເຊັ່ນ ບາໂຄດເສຍ): ຕ້ອງມີ orders:write ນຳ (ກວດທີ່ controller) + ເຫດຜົນ, ບັນທຶກ audit */
  async override(orderId: string, input: OverridePackInput, actor: AuthUser, ip: string | undefined): Promise<FulfillmentDetailDto> {
    const order = await this.requireOrder(orderId);
    if (order.status !== "PACKING") throw invalidState(order.status, "override");
    await this.prisma.shipment.upsert({
      where: { orderId },
      create: { orderId, packedById: actor.id, packedAt: new Date(), verifiedAt: new Date(), verifiedById: actor.id, verifyOverrideReason: input.reason },
      update: { verifiedAt: new Date(), verifiedById: actor.id, verifyOverrideReason: input.reason },
    });
    await this.audit.record({ userId: actor.id, action: "fulfillment.override", entity: "Order", entityId: orderId, after: { reason: input.reason }, ip });
    return this.detail(orderId);
  }

  /** ແກ້ຂໍ້ມູນຜູ້ຮັບ (ບິນ CF ສ່ວນຫຼາຍບໍ່ມີທີ່ຢູ່): ສະເພາະ PAID/PACKING; guard ໃນ WHERE ແຂ່ງກັບການສົ່ງອອກໄດ້ */
  async updateShipping(orderId: string, input: UpdateShippingInput, actor: AuthUser, ip: string | undefined): Promise<FulfillmentDetailDto> {
    const data = {
      ...(input.shippingName !== undefined ? { shippingName: input.shippingName } : {}),
      ...(input.shippingPhone !== undefined ? { shippingPhone: input.shippingPhone } : {}),
      ...(input.shippingAddress !== undefined ? { shippingAddress: input.shippingAddress } : {}),
    };
    const { count } = await this.prisma.order.updateMany({ where: { id: orderId, status: { in: [...QUEUE_STATUSES] } }, data });
    if (count === 0) {
      const order = await this.requireOrder(orderId);
      throw invalidState(order.status, "edit shipping info");
    }
    await this.audit.record({ userId: actor.id, action: "fulfillment.shipping", entity: "Order", entityId: orderId, after: { ...input }, ip });
    return this.detail(orderId);
  }

  /** PACKING + ກວດແລ້ວ → SHIPPED (ຕັດສະຕ໋ອກ) ແລະ ບັນທຶກ courier/tracking ໃນ transaction ດຽວ */
  async ship(orderId: string, input: ShipOrderInput, actor: AuthUser, ip: string | undefined): Promise<FulfillmentDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, shippingName: true, shippingPhone: true, shipment: { select: { verifiedAt: true } } },
    });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "PACKING") throw invalidState(order.status, "ship");
    if (!order.shipment?.verifiedAt) throw apiError("PACK_NOT_VERIFIED", "Scan and verify every item before shipping");
    const courier = await this.prisma.courier.findUnique({ where: { id: input.courierId }, select: { isActive: true } });
    if (!courier) throw apiError("COURIER_NOT_FOUND", "Courier not found");
    if (!courier.isActive) throw apiError("COURIER_INACTIVE", "Courier is inactive");
    if (!filled(order.shippingName) || !filled(order.shippingPhone)) {
      throw apiError("SHIPPING_INFO_REQUIRED", "Recipient name and phone are required before shipping");
    }

    await this.orders.ship(orderId, actor, ip, async (tx) => {
      const { count } = await tx.shipment.updateMany({
        where: { orderId, verifiedAt: { not: null } },
        data: { courierId: input.courierId, trackingNumber: input.trackingNumber, shippedById: actor.id, shippedAt: new Date() },
      });
      // override/verify ຖືກລ້າງລະຫວ່າງກວດ ແລະ ສົ່ງ (ບໍ່ຄວນເກີດ): rollback ທັງສະຖານະ ແລະ ສະຕ໋ອກ
      if (count === 0) throw apiError("PACK_NOT_VERIFIED", "Scan and verify every item before shipping");
    });
    // ຫຼັງ commit: ສົ່ງ tracking ທາງແຊັດ (ບໍ່ throw; ລົ້ມ = FAILED/MANUAL ໃຫ້ສົ່ງໃໝ່ ຫຼື copy)
    await this.notifier.notify(orderId, actor);
    return this.detail(orderId);
  }

  /** ສົ່ງແຈ້ງ tracking ຄືນ; ສົ່ງສຳເລັດແລ້ວ (SENT) ຕ້ອງ force ເພື່ອບໍ່ໃຫ້ລູກຄ້າໄດ້ຊ້ຳໂດຍບໍ່ຕັ້ງໃຈ */
  async notify(orderId: string, input: NotifyShipmentInput, actor: AuthUser): Promise<FulfillmentDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, shipment: { select: { trackingNumber: true, notifyStatus: true } } },
    });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
    if (!SHIPPED_STATUSES.has(order.status) || !order.shipment?.trackingNumber) throw invalidState(order.status, "notify");
    if (order.shipment.notifyStatus === "SENT" && !input.force) {
      throw apiError("CONFLICT", "Tracking was already sent; pass force to send again");
    }
    await this.notifier.notify(orderId, actor);
    return this.detail(orderId);
  }

  private async requireOrder(orderId: string): Promise<{ status: string }> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
    return order;
  }
}

function invalidState(status: string, action: string) {
  return apiError("ORDER_INVALID_STATE", `Cannot ${action} an order that is ${status}`, { status });
}

function toDetail(row: DetailRow, storeName: string): FulfillmentDetailDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    channel: row.channel,
    customer: row.customer,
    shippingName: row.shippingName,
    shippingPhone: row.shippingPhone,
    shippingAddress: row.shippingAddress,
    note: row.note,
    paidAt: row.paidAt,
    items: row.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      sku: item.variant.sku,
      barcode: item.variant.barcode,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      warehouseId: item.warehouseId,
      warehouseCode: item.warehouse.code,
    })),
    shipment: row.shipment ? toShipmentDto(row.shipment) : null,
    notifyText: SHIPPED_STATUSES.has(row.status) ? trackingTextOf(row) : null,
    storeName,
  };
}
