import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type AdjustStockInput,
  type ReceiveStockInput,
  type ReturnStockInput,
  type StockListQuery,
  type StockMovementQuery,
  type StockThresholdInput,
  type TransferStockInput,
  adjustStockSchema,
  receiveStockSchema,
  returnStockSchema,
  stockListQuerySchema,
  stockMovementQuerySchema,
  stockThresholdSchema,
  transferStockSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StockService } from "./stock.service";

@Controller("stock")
export class StockController {
  constructor(@Inject(StockService) private readonly stock: StockService) {}

  @Get()
  @RequirePermissions("inventory:read")
  list(@Query(new ZodValidationPipe(stockListQuerySchema)) query: StockListQuery) {
    return this.stock.listLevels(query);
  }

  // ຕ້ອງປະກາດກ່ອນ ":id" routes ອື່ນ (ບໍ່ມີ GET :id ແຕ່ເກັບລຳດັບນີ້ໄວ້ເພື່ອປອດໄພ)
  @Get("movements")
  @RequirePermissions("inventory:read")
  movements(@Query(new ZodValidationPipe(stockMovementQuerySchema)) query: StockMovementQuery) {
    return this.stock.listMovements(query);
  }

  @Post("receive")
  @RequirePermissions("inventory:write")
  receive(
    @Body(new ZodValidationPipe(receiveStockSchema)) body: ReceiveStockInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.receive(body, actor, req.ip);
  }

  @Post("adjust")
  @RequirePermissions("inventory:write")
  adjust(
    @Body(new ZodValidationPipe(adjustStockSchema)) body: AdjustStockInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.adjust(body, actor, req.ip);
  }

  @Post("transfer")
  @RequirePermissions("inventory:write")
  transfer(
    @Body(new ZodValidationPipe(transferStockSchema)) body: TransferStockInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.transfer(body, actor, req.ip);
  }

  @Post("return")
  @RequirePermissions("inventory:write")
  returnStock(
    @Body(new ZodValidationPipe(returnStockSchema)) body: ReturnStockInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.returnStock(body, actor, req.ip);
  }

  @Patch(":id/threshold")
  @RequirePermissions("inventory:write")
  threshold(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(stockThresholdSchema)) body: StockThresholdInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.stock.setThreshold(id, body, actor, req.ip);
  }
}
