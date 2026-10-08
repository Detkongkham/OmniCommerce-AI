import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type FulfillmentListQuery,
  type OverridePackInput,
  type ShipOrderInput,
  type UpdateShippingInput,
  type VerifyPackInput,
  fulfillmentListQuerySchema,
  overridePackSchema,
  shipOrderSchema,
  updateShippingSchema,
  verifyPackSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { FulfillmentService } from "./fulfillment.service";

/** ອ່ານ = logistics:read; ແພັກ/ກວດ/ແກ້ຜູ້ຮັບ/ສົ່ງ = logistics:write; override = logistics:write + orders:write */
@Controller("fulfillment")
export class FulfillmentController {
  constructor(@Inject(FulfillmentService) private readonly fulfillment: FulfillmentService) {}

  @Get()
  @RequirePermissions("logistics:read")
  list(@Query(new ZodValidationPipe(fulfillmentListQuerySchema)) query: FulfillmentListQuery) {
    return this.fulfillment.list(query);
  }

  @Get(":orderId")
  @RequirePermissions("logistics:read")
  detail(@Param("orderId") orderId: string) {
    return this.fulfillment.detail(orderId);
  }

  @Post(":orderId/start")
  @HttpCode(200)
  @RequirePermissions("logistics:write")
  start(@Param("orderId") orderId: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.fulfillment.start(orderId, actor, req.ip);
  }

  @Post(":orderId/verify")
  @HttpCode(200)
  @RequirePermissions("logistics:write")
  verify(@Param("orderId") orderId: string, @Body(new ZodValidationPipe(verifyPackSchema)) body: VerifyPackInput, @CurrentUser() actor: AuthUser) {
    return this.fulfillment.verify(orderId, body, actor);
  }

  @Post(":orderId/override")
  @HttpCode(200)
  @RequirePermissions("logistics:write", "orders:write")
  override(
    @Param("orderId") orderId: string,
    @Body(new ZodValidationPipe(overridePackSchema)) body: OverridePackInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.fulfillment.override(orderId, body, actor, req.ip);
  }

  @Patch(":orderId/shipping")
  @RequirePermissions("logistics:write")
  updateShipping(
    @Param("orderId") orderId: string,
    @Body(new ZodValidationPipe(updateShippingSchema)) body: UpdateShippingInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.fulfillment.updateShipping(orderId, body, actor, req.ip);
  }

  @Post(":orderId/ship")
  @HttpCode(200)
  @RequirePermissions("logistics:write")
  ship(
    @Param("orderId") orderId: string,
    @Body(new ZodValidationPipe(shipOrderSchema)) body: ShipOrderInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.fulfillment.ship(orderId, body, actor, req.ip);
  }
}
