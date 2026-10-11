import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { type CreateFlashSaleInput, type UpdateFlashSaleInput, createFlashSaleSchema, updateFlashSaleSchema } from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { FlashSalesService } from "./flash-sales.service";

@Controller("flash-sales")
export class FlashSalesController {
  constructor(@Inject(FlashSalesService) private readonly flashSales: FlashSalesService) {}

  @Get()
  @RequirePermissions("promotion:read")
  list() {
    return this.flashSales.list();
  }

  @Post()
  @RequirePermissions("promotion:write")
  create(@Body(new ZodValidationPipe(createFlashSaleSchema)) body: CreateFlashSaleInput, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.flashSales.create(body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("promotion:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateFlashSaleSchema)) body: UpdateFlashSaleInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.flashSales.update(id, body, actor, req.ip);
  }
}
