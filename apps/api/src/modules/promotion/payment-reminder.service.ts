import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { buildPaymentReminderMessage } from "@oca/shared";
import { ENV, type Env } from "../../config/env";
import { PRISMA } from "../../prisma/prisma.module";
import { ConversationsService } from "../inbox/conversations.service";

export interface ReminderRunResult {
  sent: number;
  failed: number;
}

/** ບິນທີ່ມາຈາກແຊັດ/CF ເທົ່ານັ້ນ (ມີຊ່ອງທາງ Messenger); ບິນເວັບ ແລະ ບິນໜ້າຮ້ານບໍ່ເຕືອນ */
const REMINDABLE_SOURCES = ["CHAT", "LIVE_CF", "POST_CF"] as const;
const BATCH = 50;

/**
 * ເຕືອນບິນ PENDING_PAYMENT ເທື່ອດຽວ ເມື່ອເຫຼືອເວລາຈອງບໍ່ເກີນ `StoreSetting.paymentReminderMinutes`.
 * ແລ່ນທຸກ `PAYMENT_REMINDER_TICK_MS`. ຫຼາຍ instance ປອດໄພ: ແຕ່ລະບິນຖືກ claim (NONE → SENT) ດ້ວຍ updateMany
 * ທີ່ມີເງື່ອນໄຂ ກ່ອນສົ່ງ. ບໍ່ລອງຊ້ຳ: ສົ່ງບໍ່ໄດ້ (ເຊັ່ນ ນອກ 24 ຊມ ຂອງ Messenger) → FAILED.
 */
@Injectable()
export class PaymentReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentReminderService.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<ReminderRunResult> | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ConversationsService) private readonly conversations: ConversationsService,
  ) {}

  onModuleInit(): void {
    if (this.env.PAYMENT_REMINDER_TICK_MS <= 0) return;
    this.timer = setInterval(() => {
      this.runDue().catch((error: unknown) => this.logger.error(`payment reminder run failed: ${(error as Error).message}`));
    }, this.env.PAYMENT_REMINDER_TICK_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  /** ໃນ process ດຽວແລ່ນເທື່ອລະຮອບ (ຮອບທີ່ຊ້ອນຄືນຜົນຂອງຮອບທີ່ກຳລັງແລ່ນ) */
  runDue(now: Date = new Date()): Promise<ReminderRunResult> {
    this.running ??= this.process(now).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async process(now: Date): Promise<ReminderRunResult> {
    const result: ReminderRunResult = { sent: 0, failed: 0 };
    const settings = await this.prisma.storeSetting.findUnique({
      where: { id: 1 },
      select: { paymentReminderMinutes: true, paymentInstructions: true },
    });
    if (!settings?.paymentReminderMinutes) return result;

    const due = await this.prisma.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        paymentReminderStatus: "NONE",
        source: { in: [...REMINDABLE_SOURCES] },
        reservedUntil: { gt: now, lte: new Date(now.getTime() + settings.paymentReminderMinutes * 60_000) },
      },
      select: { id: true, orderNumber: true, total: true, currency: true, reservedUntil: true, conversationId: true, customerId: true },
      orderBy: [{ reservedUntil: "asc" }, { id: "asc" }],
      take: BATCH,
    });

    for (const order of due) {
      // claim ກ່ອນສົ່ງ: ຖ້າ process ຕາຍຫຼັງ claim ບິນຈະຄ້າງ SENT ໂດຍບໍ່ໄດ້ສົ່ງ (ດີກວ່າສົ່ງຊ້ຳ)
      const claimed = await this.prisma.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT", paymentReminderStatus: "NONE" },
        data: { paymentReminderStatus: "SENT", paymentReminderAt: now },
      });
      if (claimed.count === 0) continue;

      const ok = await this.send(order, settings.paymentInstructions, now);
      if (ok) result.sent += 1;
      else {
        result.failed += 1;
        await this.prisma.order.update({ where: { id: order.id }, data: { paymentReminderStatus: "FAILED" } });
      }
    }
    return result;
  }

  private async send(
    order: { id: string; orderNumber: string; total: { toFixed(places: number): string }; currency: string; reservedUntil: Date | null; conversationId: string | null; customerId: string | null },
    paymentInstructions: string | null,
    now: Date,
  ): Promise<boolean> {
    try {
      const conversationId = order.conversationId ?? (await this.latestConversationOf(order.customerId));
      if (!conversationId) return false;
      const minutesLeft = order.reservedUntil ? Math.ceil((order.reservedUntil.getTime() - now.getTime()) / 60_000) : 0;
      const text = buildPaymentReminderMessage({
        orderNumber: order.orderNumber,
        total: order.total.toFixed(2),
        currency: order.currency,
        minutesLeft,
        paymentInstructions,
      });
      // actor null = ຂໍ້ຄວາມຂອງລະບົບ (ປາກົດໃນ Inbox ຄືກັບຂໍ້ຄວາມຂາອອກອື່ນ)
      const message = await this.conversations.sendMessage(conversationId, { text }, null);
      return message.status === "SENT";
    } catch (error) {
      this.logger.error(`payment reminder failed for ${order.id}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /** ບິນ CF ບໍ່ມີ conversationId: ໃຊ້ເຄສ Messenger ຫຼ້າສຸດຂອງລູກຄ້າ (ແບບດຽວກັບການແຈ້ງ tracking) */
  private async latestConversationOf(customerId: string | null): Promise<string | null> {
    if (!customerId) return null;
    const conversation = await this.prisma.conversation.findFirst({
      where: { customerId, channel: "FACEBOOK" },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    return conversation?.id ?? null;
  }
}
