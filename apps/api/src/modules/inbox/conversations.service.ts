import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SendResult } from "@oca/channels";
import type { Prisma, PrismaClient } from "@oca/database";
import type {
  ConversationListQuery,
  CreateCustomerFromChatInput,
  MessageListQuery,
  SendMessageInput,
  UpdateConversationInput,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";
import { ChannelRegistry } from "./channel-registry";
import { InboxEventsService } from "./inbox-events.service";
import { PREVIEW_MAX } from "./inbox-ingest.service";
import {
  CONVERSATION_INCLUDE,
  type ConversationDto,
  type ConversationRow,
  MESSAGE_INCLUDE,
  type MessageDto,
  type MessageRow,
  toConversationDto,
  toMessageDto,
} from "./inbox.mapper";

function listWhere(query: ConversationListQuery, actor: AuthUser): Prisma.ConversationWhereInput {
  const where: Prisma.ConversationWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.assignee === "me") where.assigneeId = actor.id;
  else if (query.assignee === "unassigned") where.assigneeId = null;
  else if (query.assignee) where.assigneeId = query.assignee;
  if (query.unread === true) where.unreadCount = { gt: 0 };
  if (query.unread === false) where.unreadCount = 0;
  if (query.q) {
    where.OR = [
      { displayName: { contains: query.q, mode: "insensitive" } },
      { lastMessagePreview: { contains: query.q, mode: "insensitive" } },
    ];
  }
  return where;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
    @Inject(InboxEventsService) private readonly events: InboxEventsService,
  ) {}

  async list(query: ConversationListQuery, actor: AuthUser): Promise<Page<ConversationDto>> {
    const where = listWhere(query, actor);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: CONVERSATION_INCLUDE,
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return toPage(rows.map(toConversationDto), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<ConversationDto> {
    return toConversationDto(await this.require(id));
  }

  async listMessages(id: string, query: MessageListQuery): Promise<{ items: MessageDto[]; hasMore: boolean }> {
    await this.require(id);
    let before: Prisma.MessageWhereInput = {};
    if (query.beforeId) {
      const cursor = await this.prisma.message.findFirst({
        where: { id: query.beforeId, conversationId: id },
        select: { id: true, createdAt: true },
      });
      if (!cursor) throw apiError("NOT_FOUND", "Message cursor not found in this conversation");
      before = {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      };
    }
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, ...before },
      include: MESSAGE_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    return { items: rows.slice(0, query.limit).map(toMessageDto), hasMore: rows.length > query.limit };
  }

  /**
   * ບັນທຶກຂໍ້ຄວາມຂາອອກເປັນ PENDING ກ່ອນ ແລ້ວຈຶ່ງເອີ້ນ channel ເພື່ອບໍ່ໃຫ້ຂໍ້ຄວາມຫາຍເມື່ອສົ່ງບໍ່ໄດ້.
   * ການສົ່ງລົ້ມເຫຼວ = ຕອບ 201 ພ້ອມ status FAILED + errorCode (ບໍ່ແມ່ນ error ຂອງ HTTP).
   * ຖ້າ process ຕາຍກາງທາງ ແຖວຈະຄ້າງ PENDING (ຍັງບໍ່ມີ job ກວາດ; ບັນທຶກໃນ DEPLOYMENT-NOTES).
   */
  async sendMessage(id: string, input: SendMessageInput, actor: AuthUser): Promise<MessageDto> {
    const conversation = await this.require(id);
    const lastMessageAtBeforeSend = conversation.lastMessageAt;
    const pending = await this.prisma.message.create({
      data: { conversationId: id, direction: "OUT", text: input.text, status: "PENDING", sentByUserId: actor.id },
    });

    const adapter = this.channels.adapterFor(conversation.channel);
    let result: SendResult;
    try {
      result = adapter
        ? await adapter.sendText(conversation.externalThreadId, input.text)
        : { ok: false, code: "CHANNEL_NOT_CONFIGURED", detail: `No adapter for ${conversation.channel}` };
    } catch (error) {
      result = { ok: false, code: "SEND_REJECTED", detail: error instanceof Error ? error.message : String(error) };
    }
    if (!result.ok) this.logger.warn(`send failed (${conversation.id}): ${result.code} ${result.detail}`);

    const message = await this.settle(pending.id, id, actor, result);
    // ຫຼັງຈາກນີ້ເປັນ best-effort: ສົ່ງສຳເລັດແລ້ວ ຈຶ່ງບໍ່ໃຫ້ຂັ້ນຕອນເສີມເຮັດໃຫ້ request ເປັນ 500
    try {
      // ລ້າງ unread ສະເພາະເມື່ອບໍ່ມີຂໍ້ຄວາມຂາເຂົ້າໃໝ່ມາລະຫວ່າງສົ່ງ (ມັນຈະ bump lastMessageAt)
      await this.prisma.conversation.updateMany({
        where: { id, lastMessageAt: { lte: lastMessageAtBeforeSend } },
        data: { unreadCount: 0 },
      });
      await this.prisma.conversation.updateMany({
        where: { id, lastMessageAt: { lte: message.createdAt } },
        data: { lastMessageAt: message.createdAt, lastMessagePreview: input.text.slice(0, PREVIEW_MAX) },
      });
      await this.events.publish({ type: "conversation.updated", conversationId: id });
    } catch (error) {
      this.logger.error(
        `post-send update failed (message ${pending.id}, conversation ${id}, externalId ${result.ok ? result.externalId : "-"}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return toMessageDto(message);
  }

  private async settle(pendingId: string, conversationId: string, actor: AuthUser, result: SendResult): Promise<MessageRow> {
    if (!result.ok) {
      return this.prisma.message.update({
        where: { id: pendingId },
        data: { status: "FAILED", errorCode: result.code },
        include: MESSAGE_INCLUDE,
      });
    }
    try {
      return await this.prisma.message.update({
        where: { id: pendingId },
        data: { status: "SENT", externalId: result.externalId },
        include: MESSAGE_INCLUDE,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // webhook echo ຂອງຂໍ້ຄວາມນີ້ມາຮອດກ່ອນ response ຂອງ Graph: ແຖວ echo ເປັນຕົວຈິງ → ລຶບແຖວ pending ແລ້ວໃສ່ຜູ້ສົ່ງໃຫ້ echo
      // ທັງໝົດໃນ transaction ດຽວ: ຖ້າຫາ echo ບໍ່ເຫັນ ຈະ rollback ແລະ ແຖວ pending ຍັງຢູ່ (ຂໍ້ຄວາມບໍ່ເສຍ)
      return this.prisma.$transaction(async (tx) => {
        const echo = await tx.message.findFirstOrThrow({ where: { conversationId, externalId: result.externalId } });
        await tx.message.delete({ where: { id: pendingId } });
        return tx.message.update({ where: { id: echo.id }, data: { sentByUserId: actor.id }, include: MESSAGE_INCLUDE });
      });
    }
  }

  async update(id: string, input: UpdateConversationInput, actor: AuthUser, ip: string | undefined): Promise<ConversationDto> {
    const before = await this.require(id);
    if (input.assigneeId) {
      const user = await this.prisma.user.findUnique({ where: { id: input.assigneeId }, select: { isActive: true } });
      if (!user?.isActive) throw apiError("USER_NOT_FOUND", "Assignee not found or inactive");
    }
    if (input.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
      if (!customer) throw apiError("CUSTOMER_NOT_FOUND", "Customer not found");
    }
    const after = await this.prisma.conversation.update({
      where: { id },
      data: { assigneeId: input.assigneeId, status: input.status, customerId: input.customerId },
      include: CONVERSATION_INCLUDE,
    });
    await this.audit.record({
      userId: actor.id,
      action: "conversation.update",
      entity: "conversation",
      entityId: id,
      before: { assigneeId: before.assigneeId, status: before.status, customerId: before.customerId },
      after: { assigneeId: after.assigneeId, status: after.status, customerId: after.customerId },
      ip,
    });
    await this.events.publish({ type: "conversation.updated", conversationId: id });
    return toConversationDto(after);
  }

  async markRead(id: string): Promise<ConversationDto> {
    const row = await this.require(id);
    if (row.unreadCount === 0) return toConversationDto(row);
    const after = await this.prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
      include: CONVERSATION_INCLUDE,
    });
    await this.events.publish({ type: "conversation.updated", conversationId: id });
    return toConversationDto(after);
  }

  /** ສ້າງລູກຄ້າ + ລິ້ງເຄສໃນ transaction ດຽວ; ເຄສທີ່ລິ້ງແລ້ວ = 409 ໂດຍບໍ່ສ້າງລູກຄ້າເພີ່ມ (ກັນ 2 ຄົນກົດພ້ອມກັນ) */
  async createCustomer(
    id: string,
    input: CreateCustomerFromChatInput,
    actor: AuthUser,
    ip: string | undefined,
  ): Promise<ConversationDto> {
    const existing = await this.require(id);
    if (existing.customerId) throw apiError("CONFLICT", "Conversation is already linked to a customer");
    let after: ConversationRow;
    try {
      after = await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({ data: { name: input.name, phone: input.phone } });
        const linked = await tx.conversation.updateMany({
          where: { id, customerId: null },
          data: { customerId: customer.id },
        });
        if (linked.count === 0) throw apiError("CONFLICT", "Conversation is already linked to a customer");
        return tx.conversation.findUniqueOrThrow({ where: { id }, include: CONVERSATION_INCLUDE });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "Phone number already in use");
      throw error;
    }
    await this.audit.record({
      userId: actor.id,
      action: "conversation.create-customer",
      entity: "conversation",
      entityId: id,
      after: { customerId: after.customerId },
      ip,
    });
    await this.events.publish({ type: "conversation.updated", conversationId: id });
    return toConversationDto(after);
  }

  private async require(id: string): Promise<ConversationRow> {
    const row = await this.prisma.conversation.findUnique({ where: { id }, include: CONVERSATION_INCLUDE });
    if (!row) throw apiError("CONVERSATION_NOT_FOUND", "Conversation not found");
    return row;
  }
}
