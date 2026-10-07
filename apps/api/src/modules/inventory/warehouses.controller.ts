import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import {
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
  createWarehouseSchema,
  updateWarehouseSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { WarehousesService } from "./warehouses.service";

@Controller("warehouses")
export class WarehousesController {
  constructor(@Inject(WarehousesService) private readonly warehouses: WarehousesService) {}

  @Get()
  @RequirePermissions("inventory:read")
  list() {
    return this.warehouses.list();
  }

  @Post()
  @RequirePermissions("inventory:write")
  create(
    @Body(new ZodValidationPipe(createWarehouseSchema)) body: CreateWarehouseInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.warehouses.create(body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("inventory:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) body: UpdateWarehouseInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.warehouses.update(id, body, actor, req.ip);
  }

  @Post(":id/default")
  @HttpCode(200)
  @RequirePermissions("inventory:write")
  setDefault(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.warehouses.setDefault(id, actor, req.ip);
  }
}
