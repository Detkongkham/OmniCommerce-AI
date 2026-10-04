import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { PERMISSIONS, type RoleInput, roleSchema } from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions("staff:read")
  list() {
    return this.roles.list();
  }

  @Get(":id")
  @RequirePermissions("staff:read")
  get(@Param("id") id: string) {
    return this.roles.get(id);
  }

  @Post()
  @RequirePermissions("staff:write")
  create(
    @Body(new ZodValidationPipe(roleSchema)) body: RoleInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.roles.create(body, actor, req.ip);
  }

  @Put(":id")
  @RequirePermissions("staff:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(roleSchema)) body: RoleInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.roles.update(id, body, actor, req.ip);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("staff:write")
  async remove(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request): Promise<void> {
    await this.roles.remove(id, actor, req.ip);
  }
}

@Controller("permissions")
export class PermissionsController {
  @Get()
  @RequirePermissions("staff:read")
  list() {
    return { permissions: PERMISSIONS };
  }
}
