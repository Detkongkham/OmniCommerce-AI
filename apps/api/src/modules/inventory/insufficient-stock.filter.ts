import { type ArgumentsHost, Catch, type ExceptionFilter, Inject } from "@nestjs/common";
import { InsufficientStockError, type PrismaClient } from "@oca/database";
import type { Response } from "express";
import { PRISMA } from "../../prisma/prisma.module";

/** InsufficientStockError -> 409 { message, shortages: [{ variantId, warehouseId, sku, requested, available }] } */
@Catch(InsufficientStockError)
export class InsufficientStockFilter implements ExceptionFilter<InsufficientStockError> {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async catch(error: InsufficientStockError, host: ArgumentsHost): Promise<void> {
    const variantIds = [...new Set(error.shortages.map((shortage) => shortage.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, sku: true },
    });
    const skuById = new Map(variants.map((variant) => [variant.id, variant.sku]));

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(409)
      .json({
        statusCode: 409,
        error: "Conflict",
        message: error.message,
        shortages: error.shortages.map((shortage) => ({ ...shortage, sku: skuById.get(shortage.variantId) ?? null })),
      });
  }
}
