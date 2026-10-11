import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import {
  type CouponPreviewInput,
  type CreateCouponInput,
  type UpdateCouponInput,
  couponPreviewSchema,
  createCouponSchema,
  updateCouponSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CouponsService } from "./coupons.service";

/** ຈັດການໂຄດ = promotion; ລອງໂຄດ (preview) = orders:write ເພາະຜູ້ເປີດບິນຕ້ອງໃຊ້ */
@Controller("coupons")
export class CouponsController {
  constructor(@Inject(CouponsService) private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermissions("promotion:read")
  list() {
    return this.coupons.list();
  }

  @Post()
  @RequirePermissions("promotion:write")
  create(@Body(new ZodValidationPipe(createCouponSchema)) body: CreateCouponInput, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.coupons.create(body, actor, req.ip);
  }

  @Post("preview")
  @HttpCode(200)
  @RequirePermissions("orders:write")
  preview(@Body(new ZodValidationPipe(couponPreviewSchema)) body: CouponPreviewInput) {
    return this.coupons.preview(body);
  }

  @Patch(":id")
  @RequirePermissions("promotion:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCouponSchema)) body: UpdateCouponInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.coupons.update(id, body, actor, req.ip);
  }
}
