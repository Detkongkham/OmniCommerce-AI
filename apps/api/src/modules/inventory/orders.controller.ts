import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import {
  type CancelOrderInput,
  type CreateOrderInput,
  type OrderListQuery,
  cancelOrderSchema,
  createOrderSchema,
  orderListQuerySchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions("inventory:read")
  list(@Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery) {
    return this.orders.list(query);
  }

  @Get(":id")
  @RequirePermissions("inventory:read")
  get(@Param("id") id: string) {
    return this.orders.get(id);
  }

  @Post()
  @RequirePermissions("inventory:write")
  create(
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.orders.create(body, actor, req.ip);
  }

  @Post(":id/pay")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  pay(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.pay(id, actor, req.ip);
  }

  @Post(":id/pack")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  pack(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.pack(id, actor, req.ip);
  }

  @Post(":id/ship")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  ship(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.ship(id, actor, req.ip);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  complete(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.complete(id, actor, req.ip);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: CancelOrderInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.orders.cancel(id, body, actor, req.ip);
  }
}
