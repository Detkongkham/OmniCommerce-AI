import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../common/auth-types";
import { ProductsService } from "./products.service";

const actor = { id: "u1" } as AuthUser;
const detailRow = { id: "p1", name: "n", slug: "s", status: "DRAFT", categoryId: null, variants: [], options: [], images: [] };
const variantRow = { id: "v1", productId: "p1", sku: "S", price: { toFixed: () => "1.00" }, costPrice: { toFixed: () => "1.00" }, compareAtPrice: null };

function build(overrides: Record<string, unknown>) {
  const prisma = {
    product: { findUnique: vi.fn().mockResolvedValue(detailRow) },
    category: { findUnique: vi.fn().mockResolvedValue({ id: "c1" }) },
    productVariant: { findUnique: vi.fn().mockResolvedValue(variantRow) },
    orderItem: { count: vi.fn().mockResolvedValue(0) },
    stockMovement: { count: vi.fn().mockResolvedValue(0) },
    ...overrides,
  };
  const audit = { record: vi.fn() };
  return new ProductsService(prisma as never, audit as never);
}

const code = (c: string) => Object.assign(new Error(c), { code: c });

describe("ProductsService Prisma error mapping", () => {
  it("remove: P2003 -> 409, P2025 -> 404", async () => {
    const del = (c: string) => build({ product: { findUnique: vi.fn().mockResolvedValue(detailRow), delete: vi.fn().mockRejectedValue(code(c)) } });
    await expect(del("P2003").remove("p1", actor, undefined)).rejects.toBeInstanceOf(ConflictException);
    await expect(del("P2025").remove("p1", actor, undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("update: P2025 -> 404, P2003 -> 400", async () => {
    const upd = (c: string) => build({ product: { findUnique: vi.fn().mockResolvedValue(detailRow), update: vi.fn().mockRejectedValue(code(c)) } });
    await expect(upd("P2025").update("p1", { name: "x" }, actor, undefined)).rejects.toBeInstanceOf(NotFoundException);
    await expect(upd("P2003").update("p1", { categoryId: "c1" }, actor, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updateVariant: P2025 -> 404", async () => {
    const service = build({
      productVariant: { findUnique: vi.fn().mockResolvedValue(variantRow), update: vi.fn().mockRejectedValue(code("P2025")) },
    });
    await expect(service.updateVariant("v1", { isActive: false }, actor, undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("create: P2003 (category deleted meanwhile) -> 400", async () => {
    const service = build({ $transaction: vi.fn().mockRejectedValue(code("P2003")), product: { count: vi.fn().mockResolvedValue(0) } });
    const input = { name: "x", slug: "x", status: "DRAFT", categoryId: "c1", options: [], variants: [], images: [] };
    await expect(service.create(input as never, actor, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
