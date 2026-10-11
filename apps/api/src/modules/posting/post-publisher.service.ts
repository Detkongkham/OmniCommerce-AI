import { HttpException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { PostPhoto } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import { isErrorCode, type PostPublishError } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { StorageService } from "../../common/storage/storage.service";
import { ENV, type Env } from "../../config/env";
import { PRISMA } from "../../prisma/prisma.module";
import { ChannelRegistry } from "../inbox/channel-registry";
import { LiveSessionsService } from "../live-cf/live-sessions.service";

/** PUBLISHING ດົນກວ່ານີ້ = process ລົ້ມກາງທາງ; ບໍ່ຮູ້ວ່າຂຶ້ນເພຈແລ້ວບໍ່ */
export const PUBLISHING_STALE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 10;
const MAX_BATCHES_PER_RUN = 10;

export interface PublishRunResult {
  published: number;
  failed: number;
  uncertain: number;
}

/**
 * ໂພສທີ່ຮອດເວລາລົງ Facebook Page. ແລ່ນທຸກ `POSTING_TICK_MS` ແລະ ທັນທີເມື່ອກົດ "ໂພສທັນທີ" (`kick`).
 * ຫຼາຍ instance ປອດໄພ: ໂພສແຕ່ລະອັນຖືກ claim (SCHEDULED → PUBLISHING) ດ້ວຍ updateMany ທີ່ມີເງື່ອນໄຂ.
 * ບໍ່ retry ເອງ: ຄວາມລົ້ມເຫຼວທຸກແບບ → FAILED ໃຫ້ຄົນກົດລອງໃໝ່ (ກັນໂພສຊ້ຳເທິງເພຈ).
 */
@Injectable()
export class PostPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostPublisherService.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<PublishRunResult> | undefined;
  private rerun = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
    @Inject(LiveSessionsService) private readonly sessions: LiveSessionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    if (this.env.POSTING_TICK_MS <= 0) return;
    this.timer = setInterval(() => this.kick(), this.env.POSTING_TICK_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  /** ເລີ່ມຮອບໂດຍບໍ່ລໍ (error ລົງ log) */
  kick(): void {
    this.runDue().catch((error: unknown) => this.logger.error(`publish run failed: ${(error as Error).message}`));
  }

  /** ໃນ process ດຽວແລ່ນເທື່ອລະຮອບ; ຄຳຂໍລະຫວ່າງແລ່ນ = ແລ່ນອີກຮອບຕໍ່ທ້າຍ (ບໍ່ພາດໂພສທີ່ຫາກໍ່ຕັ້ງ) */
  runDue(): Promise<PublishRunResult> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    const run = (async () => {
      const total: PublishRunResult = { published: 0, failed: 0, uncertain: 0 };
      do {
        this.rerun = false;
        const result = await this.processDue();
        total.published += result.published;
        total.failed += result.failed;
        total.uncertain += result.uncertain;
      } while (this.rerun);
      return total;
    })();
    this.running = run.finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  /** ໜຶ່ງຮອບ (ບໍ່ມີ lock ໃນ process: ຄວາມຖືກຕ້ອງມາຈາກ claim ໃນ DB) */
  async processDue(now: Date = new Date()): Promise<PublishRunResult> {
    const { count: uncertain } = await this.prisma.socialPost.updateMany({
      where: { status: "PUBLISHING", publishingAt: { lt: new Date(now.getTime() - PUBLISHING_STALE_MS) } },
      data: {
        status: "FAILED",
        errorCode: "PUBLISH_UNCERTAIN" satisfies PostPublishError,
        errorMessage: "Publishing was interrupted; check the Page before retrying",
      },
    });
    const result: PublishRunResult = { published: 0, failed: 0, uncertain };
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const due = await this.prisma.socialPost.findMany({
        where: { status: "SCHEDULED", scheduledAt: { lte: now } },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        take: BATCH_SIZE,
        select: { id: true },
      });
      for (const { id } of due) {
        const { count } = await this.prisma.socialPost.updateMany({
          where: { id, status: "SCHEDULED", scheduledAt: { lte: now } },
          data: { status: "PUBLISHING", publishingAt: new Date() },
        });
        if (count === 0) continue; // instance ອື່ນເອົາໄປແລ້ວ ຫຼື ຖືກຍົກເລີກ
        if (await this.publish(id)) result.published += 1;
        else result.failed += 1;
      }
      if (due.length < BATCH_SIZE) break;
    }
    return result;
  }

  /** ໂພສທີ່ claim ແລ້ວ; true = ຂຶ້ນເພຈ */
  private async publish(id: string): Promise<boolean> {
    const post = await this.prisma.socialPost.findUniqueOrThrow({
      where: { id },
      include: { media: { orderBy: { position: "asc" }, include: { mediaFile: true } } },
    });
    const photos: PostPhoto[] = [];
    for (const item of post.media) {
      if (item.mediaFile) {
        const data = await this.storage.read(item.mediaFile.storageKey);
        if (!data) return this.fail(post.id, post.scheduledById, "MEDIA_MISSING", `File of image ${item.position + 1} is missing`);
        photos.push({ data, mimeType: item.mediaFile.mimeType, filename: item.mediaFile.storageKey });
      } else if (item.url) {
        photos.push({ url: item.url });
      }
    }

    const sent = await this.channels.facebook.publishPost({ message: post.message, photos });
    if (!sent.ok) return this.fail(post.id, post.scheduledById, sent.code, sent.detail);

    await this.prisma.socialPost.updateMany({
      where: { id, status: "PUBLISHING" },
      data: { status: "PUBLISHED", publishedAt: new Date(), externalPostId: sent.externalId, errorCode: null, errorMessage: null },
    });
    await this.audit.record({
      userId: post.scheduledById,
      action: "post.publish",
      entity: "SocialPost",
      entityId: id,
      after: { externalPostId: sent.externalId },
    });
    if (post.liveSessionId) await this.linkLiveSession(id, post.liveSessionId, sent.externalId, post.scheduledById);
    return true;
  }

  private async fail(id: string, actorId: string | null, code: PostPublishError, detail: string): Promise<false> {
    await this.prisma.socialPost.updateMany({
      where: { id, status: "PUBLISHING" },
      data: { status: "FAILED", errorCode: code, errorMessage: detail.slice(0, 300) },
    });
    await this.audit.record({ userId: actorId, action: "post.publish_failed", entity: "SocialPost", entityId: id, after: { errorCode: code } });
    return false;
  }

  /** ໃສ່ post id ໃຫ້ session ແລ້ວ start; ລົ້ມ = ເກັບ code ໃນ cfLinkError (ໂພສຍັງ PUBLISHED) */
  private async linkLiveSession(postId: string, sessionId: string, externalPostId: string, actorId: string | null): Promise<void> {
    let cfLinkError: string | null = null;
    const { count } = await this.prisma.liveSession.updateMany({
      where: { id: sessionId, kind: "POST", status: "DRAFT", externalPostId: null },
      data: { externalPostId },
    });
    if (count === 0) {
      cfLinkError = "LIVE_SESSION_INVALID_STATE";
    } else {
      try {
        await this.sessions.start(sessionId, { id: actorId }, undefined);
      } catch (error) {
        cfLinkError = codeOf(error);
        if (cfLinkError === "INTERNAL_ERROR") this.logger.error(`start session ${sessionId} failed: ${(error as Error).message}`);
      }
    }
    if (cfLinkError) await this.prisma.socialPost.update({ where: { id: postId }, data: { cfLinkError } });
  }
}

function codeOf(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
    if (isErrorCode(code)) return code;
  }
  return "INTERNAL_ERROR";
}
