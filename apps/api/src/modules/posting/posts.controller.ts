import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type CreatePostInput,
  type PostListQuery,
  type SchedulePostInput,
  type UpdatePostInput,
  createPostSchema,
  postListQuerySchema,
  schedulePostSchema,
  updatePostSchema,
} from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { PostsService } from "./posts.service";

/** ເບິ່ງ = posting:read; ສ້າງ/ແກ້/ຕັ້ງເວລາ/ຍົກເລີກ/ລອງໃໝ່/ລຶບ = posting:write */
@Controller("posts")
export class PostsController {
  constructor(@Inject(PostsService) private readonly posts: PostsService) {}

  @Get()
  @RequirePermissions("posting:read")
  list(@Query(new ZodValidationPipe(postListQuerySchema)) query: PostListQuery) {
    return this.posts.list(query);
  }

  @Get(":id")
  @RequirePermissions("posting:read")
  get(@Param("id") id: string) {
    return this.posts.get(id);
  }

  @Post()
  @RequirePermissions("posting:write")
  create(@Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.posts.create(body, actor, req.ip);
  }

  @Patch(":id")
  @RequirePermissions("posting:write")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePostSchema)) body: UpdatePostInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.posts.update(id, body, actor, req.ip);
  }

  @Post(":id/schedule")
  @HttpCode(200)
  @RequirePermissions("posting:write")
  schedule(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(schedulePostSchema)) body: SchedulePostInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.posts.schedule(id, body, actor, req.ip);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions("posting:write")
  cancel(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.posts.cancel(id, actor, req.ip);
  }

  @Post(":id/retry")
  @HttpCode(200)
  @RequirePermissions("posting:write")
  retry(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.posts.retry(id, actor, req.ip);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("posting:write")
  async remove(@Param("id") id: string, @CurrentUser() actor: AuthUser, @Req() req: Request): Promise<void> {
    await this.posts.remove(id, actor, req.ip);
  }
}
