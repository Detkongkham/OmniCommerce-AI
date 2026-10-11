import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { COUPON_RELEASED_STATUSES, type Coupon, type PrismaClient, evaluateCoupon } from "@oca/database";
import { type CouponPreviewInput, type CreateCouponInput, type UpdateCouponInput, couponRuleIssues } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { couponRejection } from "../../common/coupon-error";
import { money, moneyOrNull } from "../../common/money";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";

export interface CouponDto {
  id: string;
  code: string;
  type: string;
  value: string;
  maxDiscount: string | null;
  minSubtotal: string;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perPhoneLimit: number | null;
  isActive: boolean;
  note: string | null;
  /** ບິນທີ່ໃຊ້ໂຄດນີ້ ແລະ ບໍ່ຖືກຍົກເລີກ/ໝົດອາຍຸ */
  usedCount: number;
  createdAt: Date;
}

function toDto(row: Coupon, usedCount: number): CouponDto {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: money(row.value),
    maxDiscount: moneyOrNull(row.maxDiscount),
    minSubtotal: money(row.minSubtotal),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    usageLimit: row.usageLimit,
    perPhoneLimit: row.perPhoneLimit,
    isActive: row.isActive,
    note: row.note,
    usedCount,
    createdAt: row.createdAt,
  };
}

/** ຄ່າທີ່ປ່ຽນບໍ່ໄດ້ຫຼັງໂຄດຖືກໃຊ້ແລ້ວ (ບິນເກົ່າອ້າງເຖິງເງື່ອນໄຂເດີມ) */
const LOCKED_AFTER_USE = ["code", "type", "value"] as const;

@Injectable()
export class CouponsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<CouponDto[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.coupon.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      this.prisma.order.groupBy({
        by: ["couponId"],
        where: { couponId: { not: null }, status: { notIn: [...COUPON_RELEASED_STATUSES] } },
        _count: { _all: true },
      }),
    ]);
    const used = new Map(counts.map((row) => [row.couponId, row._count._all]));
    return rows.map((row) => toDto(row, used.get(row.id) ?? 0));
  }

  async create(input: CreateCouponInput, actor: AuthUser, ip: string | undefined): Promise<CouponDto> {
    try {
      const row = await this.prisma.coupon.create({
        data: {
          code: input.code,
          type: input.type,
          value: input.value,
          maxDiscount: input.maxDiscount ?? null,
          minSubtotal: input.minSubtotal,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          usageLimit: input.usageLimit ?? null,
          perPhoneLimit: input.perPhoneLimit ?? null,
          isActive: input.isActive,
          note: input.note ?? null,
        },
      });
      await this.audit.record({ userId: actor.id, action: "coupon.create", entity: "Coupon", entityId: row.id, after: auditOf(row), ip });
      return toDto(row, 0);
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "Coupon code already exists", { fields: ["code"] });
      throw error;
    }
  }

  async update(id: string, input: UpdateCouponInput, actor: AuthUser, ip: string | undefined): Promise<CouponDto> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw apiError("COUPON_NOT_FOUND", "Coupon not found");

    const merged = {
      type: input.type ?? existing.type,
      value: input.value ?? existing.value.toFixed(2),
      maxDiscount: input.maxDiscount !== undefined ? input.maxDiscount : (existing.maxDiscount?.toFixed(2) ?? null),
      startsAt: input.startsAt !== undefined ? input.startsAt : existing.startsAt,
      endsAt: input.endsAt !== undefined ? input.endsAt : existing.endsAt,
    };
    const issues = couponRuleIssues(merged);
    if (issues.length > 0) throw new BadRequestException({ message: "Validation failed", issues });

    const changesLocked = LOCKED_AFTER_USE.some((field) => {
      if (input[field] === undefined) return false;
      return field === "value" ? !existing.value.equals(input.value ?? "0") : input[field] !== existing[field];
    });
    if (changesLocked && (await this.prisma.order.count({ where: { couponId: id } })) > 0) {
      throw apiError("COUPON_IN_USE", "A coupon that has been used cannot change its code, type or value");
    }

    try {
      const row = await this.prisma.coupon.update({
        where: { id },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.value !== undefined ? { value: input.value } : {}),
          ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount } : {}),
          ...(input.minSubtotal !== undefined ? { minSubtotal: input.minSubtotal } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
          ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
          ...(input.perPhoneLimit !== undefined ? { perPhoneLimit: input.perPhoneLimit } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
      await this.audit.record({
        userId: actor.id,
        action: "coupon.update",
        entity: "Coupon",
        entityId: id,
        before: auditOf(existing),
        after: auditOf(row),
        ip,
      });
      const usedCount = await this.prisma.order.count({ where: { couponId: id, status: { notIn: [...COUPON_RELEASED_STATUSES] } } });
      return toDto(row, usedCount);
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "Coupon code already exists", { fields: ["code"] });
      throw error;
    }
  }

  /** ລອງໂຄດກັບຍອດຄ່າສິນຄ້າ ໂດຍບໍ່ໃຊ້ສິດ (ຟອມເປີດບິນ). ບໍ່ສົ່ງ phone = ບໍ່ກວດ limit ຕໍ່ເບີ */
  async preview(input: CouponPreviewInput): Promise<{ code: string; discount: string }> {
    try {
      const result = await evaluateCoupon(this.prisma, { code: input.code, merchandiseSubtotal: input.subtotal, phone: input.phone });
      return { code: result.code, discount: result.discount };
    } catch (error) {
      throw couponRejection(error);
    }
  }
}

function auditOf(row: Coupon) {
  return {
    code: row.code,
    type: row.type,
    value: row.value.toFixed(2),
    maxDiscount: row.maxDiscount?.toFixed(2) ?? null,
    minSubtotal: row.minSubtotal.toFixed(2),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit,
    perPhoneLimit: row.perPhoneLimit,
    isActive: row.isActive,
  };
}
