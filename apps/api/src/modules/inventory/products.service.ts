import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@oca/database";
import { type CreateProductInput, type ProductListQuery, variantName } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { uniqueViolationFields } from "../../common/prisma-errors";
import { uniqueSlug } from "../../common/unique-slug";
import { PRISMA } from "../../prisma/prisma.module";
import {
  type ProductDetailDto,
  type ProductDetailRow,
  type ProductListItemDto,
  productDetailInclude,
  productListInclude,
  productSnapshot,
  toProductDetail,
  toProductListItem,
} from "./products.mapper";

export function duplicateError(error: unknown): ConflictException | undefined {
  const fields = uniqueViolationFields(error);
  if (!fields) return undefined;
  return new ConflictException(`Duplicate value: ${fields.join(", ") || "unique field"}`);
}

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
      });
    } catch (error) {
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

  // ----- helpers ທີ່ Task 6 ໃຊ້ຕໍ່ -----
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
