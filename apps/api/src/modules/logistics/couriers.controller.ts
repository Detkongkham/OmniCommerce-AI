import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { type CreateCourierInput, type UpdateCourierInput, createCourierSchema, updateCourierSchema } from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CouriersService } from "./couriers.service";

@Controller("couriers")
export class CouriersController {
  constructor(@Inject(CouriersService) private readonly couriers: CouriersService) {}

  @Get()
  @RequirePermissions("logistics:read")
  list() {
    return this.couriers.list();
  }

  @Post()
  @RequirePermissions("logistics:write")
  create(@Body(new ZodValidationPipe(createCourierSchema)) body: CreateCourierInput, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.couriers.create(body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("logistics:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCourierSchema)) body: UpdateCourierInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.couriers.update(id, body, actor, req.ip);
  }
}
