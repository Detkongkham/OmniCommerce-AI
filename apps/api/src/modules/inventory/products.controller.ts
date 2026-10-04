import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import {
  type CreateProductInput,
  type ProductListQuery,
  createProductSchema,
  productListQuerySchema,
} from "@oca/shared";
import type { Request } from "express";
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
}
