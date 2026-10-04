import type { ArgumentsHost } from "@nestjs/common";
import { InsufficientStockError, type PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { InsufficientStockFilter } from "./insufficient-stock.filter";

describe("InsufficientStockFilter", () => {
  it("ຕອບ 409 ພ້ອມ shortages ທີ່ມີ sku", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 1, sku: "SKU-1" }]);
    const prisma = { productVariant: { findMany } } as unknown as PrismaClient;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;

    const error = new InsufficientStockError([{ variantId: 1, warehouseId: 2, requested: 5, available: 3 }]);
    await new InsufficientStockFilter(prisma).catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        shortages: [{ variantId: 1, warehouseId: 2, requested: 5, available: 3, sku: "SKU-1" }],
      }),
    );
  });
});
