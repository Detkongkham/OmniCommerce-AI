import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { AuthUser } from "../../common/auth-types";
import { PRISMA } from "../../prisma/prisma.module";
import { ConversationsService } from "../inbox/conversations.service";
import { trackingTextOf } from "./logistics.mapper";

/**
 * ແຈ້ງເລກ tracking ຫາລູກຄ້າທາງແຊັດ: ເຄສທີ່ເປີດບິນ (conversationId) ກ່ອນ, ບໍ່ດັ່ງນັ້ນເຄສ FACEBOOK ຫຼ້າສຸດຂອງລູກຄ້າ.
 * ບໍ່ throw: ຜົນຖືກບັນທຶກໃນ Shipment (SENT / FAILED + code / MANUAL ເມື່ອບໍ່ມີແຊັດ).
 */
@Injectable()
export class ShipmentNotifierService {
  private readonly logger = new Logger(ShipmentNotifierService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ConversationsService) private readonly conversations: ConversationsService,
  ) {}

  async notify(orderId: string, actor: AuthUser): Promise<void> {
    try {
      const order = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { orderNumber: true, conversationId: true, customerId: true, shipment: { include: { courier: true } } },
      });
      const text = trackingTextOf(order);
      if (!text) return;
      const conversationId = order.conversationId ?? (await this.latestConversationOf(order.customerId));
      if (!conversationId) {
        await this.record(orderId, "MANUAL", null);
        return;
      }
      const message = await this.conversations.sendMessage(conversationId, { text }, actor);
      if (message.status === "SENT") await this.record(orderId, "SENT", null);
      else await this.record(orderId, "FAILED", message.errorCode ?? "SEND_REJECTED");
    } catch (error) {
      this.logger.error(`tracking notify failed for ${orderId}: ${error instanceof Error ? error.message : String(error)}`);
      await this.record(orderId, "FAILED", "SEND_REJECTED").catch(() => undefined);
    }
  }

  private async latestConversationOf(customerId: string | null): Promise<string | null> {
    if (!customerId) return null;
    const conversation = await this.prisma.conversation.findFirst({
      where: { customerId, channel: "FACEBOOK" },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    return conversation?.id ?? null;
  }

  private async record(orderId: string, status: "SENT" | "FAILED" | "MANUAL", errorCode: string | null): Promise<void> {
    await this.prisma.shipment.update({
      where: { orderId },
      data: { notifyStatus: status, notifyErrorCode: errorCode, notifiedAt: status === "SENT" ? new Date() : null },
    });
  }
}
