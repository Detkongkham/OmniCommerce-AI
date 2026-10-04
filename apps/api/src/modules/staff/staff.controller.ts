import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import {
  type CreateStaffInput,
  type UpdateStaffInput,
  createStaffSchema,
  updateStaffSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StaffService } from "./staff.service";

@Controller("staff")
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions("staff:read")
  list() {
    return this.staff.list();
  }

  @Get(":id")
  @RequirePermissions("staff:read")
  get(@Param("id") id: string) {
    return this.staff.get(id);
  }

  @Post()
  @RequirePermissions("staff:write")
  create(
    @Body(new ZodValidationPipe(createStaffSchema)) body: CreateStaffInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.staff.create(body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("staff:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.staff.update(id, body, actor, req.ip);
  }
}
