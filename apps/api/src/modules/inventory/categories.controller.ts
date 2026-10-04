import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import {
  type CreateCategoryInput,
  type UpdateCategoryInput,
  createCategorySchema,
  updateCategorySchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CategoriesService } from "./categories.service";

@Controller("categories")
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions("inventory:read")
  list() {
    return this.categories.list();
  }

  @Post()
  @RequirePermissions("inventory:write")
  create(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.categories.create(body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("inventory:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.categories.update(id, body, actor, req.ip);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("inventory:write")
  async remove(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request): Promise<void> {
    await this.categories.remove(id, actor, req.ip);
  }
}
