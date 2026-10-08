import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Prisma, type PrismaClient, evaluateSlip } from "@oca/database";
import { type StorageService, StorageNotFoundError, newStorageKey } from "@oca/ai-engine";
import { type LinkChatSlipInput, type PatchSlipInput, type RejectSlipInput, SLIP_MAX_BYTES } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { apiError } from "../../common/api-error";
import { isUniqueViolation } from "../../common/prisma-errors";
import { ENV, type Env } from "../../config/env";
import { PRISMA } from "../../prisma/prisma.module";
import { SLIP_FETCH, SLIP_QUEUE, SLIP_STORAGE, type SlipQueue } from "./slip.providers";
import { SlipImageError, detectImageMime, fetchImageBytes, sha256Hex } from "./slip-image";
import { type SlipDto, type SlipRow, slipInclude, toSlipDto } from "./slips.mapper";

/** ສະຖານະທີ່ຍັງແກ້/retry/ປະຕິເສດໄດ້ (CONFIRMED/REJECTED ຖືວ່າປິດແລ້ວ) */
const OPEN_STATUSES = ["PENDING_READ", "READ", "READ_FAILED"] as const;

export interface UploadedImage {
  buffer: Buffer;
}

interface CreateSlipInput {
  bytes: Uint8Array;
  mime: string;
  source: "CHAT" | "UPLOAD";
  orderId: string;
  conversationId?: string;
  messageId?: string;
  attachmentIndex?: number;
  actor: AuthUser;
  ip: string | undefined;
}

@Injectable()
export class SlipsService {
  private readonly logger = new Logger(SlipsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    @Inject(SLIP_STORAGE) private readonly storage: StorageService,
    @Inject(SLIP_QUEUE) private readonly queue: SlipQueue,
    @Inject(SLIP_FETCH) private readonly fetchImpl: typeof fetch,
  ) {}

  async upload(orderId: string, file: UploadedImage | undefined, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    await this.requireOrder(orderId);
    const { bytes, mime } = this.validateImage(file?.buffer);
    return this.createSlip({ bytes, mime, source: "UPLOAD", orderId, actor, ip });
  }

  async listForOrder(orderId: string): Promise<SlipDto[]> {
    await this.requireOrder(orderId);
    const rows = await this.prisma.paymentSlip.findMany({
      where: { orderId },
      include: slipInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toSlipDto);
  }

  /** ຜູກຮູບ attachment ໃນແຊັດກັບບິນຂອງເຄສນັ້ນ: ດາວໂຫຼດຮູບຕອນນີ້ (ລິ້ງ Meta ໝົດອາຍຸ) */
  async linkFromChat(
    conversationId: string,
    messageId: string,
    input: LinkChatSlipInput,
    actor: AuthUser,
    ip: string | undefined,
  ): Promise<SlipDto> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, attachments: true },
    });
    if (!message) throw apiError("CONVERSATION_NOT_FOUND", "Message not found in this conversation");
    // ບິນຕ້ອງເປັນຂອງເຄສນີ້ (id ອ້າງອີງບໍ່ກົງ = 404 ຕາມກົດຂອງໂປຣເຈັກ)
    const order = await this.prisma.order.findFirst({ where: { id: input.orderId, conversationId }, select: { id: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found for this conversation");

    const attachments = Array.isArray(message.attachments) ? (message.attachments as { type?: unknown; url?: unknown }[]) : [];
    const attachment = attachments[input.attachmentIndex];
    if (!attachment || attachment.type !== "image" || typeof attachment.url !== "string" || attachment.url === "") {
      throw apiError("SLIP_FILE_INVALID", "The attachment is not a downloadable image");
    }

    const existing = await this.prisma.paymentSlip.findUnique({
      where: { messageId_attachmentIndex: { messageId, attachmentIndex: input.attachmentIndex } },
      select: { id: true },
    });
    if (existing) throw apiError("DUPLICATE_VALUE", "This image is already linked as a slip");

    let bytes: Uint8Array;
    try {
      // URL ມາຈາກ JSON ທີ່ເກັບໄວ້: production ຕ້ອງ https ແລະ ຫ້າມ host ພາຍໃນ (SSRF guard ຢູ່ໃນ fetchImageBytes)
      bytes = await fetchImageBytes(attachment.url, {
        fetchImpl: this.fetchImpl,
        allowHttp: this.env.NODE_ENV !== "production",
        maxBytes: SLIP_MAX_BYTES,
        timeoutMs: 10_000,
      });
    } catch (error) {
      if (error instanceof SlipImageError) throw apiError("SLIP_FILE_INVALID", error.message);
      throw error;
    }
    const { mime } = this.validateImage(bytes);
    try {
      return await this.createSlip({
        bytes,
        mime,
        source: "CHAT",
        orderId: input.orderId,
        conversationId,
        messageId,
        attachmentIndex: input.attachmentIndex,
        actor,
        ip,
      });
    } catch (error) {
      // ແຂ່ງກັນຜູກພ້ອມກັນ: unique (messageId, attachmentIndex) ເປັນດ່ານສຸດທ້າຍ (createSlip ລຶບໄຟລ໌ໃຫ້ແລ້ວ)
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "This image is already linked as a slip");
      throw error;
    }
  }

  async listForConversation(conversationId: string): Promise<SlipDto[]> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
    if (!conversation) throw apiError("CONVERSATION_NOT_FOUND", "Conversation not found");
    const rows = await this.prisma.paymentSlip.findMany({
      where: { conversationId },
      include: slipInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toSlipDto);
  }

  async get(id: string): Promise<SlipDto> {
    return toSlipDto(await this.requireRow(id));
  }

  async readImage(id: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const row = await this.prisma.paymentSlip.findUnique({ where: { id }, select: { imageKey: true, imageMime: true } });
    if (!row) throw apiError("SLIP_NOT_FOUND", "Slip not found");
    try {
      const stored = await this.storage.get(row.imageKey);
      return { bytes: stored.bytes, mime: row.imageMime };
    } catch (error) {
      if (error instanceof StorageNotFoundError) throw apiError("SLIP_NOT_FOUND", "Slip image not found");
      throw error;
    }
  }

  /**
   * ແກ້ຄ່າທີ່ແອດມິນຢືນຢັນ ແລະ/ຫຼື ຜູກ/ຍ້າຍບິນ; ຄິດ flag ໃໝ່ສະເໝີ.
   * ຍ້າຍໄປບິນຂອງເຄສອື່ນໄດ້ (ແອດມິນຕັດສິນ) ຂໍພຽງບິນມີຢູ່ຈິງ.
   */
  async patch(id: string, input: PatchSlipInput, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    await this.requireRow(id);
    if (input.orderId) await this.requireOrder(input.orderId);
    // conditional update: ຖ້າຖືກ confirm/reject ລະຫວ່າງ requireRow ກັບບ່ອນນີ້ → count = 0 → 409
    const { count } = await this.prisma.paymentSlip.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: {
        orderId: input.orderId,
        confirmedAmount: input.confirmedAmount,
        confirmedCurrency: input.confirmedCurrency,
        confirmedPaidAt: input.confirmedPaidAt,
        confirmedRefNo: input.confirmedRefNo,
        confirmedDestAccount: input.confirmedDestAccount,
      },
    });
    if (count === 0) throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    await evaluateSlip(this.prisma, id);
    await this.audit.record({
      userId: actor.id,
      action: "slip.update",
      entity: "PaymentSlip",
      entityId: id,
      // round-trip ເພື່ອໃຫ້ Date ກາຍເປັນ string ແລະ JSON-safe
      after: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
      ip,
    });
    return toSlipDto(await this.requireRow(id));
  }

  /** ອ່ານໃໝ່: ຕັ້ງ PENDING_READ ແລ້ວ enqueue. ຖ້າ enqueue ລົ້ມ ສະຖານະ PENDING_READ ຍັງຄົງ ແລະ ຕອບ 500 (ກົດໃໝ່ໄດ້) */
  async retry(id: string, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    const { count } = await this.prisma.paymentSlip.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: { status: "PENDING_READ" },
    });
    if (count === 0) {
      await this.requireRow(id);
      throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    }
    // ບໍ່ກືນ error ຄືຕອນສ້າງ: retry ມີໄວ້ເພື່ອ enqueue ຈຶ່ງຕ້ອງໃຫ້ແອດມິນເຫັນເມື່ອລົ້ມ
    await this.queue.enqueueRead(id);
    await this.audit.record({ userId: actor.id, action: "slip.retry", entity: "PaymentSlip", entityId: id, ip });
    return toSlipDto(await this.requireRow(id));
  }

  /** ປະຕິເສດສະລິບ: ບໍ່ແຕະບິນ */
  async reject(id: string, input: RejectSlipInput, actor: AuthUser, ip: string | undefined): Promise<SlipDto> {
    const { count } = await this.prisma.paymentSlip.updateMany({
      where: { id, status: { in: [...OPEN_STATUSES] } },
      data: { status: "REJECTED", rejectReason: input.reason, reviewedByUserId: actor.id, reviewedAt: new Date() },
    });
    if (count === 0) {
      await this.requireRow(id);
      throw apiError("SLIP_ALREADY_REVIEWED", "The slip was already confirmed or rejected");
    }
    await this.audit.record({
      userId: actor.id,
      action: "slip.reject",
      entity: "PaymentSlip",
      entityId: id,
      after: { reason: input.reason },
      ip,
    });
    return toSlipDto(await this.requireRow(id));
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------
  private validateImage(buffer: Uint8Array | undefined): { bytes: Uint8Array; mime: string } {
    if (!buffer || buffer.length === 0) throw apiError("SLIP_FILE_INVALID", "An image file is required");
    if (buffer.length > SLIP_MAX_BYTES) throw apiError("SLIP_FILE_INVALID", "Image is too large");
    const mime = detectImageMime(buffer);
    if (!mime) throw apiError("SLIP_FILE_INVALID", "Image must be JPEG, PNG or WebP");
    return { bytes: buffer, mime };
  }

  private async requireOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
  }

  private async requireRow(id: string): Promise<SlipRow> {
    const row = await this.prisma.paymentSlip.findUnique({ where: { id }, include: slipInclude });
    if (!row) throw apiError("SLIP_NOT_FOUND", "Slip not found");
    return row;
  }

  /** ເກັບຮູບ → ສ້າງແຖວ → audit → enqueue (enqueue ລົ້ມ = ຍັງຖືວ່າສຳເລັດ; ສະລິບຄ້າງ PENDING_READ ໃຫ້ retry) */
  private async createSlip(input: CreateSlipInput): Promise<SlipDto> {
    // ຖ້າ storage.put ສຳເລັດແຕ່ DB create ລົ້ມ: ລຶບໄຟລ໌ຄືນ (best effort) ເພື່ອບໍ່ໃຫ້ມີໄຟລ໌ກຳພ້າ.
    // ຖ້າ delete ກໍ່ລົ້ມ (ເຊັ່ນ process ຕາຍກາງທາງ) ຍັງອາດເຫຼືອ orphan ໜ້ອຍໜຶ່ງ — ຍອມຮັບໄດ້ (ບໍ່ມີແຖວອ້າງ, ບໍ່ເປີດເຜີຍ)
    const key = newStorageKey("slips");
    await this.storage.put(key, input.bytes, input.mime);
    let row: SlipRow;
    try {
      row = await this.prisma.paymentSlip.create({
      data: {
        source: input.source,
        orderId: input.orderId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        attachmentIndex: input.attachmentIndex,
        imageKey: key,
        imageMime: input.mime,
        imageBytes: input.bytes.length,
        imageSha256: sha256Hex(input.bytes),
      },
      include: slipInclude,
    });
    } catch (error) {
      await this.storage.delete(key).catch((deleteError: unknown) => {
        this.logger.warn(`Failed to delete orphan slip image ${key}: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
      });
      throw error;
    }
    await this.audit.record({
      userId: input.actor.id,
      action: "slip.create",
      entity: "PaymentSlip",
      entityId: row.id,
      after: { orderId: input.orderId, source: input.source },
      ip: input.ip,
    });
    try {
      await this.queue.enqueueRead(row.id);
    } catch (error) {
      this.logger.warn(`Failed to enqueue slip ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return toSlipDto(row);
  }
}
