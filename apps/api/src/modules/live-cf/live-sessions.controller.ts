import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import {
  type CreateLiveItemInput,
  type CreateLiveSessionInput,
  type LiveSessionListQuery,
  type SetFeaturedInput,
  type UpdateLiveItemInput,
  type UpdateLiveSessionInput,
  createLiveItemSchema,
  createLiveSessionSchema,
  liveSessionListQuerySchema,
  setFeaturedSchema,
  updateLiveItemSchema,
  updateLiveSessionSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { LiveSessionsService } from "./live-sessions.service";

/** ເບິ່ງ = live-cf:read; ສ້າງ/ແກ້/ເລີ່ມ/ຈົບ/ຈັດການລະຫັດ = live-cf:write */
@Controller("live-sessions")
export class LiveSessionsController {
  constructor(@Inject(LiveSessionsService) private readonly sessions: LiveSessionsService) {}

  @Get()
  @RequirePermissions("live-cf:read")
  list(@Query(new ZodValidationPipe(liveSessionListQuerySchema)) query: LiveSessionListQuery) {
    return this.sessions.list(query);
  }

  @Post()
  @RequirePermissions("live-cf:write")
  create(
    @Body(new ZodValidationPipe(createLiveSessionSchema)) body: CreateLiveSessionInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.sessions.create(body, actor, req.ip);
  }

  @Get(":id")
  @RequirePermissions("live-cf:read")
  get(@Param("id") id: string) {
    return this.sessions.get(id);
  }

  @Patch(":id")
  @RequirePermissions("live-cf:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLiveSessionSchema)) body: UpdateLiveSessionInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.sessions.update(id, body, actor, req.ip);
  }

  @Post(":id/start")
  @HttpCode(200)
  @RequirePermissions("live-cf:write")
  start(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.sessions.start(id, actor, req.ip);
  }

  @Post(":id/end")
  @HttpCode(200)
  @RequirePermissions("live-cf:write")
  end(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.sessions.end(id, actor, req.ip);
  }

  @Put(":id/featured")
  @RequirePermissions("live-cf:write")
  setFeatured(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setFeaturedSchema)) body: SetFeaturedInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.sessions.setFeatured(id, body, actor, req.ip);
  }

  @Post(":id/items")
  @RequirePermissions("live-cf:write")
  addItem(@Param("id") id: string, @Body(new ZodValidationPipe(createLiveItemSchema)) body: CreateLiveItemInput) {
    return this.sessions.addItem(id, body);
  }

  @Patch(":id/items/:itemId")
  @RequirePermissions("live-cf:write")
  updateItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateLiveItemSchema)) body: UpdateLiveItemInput,
  ) {
    return this.sessions.updateItem(id, itemId, body);
  }

  @Delete(":id/items/:itemId")
  @HttpCode(204)
  @RequirePermissions("live-cf:write")
  async removeItem(@Param("id") id: string, @Param("itemId") itemId: string): Promise<void> {
    await this.sessions.removeItem(id, itemId);
  }
}
