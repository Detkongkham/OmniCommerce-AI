import { Inject, Injectable } from "@nestjs/common";
import type { InboundEvent } from "@oca/channels";
import type { PrismaClient } from "@oca/database";
import { PRISMA } from "../../prisma/prisma.module";
import { ChannelRegistry } from "./channel-registry";
import { InboxEventsService } from "./inbox-events.service";

export const PREVIEW_MAX = 120;

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
export class InboxIngestService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(InboxEventsService) private readonly events: InboxEventsService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
  ) {}

  /**
   * ບັນທຶກເຫດການ 1 ອັນ. ກັນຊ້ຳດ້ວຍ unique (conversationId, externalId) ແບບ ON CONFLICT DO NOTHING
   * ເພື່ອບໍ່ໃຫ້ transaction ຖືກ abort ເມື່ອ Meta ສົ່ງ mid ຊ້ຳ (ຫຼື 2 request ພ້ອມກັນ).
   */
  async ingest(event: InboundEvent): Promise<IngestResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { channel_externalThreadId: { channel: event.channel, externalThreadId: event.threadId } },
        create: {
          channel: event.channel,
          externalThreadId: event.threadId,
          displayName: defaultDisplayName(event.channel, event.threadId),
          lastMessageAt: event.timestamp,
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
            createdAt: event.timestamp,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { conversationId: conversation.id, duplicate: true };

      const isNewest = event.timestamp >= conversation.lastMessageAt;
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          ...(isNewest
            ? {
                lastMessageAt: event.timestamp,
                lastMessagePreview: event.text ? event.text.slice(0, PREVIEW_MAX) : null,
              }
            : {}),
          ...(event.kind === "message" ? { unreadCount: { increment: 1 }, status: "OPEN" as const } : {}),
        },
      });
      return { conversationId: conversation.id, duplicate: false };
    });
    if (!result.duplicate) {
      await this.events.publish({ type: "conversation.updated", conversationId: result.conversationId });
    }
    return result;
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
