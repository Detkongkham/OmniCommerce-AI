import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { InsufficientStockError, PointsRejectedError, type Prisma, type PrismaClient } from "@oca/database";
import {
  COUPON_CODE_PATTERN,
  STORE_MAX_OPEN_ORDERS,
  STORE_MAX_SLIPS,
  STORE_TOKEN_PATTERN,
  type StoreCreateOrderInput,
  type StoreSlipStatus,
  createOrderSchema,
} from "@oca/shared";
import { apiError } from "../../common/api-error";
import { pointsRejection } from "../../common/points-error";
import { PRISMA } from "../../prisma/prisma.module";
import { OrdersService } from "../orders/orders.service";
import { SlipsService, type UploadedImage } from "../payments/slips.service";
import type { StoreMemberRow } from "./store-member.mapper";
import { type StoreOrderDto, type StoreOrderRow, isReservationExpired, storeOrderInclude, toStoreOrder } from "./storefront.mapper";

export interface StoreOrderCreatedDto {
  orderNumber: string;
  /** ລິ້ງລັບຕິດຕາມບິນ: ໃຜມີ token ນີ້ເບິ່ງບິນ ແລະ ອັບໂຫຼດສະລິບໄດ້ */
  token: string;
}

/** ສ່ວນບິນຂອງໜ້າຮ້ານສາທາລະນະ: ສັ່ງແບບ guest, ເບິ່ງດ້ວຍ token, ອັບໂຫຼດສະລິບ */
@Injectable()
export class StoreOrdersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(SlipsService) private readonly slips: SlipsService,
  ) {}

  /** `member` = ສະມາຊິກຂອງ session; ຕ້ອງມີເມື່ອ body ມີ pointsToRedeem (controller ບັງຄັບແລ້ວ) */
  async create(
    body: StoreCreateOrderInput,
    member: StoreMemberRow | null,
    ip: string | undefined,
    idempotencyKey: string,
  ): Promise<StoreOrderCreatedDto> {
    if (body.pointsToRedeem !== undefined) {
      if (!member) throw apiError("MEMBER_REQUIRED", "Member sign-in required");
      // ແຕ້ມເປັນຂອງລູກຄ້າເບີນີ້: ບິນຖືກຜູກກັບລູກຄ້າຕາມເບີທີ່ພິມ (ບໍ່ normalize) ຈຶ່ງຕ້ອງຕົງກັນທຸກຕົວອັກສອນ
      if (member.phone !== body.phone) throw pointsRejection(new PointsRejectedError("PHONE_MISMATCH"));
    }

    const courier = await this.prisma.courier.findUnique({ where: { id: body.courierId }, select: { isActive: true } });
    if (!courier) throw apiError("COURIER_NOT_FOUND", "Courier not found");
    if (!courier.isActive) throw apiError("COURIER_INACTIVE", "Courier is inactive");

    // ໂຄດຜິດຮູບແບບ = "ບໍ່ພົບໂຄດ" (schema ຂອງບິນລຸ່ມນີ້ຈະ throw ຖ້າປ່ອຍຜ່ານ)
    if (body.couponCode !== undefined && !COUPON_CODE_PATTERN.test(body.couponCode)) {
      throw apiError("COUPON_INVALID", "Coupon cannot be used: NOT_FOUND", { reason: "NOT_FOUND" });
    }

    // ຜ່ານ schema ຂອງບິນ ເພື່ອໄດ້ຄ່າເລີ່ມຕົ້ນ (discount 0, shippingFee 0) ຮູບດຽວກັບ POST /orders
    const input = createOrderSchema.parse({
      customer: { name: body.name, phone: body.phone },
      items: body.items,
      shippingName: body.name,
      shippingPhone: body.phone,
      shippingAddress: body.address,
      ...(body.note ? { note: body.note } : {}),
      ...(body.couponCode !== undefined ? { couponCode: body.couponCode } : {}),
      ...(body.pointsToRedeem !== undefined ? { pointsToRedeem: body.pointsToRedeem } : {}),
    });

    let orderId: string;
    try {
      orderId = await this.orders.createFromStorefront(
        input,
        {
          publicToken: randomBytes(32).toString("base64url"),
          shippingCourierId: body.courierId,
          shippingBranch: body.branch,
          expectedTotal: body.expectedTotal,
          guard: (tx) => this.assertOpenOrderCap(tx, body.phone),
        },
        ip,
        idempotencyKey,
      );
    } catch (error) {
      // ບໍ່ປ່ອຍໃຫ້ InsufficientStockFilter ຂອງ admin ຕອບ (ມັນເປີດເຜີຍ warehouseId ແລະ SKU)
      if (error instanceof InsufficientStockError) {
        throw apiError("INSUFFICIENT_STOCK", "Not enough stock for one or more items", {
          shortages: error.shortages.map((shortage) => ({
            variantId: shortage.variantId,
            requested: shortage.requested,
            available: shortage.available,
          })),
        });
      }
      throw error;
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { orderNumber: true, publicToken: true },
    });
    if (!order.publicToken) throw new Error(`Storefront order ${orderId} has no public token`);
    return { orderNumber: order.orderNumber, token: order.publicToken };
  }

  async get(token: string): Promise<StoreOrderDto> {
    return toStoreOrder(await this.requireByToken(token));
  }

  async uploadSlip(token: string, file: UploadedImage | undefined, ip: string | undefined): Promise<{ status: StoreSlipStatus }> {
    const order = await this.requireByToken(token);
    if (isReservationExpired(order)) {
      throw apiError("RESERVATION_EXPIRED", "Reservation expired; the order can no longer be paid");
    }
    if (order.status !== "PENDING_PAYMENT") {
      throw apiError("ORDER_INVALID_STATE", `Order is ${order.status}; cannot upload a slip`, { status: order.status });
    }
    // ກວດແບບ best-effort (ສອງຄຳຂໍພ້ອມກັນອາດເກີນ 1 ໃບ); rate limit ຕໍ່ IP ເປັນດ່ານຫຼັກ
    if (order.slips.filter((slip) => slip.status !== "REJECTED").length >= STORE_MAX_SLIPS) {
      throw apiError("SLIP_LIMIT_REACHED", "This order already has the maximum number of slips");
    }
    await this.slips.uploadFromStorefront(order.id, file, ip);
    return { status: "REVIEWING" };
  }

  /** token ຜິດຮູບແບບ ຫຼື ບໍ່ພົບ = 404 ແບບດຽວກັນ (ບໍ່ບອກວ່າຜິດຍ້ອນຫຍັງ) */
  private async requireByToken(token: string): Promise<StoreOrderRow> {
    const row = STORE_TOKEN_PATTERN.test(token)
      ? await this.prisma.order.findUnique({ where: { publicToken: token }, include: storeOrderInclude })
      : null;
    if (!row) throw apiError("ORDER_NOT_FOUND", "Order not found");
    return row;
  }

  /**
   * ກັນການຈອງສະຕ໋ອກຖິ້ມ: ເບີໂທດຽວມີບິນຈາກເວັບທີ່ຍັງລໍຈ່າຍ (ຍັງບໍ່ໝົດເວລາຈອງ) ໄດ້ບໍ່ເກີນ STORE_MAX_OPEN_ORDERS.
   * advisory lock ຕໍ່ເບີ ເຮັດໃຫ້ຄຳຂໍພ້ອມກັນຂອງເບີດຽວກັນເຂົ້າທີລະອັນ (ປ່ອຍເອງເມື່ອ transaction ຈົບ).
   */
  private async assertOpenOrderCap(tx: Prisma.TransactionClient, phone: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sf-phone:${phone}`}))`;
    const open = await tx.order.count({
      where: {
        channel: "STOREFRONT",
        status: "PENDING_PAYMENT",
        reservedUntil: { gt: new Date() },
        customer: { phone },
      },
    });
    if (open >= STORE_MAX_OPEN_ORDERS) {
      throw apiError("TOO_MANY_OPEN_ORDERS", "Too many unpaid orders for this phone number");
    }
  }
}
