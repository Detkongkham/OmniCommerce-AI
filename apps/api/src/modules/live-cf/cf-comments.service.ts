import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { CfCommentListQuery } from "@oca/shared";
import { apiError } from "../../common/api-error";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { PRISMA } from "../../prisma/prisma.module";
import { CfReplyService } from "./cf-reply.service";
import { COMMENT_INCLUDE, type CfCommentDto, toCommentDto } from "./live-cf.mapper";

@Injectable()
export class CfCommentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CfReplyService) private readonly replies: CfReplyService,
  ) {}

  async list(sessionId: string, query: CfCommentListQuery): Promise<Page<CfCommentDto>> {
    await this.requireSession(sessionId);
    const where = { sessionId, ...(query.outcome ? { outcome: query.outcome } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cfComment.findMany({
        where,
        include: COMMENT_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.cfComment.count({ where }),
    ]);
    return toPage(rows.map(toCommentDto), total, query.page, query.pageSize);
  }

  /** ສົ່ງຂໍ້ຄວາມຄືນເມື່ອສົ່ງລົ້ມ (replyStatus FAILED ເທົ່ານັ້ນ). ບໍ່ແຕະບິນ; deliver() claim ແບບ atomic ຈຶ່ງກົດຊ້ຳບໍ່ສົ່ງຊ້ຳ */
  async resend(sessionId: string, commentId: string): Promise<CfCommentDto> {
    await this.requireSession(sessionId);
    const row = await this.prisma.cfComment.findFirst({ where: { id: commentId, sessionId } });
    if (!row) throw apiError("CF_COMMENT_NOT_FOUND", "Comment not found");
    if (row.replyStatus !== "FAILED") {
      throw apiError("CONFLICT", `Reply status is ${row.replyStatus}; only FAILED replies can be resent`);
    }
    await this.replies.deliver(row.id);
    const updated = await this.prisma.cfComment.findUniqueOrThrow({ where: { id: row.id }, include: COMMENT_INCLUDE });
    return toCommentDto(updated);
  }

  private async requireSession(id: string): Promise<void> {
    const found = await this.prisma.liveSession.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
  }
}
