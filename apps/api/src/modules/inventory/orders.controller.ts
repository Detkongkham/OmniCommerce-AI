import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import {
  type CreateOrderInput,
  type OrderListQuery,
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
}
