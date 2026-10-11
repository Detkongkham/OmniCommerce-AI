import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@oca/database";
import type { CreateFlashSaleInput, UpdateFlashSaleInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { money } from "../../common/money";
import { PRISMA } from "../../prisma/prisma.module";

const flashSaleInclude = {
  items: {
    orderBy: [{ variant: { sku: "asc" } }, { id: "asc" }],
    include: { variant: { select: { sku: true, name: true, price: true, product: { select: { name: true } } } } },
  },
} as const satisfies Prisma.FlashSaleInclude;

type FlashSaleRow = Prisma.FlashSaleGetPayload<{ include: typeof flashSaleInclude }>;

export interface FlashSaleDto {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  items: {
    variantId: string;
    sku: string;
    productName: string;
    variantName: string | null;
    /** ລາຄາປົກກະຕິປັດຈຸບັນຂອງ variant */
    regularPrice: string;
    salePrice: string;
  }[];
  createdAt: Date;
}

function toDto(row: FlashSaleRow): FlashSaleDto {
  return {
    id: row.id,
    name: row.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isActive: row.isActive,
    items: row.items.map((item) => ({
      variantId: item.variantId,
      sku: item.variant.sku,
      productName: item.variant.product.name,
      variantName: item.variant.name,
      regularPrice: money(item.variant.price),
      salePrice: money(item.salePrice),
    })),
    createdAt: row.createdAt,
  };
}

interface Draft {
  name: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  items: { variantId: string; salePrice: string }[];
}

@Injectable()
export class FlashSalesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<FlashSaleDto[]> {
    const rows = await this.prisma.flashSale.findMany({
      include: flashSaleInclude,
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toDto);
  }

  async create(input: CreateFlashSaleInput, actor: AuthUser, ip: string | undefined): Promise<FlashSaleDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.assertValid(tx, input, null);
      return tx.flashSale.create({
        data: {
          name: input.name,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          isActive: input.isActive,
          items: { create: input.items.map((item) => ({ variantId: item.variantId, salePrice: item.salePrice })) },
        },
        include: flashSaleInclude,
      });
    });
    await this.audit.record({ userId: actor.id, action: "flashSale.create", entity: "FlashSale", entityId: row.id, after: auditOf(row), ip });
    return toDto(row);
  }

  async update(id: string, input: UpdateFlashSaleInput, actor: AuthUser, ip: string | undefined): Promise<FlashSaleDto> {
    const { before, row } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.flashSale.findUnique({ where: { id }, include: flashSaleInclude });
      if (!existing) throw apiError("FLASH_SALE_NOT_FOUND", "Flash sale not found");
      const draft: Draft = {
        name: input.name ?? existing.name,
        startsAt: input.startsAt ?? existing.startsAt,
        endsAt: input.endsAt ?? existing.endsAt,
        isActive: input.isActive ?? existing.isActive,
        items: input.items ?? existing.items.map((item) => ({ variantId: item.variantId, salePrice: item.salePrice.toFixed(2) })),
      };
      if (draft.endsAt.getTime() <= draft.startsAt.getTime()) {
        throw new BadRequestException({ message: "Validation failed", issues: [{ path: "endsAt", message: "endsAt must be after startsAt" }] });
      }
      await this.assertValid(tx, draft, id);
      if (input.items) await tx.flashSaleItem.deleteMany({ where: { flashSaleId: id } });
      const updated = await tx.flashSale.update({
        where: { id },
        data: {
          name: draft.name,
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
          isActive: draft.isActive,
          ...(input.items ? { items: { create: draft.items.map((item) => ({ variantId: item.variantId, salePrice: item.salePrice })) } } : {}),
        },
        include: flashSaleInclude,
      });
      return { before: existing, row: updated };
    });
    await this.audit.record({
      userId: actor.id,
      action: "flashSale.update",
      entity: "FlashSale",
      entityId: id,
      before: auditOf(before),
      after: auditOf(row),
      ip,
    });
    return toDto(row);
  }

  /**
   * ກົດທີ່ຕ້ອງອ່ານ DB: variant ມີຈິງ, ລາຄາພິເສດຕ່ຳກວ່າລາຄາປົກກະຕິ, ແລະ (ຖ້າແຄມເປນເປີດຢູ່)
   * ບໍ່ມີ variant ໃດຢູ່ໃນແຄມເປນອື່ນທີ່ເປີດຢູ່ ແລະ ເວລາຊ້ອນກັນ. lock ຕໍ່ຕາຕະລາງ (advisory) ກັນສອງຄຳຂໍສ້າງຊ້ອນພ້ອມກັນ.
   */
  private async assertValid(tx: Prisma.TransactionClient, draft: Draft, selfId: string | null): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('flash-sale-write'))`;
    const variantIds = draft.items.map((item) => item.variantId);
    const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, price: true } });
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const missing = variantIds.find((variantId) => !variantById.has(variantId));
    if (missing) throw apiError("VARIANT_NOT_FOUND", `Variant ${missing} not found`);

    const notLower = draft.items.filter((item) => !variantById.get(item.variantId)?.price.greaterThan(item.salePrice));
    if (notLower.length > 0) {
      throw apiError("FLASH_SALE_PRICE_INVALID", "Sale price must be lower than the regular price", {
        skus: notLower.map((item) => variantById.get(item.variantId)?.sku ?? item.variantId).sort(),
      });
    }

    if (!draft.isActive) return;
    const clashes = await tx.flashSaleItem.findMany({
      where: {
        variantId: { in: variantIds },
        flashSale: {
          isActive: true,
          ...(selfId ? { id: { not: selfId } } : {}),
          // ຊ້ອນ = ອັນອື່ນເລີ່ມກ່ອນເຮົາຈົບ ແລະ ຈົບຫຼັງເຮົາເລີ່ມ (ຕໍ່ກັນພໍດີບໍ່ຖືວ່າຊ້ອນ)
          startsAt: { lt: draft.endsAt },
          endsAt: { gt: draft.startsAt },
        },
      },
      select: { variant: { select: { sku: true } } },
    });
    if (clashes.length > 0) {
      throw apiError("FLASH_SALE_OVERLAP", "Some variants are already in another active flash sale in this period", {
        skus: [...new Set(clashes.map((clash) => clash.variant.sku))].sort(),
      });
    }
  }
}

function auditOf(row: FlashSaleRow) {
  return {
    name: row.name,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    isActive: row.isActive,
    items: row.items.map((item) => ({ sku: item.variant.sku, salePrice: item.salePrice.toFixed(2) })),
  };
}
