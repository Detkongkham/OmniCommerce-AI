import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type AdjustPointsInput,
  type CrmCustomerListQuery,
  type CrmPageQuery,
  type MergeCustomerInput,
  type UpdateCustomerInput,
  adjustPointsSchema,
  crmCustomerListQuerySchema,
  crmPageQuerySchema,
  mergeCustomerSchema,
  updateCustomerSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CrmCustomersService } from "./crm-customers.service";

@Controller("crm/customers")
export class CrmCustomersController {
  constructor(@Inject(CrmCustomersService) private readonly customers: CrmCustomersService) {}

  @Get()
  @RequirePermissions("crm:read")
  list(@Query(new ZodValidationPipe(crmCustomerListQuerySchema)) query: CrmCustomerListQuery) {
    return this.customers.list(query);
  }

  // ຕ້ອງຢູ່ກ່ອນ route ":id" (Task 3)
  @Get("segments")
  @RequirePermissions("crm:read")
  segments() {
    return this.customers.segments();
  }

  @Get(":id")
  @RequirePermissions("crm:read")
  get(@Param("id") id: string) {
    return this.customers.get(id);
  }

  @Get(":id/orders")
  @RequirePermissions("crm:read")
  orders(@Param("id") id: string, @Query(new ZodValidationPipe(crmPageQuerySchema)) query: CrmPageQuery) {
    return this.customers.orders(id, query);
  }

  @Get(":id/conversations")
  @RequirePermissions("crm:read")
  conversations(@Param("id") id: string) {
    return this.customers.conversations(id);
  }

  @Get(":id/points")
  @RequirePermissions("crm:read")
  points(@Param("id") id: string, @Query(new ZodValidationPipe(crmPageQuerySchema)) query: CrmPageQuery) {
    return this.customers.points(id, query);
  }

  @Post(":id/points/adjust")
  @HttpCode(200)
  @RequirePermissions("crm:write")
  adjustPoints(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adjustPointsSchema)) body: AdjustPointsInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.adjustPoints(id, body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("crm:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.update(id, body, actor, req.ip);
  }

  @Post(":id/merge")
  @HttpCode(200)
  @RequirePermissions("crm:write")
  merge(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(mergeCustomerSchema)) body: MergeCustomerInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.customers.merge(id, body, actor, req.ip);
  }

  @Post(":id/pin/reset")
  @HttpCode(200)
  @RequirePermissions("crm:write")
  resetPin(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.customers.resetPin(id, actor, req.ip);
  }
}
