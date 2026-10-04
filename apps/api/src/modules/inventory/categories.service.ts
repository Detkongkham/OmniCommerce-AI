import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { CreateCategoryInput, UpdateCategoryInput } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { isUniqueViolation } from "../../common/prisma-errors";
import { uniqueSlug } from "../../common/unique-slug";
import { PRISMA } from "../../prisma/prisma.module";

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  productCount: number;
}

type CategoryRow = Awaited<ReturnType<PrismaClient["category"]["findUniqueOrThrow"]>>;

const snapshot = (row: CategoryRow) => ({
  name: row.name,
  slug: row.slug,
  parentId: row.parentId,
  position: row.position,
});

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      position: row.position,
      productCount: row._count.products,
    }));
  }

  async create(input: CreateCategoryInput, actor: AuthUser, ip: string | undefined): Promise<CategoryDto> {
    if (input.parentId) await this.requireParent(input.parentId);
    const slug =
      input.slug ??
      (await uniqueSlug(input.name, "category", async (candidate) =>
        (await this.prisma.category.count({ where: { slug: candidate } })) > 0,
      ));
    try {
      const row = await this.prisma.category.create({
        data: { name: input.name, slug, parentId: input.parentId ?? null, position: input.position },
      });
      await this.audit.record({
        userId: actor.id,
        action: "category.create",
        entity: "Category",
        entityId: row.id,
        after: snapshot(row),
        ip,
      });
      return { ...snapshot(row), id: row.id, productCount: 0 };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Category slug already in use");
      throw error;
    }
  }

  async update(id: string, input: UpdateCategoryInput, actor: AuthUser, ip: string | undefined): Promise<CategoryDto> {
    const before = await this.require(id);
    if (input.parentId !== undefined && input.parentId !== null) {
      await this.requireParent(input.parentId);
      await this.assertNoCycle(id, input.parentId);
    }
    try {
      const after = await this.prisma.category.update({
        where: { id },
        data: { name: input.name, slug: input.slug, parentId: input.parentId, position: input.position },
        include: { _count: { select: { products: true } } },
      });
      await this.audit.record({
        userId: actor.id,
        action: "category.update",
        entity: "Category",
        entityId: id,
        before: snapshot(before),
        after: snapshot(after),
        ip,
      });
      return { ...snapshot(after), id, productCount: after._count.products };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("Category slug already in use");
      throw error;
    }
  }

  async remove(id: string, actor: AuthUser, ip: string | undefined): Promise<void> {
    const before = await this.require(id);
    try {
      await this.prisma.$transaction(async (tx) => {
        if ((await tx.product.count({ where: { categoryId: id } })) > 0) {
          throw new ConflictException("Category still has products");
        }
        // ລູກຍ້າຍຂຶ້ນໄປຫາ parent ຂອງໝວດທີ່ລຶບ (ບໍ່ແມ່ນຫຼຸດໄປ root)
        await tx.category.updateMany({ where: { parentId: id }, data: { parentId: before.parentId } });
        await tx.category.delete({ where: { id } });
      });
    } catch (error) {
      // ຖືກລຶບພ້ອມກັນໂດຍຄົນອື່ນ (P2025)
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025") {
        throw new NotFoundException("Category not found");
      }
      throw error;
    }
    await this.audit.record({
      userId: actor.id,
      action: "category.delete",
      entity: "Category",
      entityId: id,
      before: snapshot(before),
      ip,
    });
  }

  private async require(id: string): Promise<CategoryRow> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Category not found");
    return row;
  }

  private async requireParent(parentId: string): Promise<void> {
    const parent = await this.prisma.category.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!parent) throw new BadRequestException("Parent category not found");
  }

  /** ຍ່າງຂຶ້ນຈາກ newParentId; ຖ້າພົບ id ຂອງໝວດທີ່ກຳລັງແກ້ = ວົນລູບ. */
  private async assertNoCycle(id: string, newParentId: string): Promise<void> {
    let cursor: string | null = newParentId;
    for (let depth = 0; cursor !== null && depth < 100; depth += 1) {
      if (cursor === id) throw new BadRequestException("A category cannot be its own ancestor");
      const row: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = row?.parentId ?? null;
    }
  }
}
