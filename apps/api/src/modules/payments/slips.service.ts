import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { type StorageService, StorageNotFoundError, newStorageKey } from "@oca/ai-engine";
import { SLIP_MAX_BYTES } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../common/auth-types";
import { apiError } from "../../common/api-error";
import { ENV, type Env } from "../../config/env";
import { PRISMA } from "../../prisma/prisma.module";
import { SLIP_QUEUE, SLIP_STORAGE, type SlipQueue } from "./slip.providers";
import { detectImageMime, sha256Hex } from "./slip-image";
import { type SlipDto, type SlipRow, slipInclude, toSlipDto } from "./slips.mapper";

export interface UploadedImage {
  buffer: Buffer;
  size: number;
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

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------
  protected validateImage(buffer: Uint8Array | undefined): { bytes: Uint8Array; mime: string } {
    if (!buffer || buffer.length === 0) throw apiError("SLIP_FILE_INVALID", "An image file is required");
    if (buffer.length > SLIP_MAX_BYTES) throw apiError("SLIP_FILE_INVALID", "Image is too large");
    const mime = detectImageMime(buffer);
    if (!mime) throw apiError("SLIP_FILE_INVALID", "Image must be JPEG, PNG or WebP");
    return { bytes: buffer, mime };
  }

  protected async requireOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
  }

  protected async requireRow(id: string): Promise<SlipRow> {
    const row = await this.prisma.paymentSlip.findUnique({ where: { id }, include: slipInclude });
    if (!row) throw apiError("SLIP_NOT_FOUND", "Slip not found");
    return row;
  }

  /** ເກັບຮູບ → ສ້າງແຖວ → audit → enqueue (enqueue ລົ້ມ = ຍັງຖືວ່າສຳເລັດ; ສະລິບຄ້າງ PENDING_READ ໃຫ້ retry) */
  protected async createSlip(input: CreateSlipInput): Promise<SlipDto> {
    // ໝາຍເຫດ: ຖ້າ storage.put ສຳເລັດແຕ່ DB create ລົ້ມ ຈະເຫຼືອໄຟລ໌ກຳພ້າ (orphan) ໃນ storage —
    // ຍອມຮັບໄດ້ (ຂະໜາດນ້ອຍ, ບໍ່ມີແຖວອ້າງ, ບໍ່ເປີດເຜີຍ); ສາມາດກວາດລ້າງດ້ວຍວຽກແຍກພາຍຫຼັງ
    const key = newStorageKey("slips");
    await this.storage.put(key, input.bytes, input.mime);
    const row = await this.prisma.paymentSlip.create({
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
