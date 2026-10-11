import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient, SocialPostStatus } from "@oca/database";
import {
  type CreatePostInput,
  EDITABLE_POST_STATUSES,
  type PostListQuery,
  type PostMediaInput,
  type SchedulePostInput,
  type UpdatePostInput,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";
import { POST_INCLUDE, type SocialPostDto, toSocialPostDto } from "./posting.mapper";

type Tx = Prisma.TransactionClient;
const EDITABLE: SocialPostStatus[] = [...EDITABLE_POST_STATUSES];

/** ໂພສ: ຮ່າງ/ແກ້/ຕັ້ງເວລາ/ຍົກເລີກ/ລອງໃໝ່/ລຶບ. ການປ່ຽນສະຖານະໃຊ້ updateMany + ເງື່ອນໄຂສະຖານະ (ບໍ່ແຂ່ງກັບຕົວໂພສ) */
@Injectable()
export class PostsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: PostListQuery): Promise<Page<SocialPostDto>> {
    const range = query.from || query.to ? { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } : undefined;
    const where: Prisma.SocialPostWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(range ? { OR: [{ scheduledAt: range }, { publishedAt: range }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.socialPost.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.socialPost.count({ where }),
    ]);
    return toPage(rows.map(toSocialPostDto), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<SocialPostDto> {
    const row = await this.prisma.socialPost.findUnique({ where: { id }, include: POST_INCLUDE });
    if (!row) throw apiError("POST_NOT_FOUND", "Post not found");
    return toSocialPostDto(row);
  }

  async create(input: CreatePostInput, actor: AuthUser, ip: string | undefined): Promise<SocialPostDto> {
    await this.requireMediaFiles(input.media);
    if (input.liveSessionId) await this.requireLinkableSession(input.liveSessionId);
    const id = await this.withSessionGuard(async () => {
      const row = await this.prisma.socialPost.create({
        data: {
          message: input.message,
          liveSessionId: input.liveSessionId ?? null,
          createdById: actor.id,
          media: { create: mediaRows(input.media) },
        },
        select: { id: true },
      });
      return row.id;
    });
    await this.audit.record({ userId: actor.id, action: "post.create", entity: "SocialPost", entityId: id, ip });
    return this.get(id);
  }

  async update(id: string, input: UpdatePostInput, actor: AuthUser, ip: string | undefined): Promise<SocialPostDto> {
    const existing = await this.requirePost(id);
    if (input.media) await this.requireMediaFiles(input.media);
    if (input.liveSessionId) await this.requireLinkableSession(input.liveSessionId, id);
    const message = input.message ?? existing.message;
    const mediaCount = input.media?.length ?? existing._count.media;
    if (message.length === 0 && mediaCount === 0) throw apiError("VALIDATION_FAILED", "A post needs a message or at least one image");

    await this.withSessionGuard(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await tx.socialPost.findUnique({ where: { id }, select: { status: true } });
        if (!current || !EDITABLE.includes(current.status)) throw invalidState(current?.status ?? existing.status);
        // ແກ້ໂພສທີ່ລົ້ມ = ກັບເປັນຮ່າງ (ລ້າງ error); SCHEDULED ຍັງໂພສຕາມເວລາເດີມ
        const resetFailed = current.status === "FAILED" ? { status: "DRAFT" as const, scheduledAt: null, errorCode: null, errorMessage: null } : {};
        const { count } = await tx.socialPost.updateMany({
          where: { id, status: current.status },
          data: {
            ...(input.message !== undefined ? { message: input.message } : {}),
            ...(input.liveSessionId !== undefined ? { liveSessionId: input.liveSessionId } : {}),
            ...resetFailed,
          },
        });
        if (count === 0) throw invalidState(current.status);
        if (input.media) await replaceMedia(tx, id, input.media);
      }),
    );
    await this.audit.record({ userId: actor.id, action: "post.update", entity: "SocialPost", entityId: id, ip });
    return this.get(id);
  }

  async schedule(id: string, input: SchedulePostInput, actor: AuthUser, ip: string | undefined): Promise<SocialPostDto> {
    const existing = await this.requirePost(id);
    if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") throw invalidState(existing.status);
    if (existing.liveSessionId) await this.requireReadySession(existing.liveSessionId);
    const scheduledAt = input.scheduledAt ?? new Date();
    const { count } = await this.prisma.socialPost.updateMany({
      where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "SCHEDULED", scheduledAt, scheduledById: actor.id },
    });
    if (count === 0) throw invalidState(existing.status);
    await this.audit.record({
      userId: actor.id,
      action: "post.schedule",
      entity: "SocialPost",
      entityId: id,
      after: { scheduledAt: scheduledAt.toISOString(), immediate: input.scheduledAt === undefined },
      ip,
    });
    return this.get(id);
  }

  async cancel(id: string, actor: AuthUser, ip: string | undefined): Promise<SocialPostDto> {
    await this.transition(id, ["SCHEDULED"], { status: "DRAFT", scheduledAt: null });
    await this.audit.record({ userId: actor.id, action: "post.cancel", entity: "SocialPost", entityId: id, ip });
    return this.get(id);
  }

  /** ລອງໃໝ່ທັນທີ: ສຳລັບ PUBLISH_UNCERTAIN ຄົນຕ້ອງກວດເພຈກ່ອນ (UI ເຕືອນ) */
  async retry(id: string, actor: AuthUser, ip: string | undefined): Promise<SocialPostDto> {
    const existing = await this.requirePost(id);
    if (existing.status !== "FAILED") throw invalidState(existing.status);
    if (existing.liveSessionId) await this.requireReadySession(existing.liveSessionId);
    await this.transition(id, ["FAILED"], {
      status: "SCHEDULED",
      scheduledAt: new Date(),
      scheduledById: actor.id,
      errorCode: null,
      errorMessage: null,
    });
    await this.audit.record({ userId: actor.id, action: "post.retry", entity: "SocialPost", entityId: id, ip });
    return this.get(id);
  }

  async remove(id: string, actor: AuthUser, ip: string | undefined): Promise<void> {
    const existing = await this.requirePost(id);
    const { count } = await this.prisma.socialPost.deleteMany({ where: { id, status: { in: EDITABLE } } });
    if (count === 0) throw invalidState(existing.status);
    await this.audit.record({ userId: actor.id, action: "post.delete", entity: "SocialPost", entityId: id, ip });
  }

  private async transition(id: string, from: SocialPostStatus[], data: Prisma.SocialPostUpdateManyMutationInput & { scheduledById?: string }): Promise<void> {
    const existing = await this.requirePost(id);
    const { count } = await this.prisma.socialPost.updateMany({ where: { id, status: { in: from } }, data });
    if (count === 0) throw invalidState(existing.status);
  }

  private async requirePost(id: string) {
    const row = await this.prisma.socialPost.findUnique({
      where: { id },
      select: { status: true, message: true, liveSessionId: true, _count: { select: { media: true } } },
    });
    if (!row) throw apiError("POST_NOT_FOUND", "Post not found");
    return row;
  }

  private async requireMediaFiles(media: PostMediaInput[]): Promise<void> {
    const ids = [...new Set(media.flatMap((item) => ("mediaFileId" in item ? [item.mediaFileId] : [])))];
    if (ids.length === 0) return;
    const found = await this.prisma.mediaFile.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw apiError("MEDIA_NOT_FOUND", "One or more media files were not found");
  }

  /** session ຕ້ອງເປັນ Post CF ທີ່ຍັງເປັນຮ່າງ, ບໍ່ມີ post id ແລະ ບໍ່ຖືກໂພສອື່ນຜູກ */
  private async requireLinkableSession(sessionId: string, postId?: string): Promise<void> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { kind: true, status: true, externalPostId: true, socialPost: { select: { id: true } } },
    });
    if (!session) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
    if (session.kind !== "POST" || session.status !== "DRAFT" || session.externalPostId) {
      throw apiError("LIVE_SESSION_INVALID_STATE", "Only draft Post CF sessions without a post id can be linked", { status: session.status });
    }
    if (session.socialPost && session.socialPost.id !== postId) {
      throw apiError("LIVE_SESSION_INVALID_STATE", "This session is already linked to another post");
    }
  }

  /** ຕອນຕັ້ງເວລາ: ຍັງຜູກໄດ້ ແລະ ມີລະຫັດ CF ຢ່າງໜ້ອຍ 1 (ບໍ່ດັ່ງນັ້ນ start ຫຼັງໂພສຈະລົ້ມ) */
  private async requireReadySession(sessionId: string): Promise<void> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { kind: true, status: true, externalPostId: true, _count: { select: { items: true } } },
    });
    if (!session) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
    if (session.kind !== "POST" || session.status !== "DRAFT" || session.externalPostId) {
      throw apiError("LIVE_SESSION_INVALID_STATE", "The linked session is no longer a draft Post CF session", { status: session.status });
    }
    if (session._count.items === 0) throw apiError("LIVE_SESSION_INVALID_STATE", "Add at least one CF code to the linked session before scheduling");
  }

  /** unique ຂອງ liveSessionId: ສອງຄຳຂໍຜູກ session ດຽວກັນພ້ອມກັນ */
  private async withSessionGuard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("LIVE_SESSION_INVALID_STATE", "This session is already linked to another post");
      throw error;
    }
  }
}

function invalidState(status: SocialPostStatus) {
  return apiError("POST_INVALID_STATE", `Post is ${status}`, { status });
}

function mediaRows(media: PostMediaInput[]) {
  return media.map((item, position) => ("mediaFileId" in item ? { position, mediaFileId: item.mediaFileId } : { position, url: item.url }));
}

async function replaceMedia(tx: Tx, postId: string, media: PostMediaInput[]): Promise<void> {
  await tx.socialPostMedia.deleteMany({ where: { postId } });
  if (media.length > 0) await tx.socialPostMedia.createMany({ data: mediaRows(media).map((row) => ({ ...row, postId })) });
}
