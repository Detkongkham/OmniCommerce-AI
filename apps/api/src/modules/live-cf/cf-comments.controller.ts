import { Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { type CfCommentListQuery, cfCommentListQuerySchema } from "@oca/shared";
import { RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CfCommentsService } from "./cf-comments.service";

@Controller("live-sessions/:id/comments")
export class CfCommentsController {
  constructor(@Inject(CfCommentsService) private readonly comments: CfCommentsService) {}

  @Get()
  @RequirePermissions("live-cf:read")
  list(@Param("id") id: string, @Query(new ZodValidationPipe(cfCommentListQuerySchema)) query: CfCommentListQuery) {
    return this.comments.list(id, query);
  }

  @Post(":commentId/resend")
  @HttpCode(200)
  @RequirePermissions("live-cf:write")
  resend(@Param("id") id: string, @Param("commentId") commentId: string) {
    return this.comments.resend(id, commentId);
  }
}
