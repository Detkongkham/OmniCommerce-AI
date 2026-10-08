import { Inject, Injectable } from "@nestjs/common";
import type { CommentEvent } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import { PRISMA } from "../../prisma/prisma.module";
import { CfQueueService } from "./cf-queue.service";

const CACHE_TTL_MS = 3000;
const CACHE_MAX_ENTRIES = 1000;

/** ຈາກ webhook: ກອງຄອມເມັ້ນຂອງໂພສທີ່ມີ session LIVE ແລ້ວໂຍນເຂົ້າ queue (ບໍ່ປະມວນຜົນໃນ request ຂອງ Meta) */
@Injectable()
export class CfIngestService {
  private readonly cache = new Map<string, { sessionId: string | null; expires: number }>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CfQueueService) private readonly queue: CfQueueService,
  ) {}

  /** ຄືນຈຳນວນທີ່ເຂົ້າ queue. queue ລົ້ມ (Redis) = throw → webhook 500 ໃຫ້ Meta ສົ່ງຊ້ຳ (jobId ກັນຊ້ຳ) */
  async enqueue(events: readonly CommentEvent[]): Promise<number> {
    let queued = 0;
    for (const event of events) {
      const sessionId = await this.liveSessionIdFor(event.postId);
      if (!sessionId) continue;
      await this.queue.add({
        sessionId,
        commentId: event.commentId,
        postId: event.postId,
        authorId: event.authorId,
        authorName: event.authorName,
        message: event.message,
      });
      queued += 1;
    }
    return queued;
  }

  /** ເອີ້ນເມື່ອ session start/end ເພື່ອບໍ່ໃຫ້ cache ເກົ່າບັງ session ໃໝ່ */
  invalidate(postId: string): void {
    this.cache.delete(postId);
  }

  private async liveSessionIdFor(postId: string): Promise<string | null> {
    const cached = this.cache.get(postId);
    if (cached && cached.expires > Date.now()) return cached.sessionId;
    const session = await this.prisma.liveSession.findFirst({
      where: { externalPostId: postId, status: "LIVE" },
      select: { id: true },
    });
    // negative cache: instance ອື່ນຂອງ API ອາດພາດຄອມເມັ້ນພາຍໃນ 3 ວິນາທີຫຼັງ `start` (ປັດຈຸບັນມີ instance ດຽວ)
    this.prune();
    this.cache.set(postId, { sessionId: session?.id ?? null, expires: Date.now() + CACHE_TTL_MS });
    return session?.id ?? null;
  }

  /** ກັນ cache ໃຫຍ່ຂຶ້ນບໍ່ມີທີ່ສິ້ນສຸດ (ຄອມເມັ້ນຈາກຫຼາຍໂພສ): ລຶບທີ່ໝົດອາຍຸກ່ອນ ແລ້ວລຶບອັນເກົ່າສຸດ (ລຳດັບ insert) */
  private prune(): void {
    if (this.cache.size < CACHE_MAX_ENTRIES) return;
    const now = Date.now();
    for (const [key, entry] of this.cache) if (entry.expires <= now) this.cache.delete(key);
    for (const key of this.cache.keys()) {
      if (this.cache.size < CACHE_MAX_ENTRIES) break;
      this.cache.delete(key);
    }
  }
}
