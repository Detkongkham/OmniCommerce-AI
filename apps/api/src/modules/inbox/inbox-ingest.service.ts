import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { InboundEvent } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";
import { ChannelRegistry } from "./channel-registry";
import { InboxEventsService } from "./inbox-events.service";

export const PREVIEW_MAX = 120;
/** timestamp ຈາກ channel ທີ່ເກີນເວລາປັດຈຸບັນຫຼາຍກວ່ານີ້ ຖືວ່າຜິດ (ກັນເຄສຄ້າງເທິງສຸດ) */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

/** ຊື່ຊົ່ວຄາວຈົນກວ່າຈະດຶງຊື່ຈິງໄດ້ */
export function defaultDisplayName(channel: string, threadId: string): string {
  const label = channel === "FACEBOOK" ? "Facebook" : channel;
  return `${label} ${threadId.slice(-4)}`;
}

export interface IngestResult {
  conversationId: string;
  duplicate: boolean;
}

@Injectable()
export class InboxIngestService implements OnModuleDestroy {
  private readonly logger = new Logger(InboxIngestService.name);
  private readonly background = new Set<Promise<void>>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(InboxEventsService) private readonly events: InboxEventsService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
  ) {}

  /**
   * ບັນທຶກເຫດການ 1 ອັນ. ກັນຊ້ຳດ້ວຍ unique (conversationId, externalId) ແບບ ON CONFLICT DO NOTHING
   * ເພື່ອບໍ່ໃຫ້ transaction ຖືກ abort ເມື່ອ Meta ສົ່ງ mid ຊ້ຳ (ຫຼື 2 request ພ້ອມກັນ).
   * thread ໃໝ່ທີ່ 2 request ສ້າງພ້ອມກັນອາດຊົນ unique ຂອງເຄສ (P2002): ລອງໃໝ່ 1 ຄັ້ງ (ຮອບສອງເຄສມີແລ້ວ).
   */
  async ingest(event: InboundEvent): Promise<IngestResult> {
    let result: IngestResult;
    try {
      result = await this.store(event);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      result = await this.store(event);
    }
    if (!result.duplicate) {
      await this.events.publish({ type: "conversation.updated", conversationId: result.conversationId });
    }
    return result;
  }

  private store(event: InboundEvent): Promise<IngestResult> {
    const at = event.timestamp.getTime() > Date.now() + MAX_FUTURE_SKEW_MS ? new Date() : event.timestamp;
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { channel_externalThreadId: { channel: event.channel, externalThreadId: event.threadId } },
        create: {
          channel: event.channel,
          externalThreadId: event.threadId,
          displayName: defaultDisplayName(event.channel, event.threadId),
          lastMessageAt: at,
        },
        update: {},
      });
      const inserted = await tx.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            direction: event.kind === "echo" ? "OUT" : "IN",
            externalId: event.externalId,
            text: event.text,
            attachments: event.attachments.length > 0 ? event.attachments : undefined,
            status: "SENT",
            createdAt: at,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { conversationId: conversation.id, duplicate: true };

      // ເງື່ອນໄຂ "ໃໝ່ສຸດ" ຢູ່ໃນ WHERE ຂອງ UPDATE ດຽວ (atomic): 2 webhook ພ້ອມກັນບໍ່ຂຽນທັບກັນຖອຍຫຼັງ
      await tx.conversation.updateMany({
        where: { id: conversation.id, lastMessageAt: { lte: at } },
        data: { lastMessageAt: at, lastMessagePreview: event.text ? event.text.slice(0, PREVIEW_MAX) : null },
      });
      if (event.kind === "message") {
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { unreadCount: { increment: 1 }, status: "OPEN" },
        });
      }
      return { conversationId: conversation.id, duplicate: false };
    });
  }

  /** ດຶງຊື່ໂປຣໄຟລ໌ໃນພື້ນຫຼັງ (ບໍ່ລໍຖ້າ) ແຕ່ຕິດຕາມໄວ້ເພື່ອ drain ຕອນປິດ app/test */
  enrichInBackground(conversationId: string): void {
    const task = this.enrichProfile(conversationId)
      .catch((error: unknown) => {
        this.logger.warn(`profile enrich failed: ${error instanceof Error ? error.name : "unknown error"}`);
      })
      .finally(() => this.background.delete(task));
    this.background.add(task);
  }

  /** ລໍຈົນງານພື້ນຫຼັງທັງໝົດແລ້ວ (ລວມງານທີ່ຖືກເພີ່ມລະຫວ່າງລໍ) */
  async drain(): Promise<void> {
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.drain();
  }

  /** ດຶງຊື່ໂປຣໄຟລ໌ (best-effort): ປ່ຽນສະເພາະເມື່ອຊື່ຍັງເປັນຊື່ default ຢູ່ */
  async enrichProfile(conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return;
    const fallback = defaultDisplayName(conversation.channel, conversation.externalThreadId);
    if (conversation.displayName !== fallback) return;
    const profile = await this.channels.adapterFor(conversation.channel)?.fetchProfile(conversation.externalThreadId);
    if (!profile) return;
    const { count } = await this.prisma.conversation.updateMany({
      where: { id: conversationId, displayName: fallback },
      data: { displayName: profile.name },
    });
    if (count > 0) await this.events.publish({ type: "conversation.updated", conversationId });
  }
}
