import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import {
  type CreateProductInput,
  type ProductListQuery,
  type PutProductImagesInput,
  type UpdateProductInput,
  type UpdateVariantInput,
  type VariantInput,
  createProductSchema,
  productListQuerySchema,
  putProductImagesSchema,
  updateProductSchema,
  updateVariantSchema,
  variantInputSchema,
} from "@oca/shared";
import type { Request, Response } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ProductsService } from "./products.service";

@Controller()
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get("products")
  @RequirePermissions("inventory:read")
  list(@Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery) {
    return this.products.list(query);
  }

  @Get("products/:id")
  @RequirePermissions("inventory:read")
  get(@Param("id") id: string) {
    return this.products.get(id);
  }

  @Post("products")
  @RequirePermissions("inventory:write")
  create(
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.create(body, actor, req.ip);
  }

  @Patch("products/:id")
  @RequirePermissions("inventory:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.update(id, body, actor, req.ip);
  }

  /** 204 ເມື່ອລຶບແທ້; 200 { archived: true } ເມື່ອ archive ແທນ */
  @Delete("products/:id")
  @RequirePermissions("inventory:write")
  async remove(
    @Param("id") id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.products.remove(id, actor, req.ip);
    if (!result.archived) {
      res.status(204);
      return undefined;
    }
    return result;
  }

  @Post("products/:id/variants")
  @RequirePermissions("inventory:write")
  addVariant(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(variantInputSchema)) body: VariantInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.addVariant(id, body, actor, req.ip);
  }

  @Patch("variants/:id")
  @RequirePermissions("inventory:write")
  updateVariant(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateVariantSchema)) body: UpdateVariantInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.updateVariant(id, body, actor, req.ip);
  }

  @Put("products/:id/images")
  @RequirePermissions("inventory:write")
  putImages(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(putProductImagesSchema)) body: PutProductImagesInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.products.putImages(id, body, actor, req.ip);
  }
}
