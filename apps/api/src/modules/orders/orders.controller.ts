import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
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

/**
 * ສິດຕາມໜ້າທີ່: ອ່ານ/ສ້າງ/ຍົກເລີກ = orders; ຢືນຢັນຊຳລະ = payments:write; ແພັກ/ສົ່ງ/ປິດ = logistics:write.
 * ການເຫັນຕົ້ນທຶນ (unitCost) ຄວບຄຸມໂດຍ costs:read ທີ່ CostRedactionInterceptor.
 */

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,128}$/;

/** header ເປັນ optional; ຖ້າສົ່ງມາຕ້ອງເປັນ ASCII ທີ່ພິມໄດ້ ບໍ່ມີຍະຫວ່າງ ຍາວ ≤ 128 */
function parseIdempotencyKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new BadRequestException("Idempotency-Key must be 1-128 printable ASCII characters without spaces");
  }
  return value;
}

@Controller("orders")
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions("orders:read")
  list(@Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery) {
    return this.orders.list(query);
  }

  @Get(":id")
  @RequirePermissions("orders:read")
  get(@Param("id") id: string) {
    return this.orders.get(id);
  }

  @Post()
  @RequirePermissions("orders:write")
  create(
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.orders.create(body, actor, req.ip, parseIdempotencyKey(idempotencyKey));
  }

  @Post(":id/pay")
  @HttpCode(200)
  @RequirePermissions("payments:write")
  pay(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.pay(id, actor, req.ip);
  }

  @Post(":id/pack")
  @HttpCode(200)
  @RequirePermissions("logistics:write")
  pack(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.pack(id, actor, req.ip);
  }

  @Post(":id/ship")
  @HttpCode(200)
  @RequirePermissions("logistics:write")
  ship(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.ship(id, actor, req.ip);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @RequirePermissions("logistics:write")
  complete(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.orders.complete(id, actor, req.ip);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions("orders:write")
  cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: CancelOrderInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.orders.cancel(id, body, actor, req.ip);
  }
}
