import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@oca/database";
import {
  type CreateProductInput,
  type ProductListQuery,
  type PutProductImagesInput,
  type UpdateProductInput,
  type UpdateVariantInput,
  type VariantInput,
  variantName,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { duplicateError } from "../../common/duplicate-error";
import { prismaErrorCode } from "../../common/prisma-errors";
import { uniqueSlug } from "../../common/unique-slug";
import { PRISMA } from "../../prisma/prisma.module";
import {
  type ProductDetailDto,
  type ProductDetailRow,
  type ProductListItemDto,
  type VariantDto,
  productDetailInclude,
  productListInclude,
  productSnapshot,
  toProductDetail,
  toProductListItem,
  variantSnapshot,
} from "./products.mapper";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: ProductListQuery): Promise<Page<ProductListItemDto>> {
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { variants: { some: { sku: { contains: query.q, mode: "insensitive" } } } },
              { variants: { some: { barcode: { contains: query.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productListInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.product.count({ where }),
    ]);
    return toPage(rows.map(toProductListItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<ProductDetailDto> {
    return toProductDetail(await this.requireDetail(id));
  }

  async create(input: CreateProductInput, actor: AuthUser, ip: string | undefined): Promise<ProductDetailDto> {
    if (input.categoryId) await this.requireCategory(input.categoryId);
    const slug =
      input.slug ??
      (await uniqueSlug(input.name, "product", async (candidate) =>
        (await this.prisma.product.count({ where: { slug: candidate } })) > 0,
      ));
    const optionNames = input.options.map((option) => option.name);

    let productId: string;
    try {
      productId = await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: input.name,
            slug,
            description: input.description,
            status: input.status,
            categoryId: input.categoryId ?? null,
            options: {
              create: input.options.map((option, optionIndex) => ({
                name: option.name,
                position: optionIndex,
                values: { create: option.values.map((value, valueIndex) => ({ value, position: valueIndex })) },
              })),
            },
          },
          include: { options: { include: { values: true } } },
        });

        // optionName -> value -> ProductOptionValue.id
        const valueIds = new Map(
          product.options.map((option) => [option.name, new Map(option.values.map((v) => [v.value, v.id]))] as const),
        );
        const optionValueId = (name: string, value: string | undefined): string => {
          const id = value === undefined ? undefined : valueIds.get(name)?.get(value);
          if (id === undefined) throw new Error(`Option value not found: ${name}=${value ?? "(missing)"}`);
          return id;
        };

        const skuToId = new Map<string, string>();
        for (const variant of input.variants) {
          const created = await tx.productVariant.create({
            data: {
              productId: product.id,
              sku: variant.sku,
              barcode: variant.barcode ?? null,
              name: variantName(optionNames, variant.optionValues),
              price: variant.price,
              compareAtPrice: variant.compareAtPrice ?? null,
              costPrice: variant.costPrice,
              weightGrams: variant.weightGrams ?? null,
              isActive: variant.isActive,
              optionValues: {
                connect: optionNames.map((name) => ({ id: optionValueId(name, variant.optionValues[name]) })),
              },
            },
          });
          skuToId.set(variant.sku, created.id);
        }

        if (input.images.length > 0) {
          await tx.productImage.createMany({
            data: input.images.map((image, position) => ({
              productId: product.id,
              url: image.url,
              alt: image.alt ?? null,
              position,
              variantId: image.variantSku ? (skuToId.get(image.variantSku) ?? null) : null,
            })),
          });
        }
        return product.id;
      }, { timeout: 15_000 });
    } catch (error) {
      if (prismaErrorCode(error) === "P2003") throw new BadRequestException("Category not found");
      throw duplicateError(error) ?? error;
    }

    const created = await this.requireDetail(productId);
    await this.audit.record({
      userId: actor.id,
      action: "product.create",
      entity: "Product",
      entityId: productId,
      after: productSnapshot(created),
      ip,
    });
    return toProductDetail(created);
  }

  async update(id: string, input: UpdateProductInput, actor: AuthUser, ip: string | undefined): Promise<ProductDetailDto> {
    const before = await this.requireDetail(id);
    if (input.categoryId) await this.requireCategory(input.categoryId);
    try {
      await this.prisma.product.update({
        where: { id },
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          status: input.status,
          categoryId: input.categoryId,
        },
      });
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === "P2025") throw new NotFoundException("Product not found");
      if (code === "P2003") throw new BadRequestException("Category not found");
      throw duplicateError(error) ?? error;
    }
    const after = await this.requireDetail(id);
    await this.audit.record({
      userId: actor.id,
      action: "product.update",
      entity: "Product",
      entityId: id,
      before: productSnapshot(before),
      after: productSnapshot(after),
      ip,
    });
    return toProductDetail(after);
  }

  /**
   * ເຄີຍຖືກຂາຍ (ມີ OrderItem) → ARCHIVED ແທນການລຶບ. ບໍ່ເຄີຍຂາຍ ແຕ່ມີ StockMovement → 409.
   * ອື່ນໆ → ລຶບແທ້ (variant/option/ຮູບຖືກລຶບຕາມ cascade).
   */
  async remove(id: string, actor: AuthUser, ip: string | undefined): Promise<{ archived: boolean }> {
    const before = await this.requireDetail(id);
    const variantIds = before.variants.map((variant) => variant.id);

    if ((await this.prisma.orderItem.count({ where: { variantId: { in: variantIds } } })) > 0) {
      await this.prisma.product.update({ where: { id }, data: { status: "ARCHIVED" } });
      await this.audit.record({
        userId: actor.id,
        action: "product.archive",
        entity: "Product",
        entityId: id,
        before: productSnapshot(before),
        after: { ...productSnapshot(before), status: "ARCHIVED" },
        ip,
      });
      return { archived: true };
    }
    if ((await this.prisma.stockMovement.count({ where: { variantId: { in: variantIds } } })) > 0) {
      throw new ConflictException("Product has stock history; archive it instead (PATCH status=ARCHIVED)");
    }
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === "P2025") throw new NotFoundException("Product not found");
      if (code === "P2003") throw new ConflictException("Product is referenced by orders/stock; archive it instead");
      throw error;
    }
    await this.audit.record({
      userId: actor.id,
      action: "product.delete",
      entity: "Product",
      entityId: id,
      before: productSnapshot(before),
      ip,
    });
    return { archived: false };
  }

  async addVariant(productId: string, input: VariantInput, actor: AuthUser, ip: string | undefined): Promise<VariantDto> {
    let createdId: string;
    let createdSku: string;
    try {
      ({ id: createdId, sku: createdSku } = await this.prisma.$transaction(async (tx) => {
        // serialise concurrent variant additions to the same product
        await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${productId} FOR UPDATE`;
        const product = await tx.product.findUnique({ where: { id: productId }, include: productDetailInclude });
        if (!product) throw new NotFoundException("Product not found");
        const optionNames = product.options.map((option) => option.name);

        if (optionNames.length === 0) {
          throw new ConflictException("A product without options has exactly one variant");
        }
        const givenKeys = Object.keys(input.optionValues);
        if (givenKeys.length !== optionNames.length || !optionNames.every((name) => name in input.optionValues)) {
          throw new BadRequestException("optionValues must specify every option");
        }
        const valueIds: string[] = [];
        for (const option of product.options) {
          const match = option.values.find((value) => value.value === input.optionValues[option.name]);
          if (!match) throw new BadRequestException(`Value for option "${option.name}" is not in its list`);
          valueIds.push(match.id);
        }
        const combo = [...valueIds].sort().join("|");
        const taken = product.variants.some(
          (variant) =>
            variant.optionValues
              .map((value) => value.id)
              .sort()
              .join("|") === combo,
        );
        if (taken) throw new ConflictException("A variant with these option values already exists");

        return tx.productVariant.create({
          data: {
            productId,
            sku: input.sku,
            barcode: input.barcode ?? null,
            name: variantName(optionNames, input.optionValues),
            price: input.price,
            compareAtPrice: input.compareAtPrice ?? null,
            costPrice: input.costPrice,
            weightGrams: input.weightGrams ?? null,
            isActive: input.isActive,
            optionValues: { connect: valueIds.map((valueId) => ({ id: valueId })) },
          },
        });
      }));
    } catch (error) {
      throw duplicateError(error) ?? error;
    }
    await this.audit.record({
      userId: actor.id,
      action: "variant.create",
      entity: "ProductVariant",
      entityId: createdId,
      after: { productId, sku: createdSku },
      ip,
    });
    const variant = toProductDetail(await this.requireDetail(productId)).variants.find((item) => item.id === createdId);
    if (!variant) throw new NotFoundException("Variant not found");
    return variant;
  }

  async updateVariant(id: string, input: UpdateVariantInput, actor: AuthUser, ip: string | undefined): Promise<VariantDto> {
    const before = await this.prisma.productVariant.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Variant not found");

    const price = input.price ?? before.price.toFixed(2);
    const compareAt = input.compareAtPrice === undefined ? before.compareAtPrice?.toFixed(2) ?? null : input.compareAtPrice;
    if (compareAt !== null && new Prisma.Decimal(compareAt).lessThan(price)) {
      throw new BadRequestException("compareAtPrice must be >= price");
    }

    let after: typeof before;
    try {
      after = await this.prisma.productVariant.update({
        where: { id },
        data: {
          sku: input.sku,
          barcode: input.barcode,
          price: input.price,
          compareAtPrice: input.compareAtPrice,
          costPrice: input.costPrice,
          weightGrams: input.weightGrams,
          isActive: input.isActive,
        },
      });
    } catch (error) {
      if (prismaErrorCode(error) === "P2025") throw new NotFoundException("Variant not found");
      throw duplicateError(error) ?? error;
    }
    const detail = await this.requireDetail(before.productId);
    const variant = toProductDetail(detail).variants.find((item) => item.id === id);
    if (!variant) throw new NotFoundException("Variant not found");
    await this.audit.record({
      userId: actor.id,
      action: "variant.update",
      entity: "ProductVariant",
      entityId: id,
      before: variantSnapshot(before),
      after: variantSnapshot(after),
      ip,
    });
    return variant;
  }

  async putImages(productId: string, input: PutProductImagesInput, actor: AuthUser, ip: string | undefined): Promise<ProductDetailDto> {
    const before = await this.requireDetail(productId);
    const variantIds = [...new Set(input.images.flatMap((image) => (image.variantId ? [image.variantId] : [])))];
    if (variantIds.length > 0) {
      const owned = await this.prisma.productVariant.count({ where: { id: { in: variantIds }, productId } });
      if (owned !== variantIds.length) throw new BadRequestException("variantId does not belong to this product");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId } });
      if (input.images.length > 0) {
        await tx.productImage.createMany({
          data: input.images.map((image, position) => ({
            productId,
            url: image.url,
            alt: image.alt ?? null,
            position,
            variantId: image.variantId ?? null,
          })),
        });
      }
    });
    await this.audit.record({
      userId: actor.id,
      action: "product.images",
      entity: "Product",
      entityId: productId,
      before: { images: before.images.map((image) => ({ url: image.url, variantId: image.variantId })) },
      after: { images: input.images.map((image) => ({ url: image.url, variantId: image.variantId ?? null })) },
      ip,
    });
    return toProductDetail(await this.requireDetail(productId));
  }

  // ----- helpers -----
  async requireDetail(id: string): Promise<ProductDetailRow> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productDetailInclude });
    if (!row) throw new NotFoundException("Product not found");
    return row;
  }

  async requireCategory(categoryId: string): Promise<void> {
    const found = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!found) throw new BadRequestException("Category not found");
  }
}
