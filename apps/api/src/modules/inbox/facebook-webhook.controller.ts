import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  type RawBodyRequest,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { apiError } from "../../common/api-error";
import { Public } from "../../common/decorators";
import { CfIngestService } from "../live-cf/cf-ingest.service";
import { ChannelRegistry } from "./channel-registry";
import { InboxIngestService } from "./inbox-ingest.service";
import { classifyIngestError } from "./ingest-errors";

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

/** Endpoint ສາທາລະນະສຳລັບ Meta (ບໍ່ມີ JWT): ຄວາມປອດໄພຢູ່ທີ່ verify token ແລະ ລາຍເຊັນ X-Hub-Signature-256 */
@Controller("webhooks/facebook")
export class FacebookWebhookController {
  private readonly logger = new Logger(FacebookWebhookController.name);

  constructor(
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
    @Inject(InboxIngestService) private readonly ingest: InboxIngestService,
    @Inject(CfIngestService) private readonly cf: CfIngestService,
  ) {}

  @Public()
  @Get()
  handshake(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: unknown,
    @Res({ passthrough: true }) res: Response,
  ): string {
    const adapter = this.channels.facebook;
    if (!adapter.canReceive) throw apiError("CHANNEL_NOT_CONFIGURED", "Facebook webhook is not configured");
    if (!adapter.verifyHandshake(mode, token) || typeof challenge !== "string" || !CHALLENGE_PATTERN.test(challenge)) {
      throw apiError("FORBIDDEN", "Invalid verify token");
    }
    // ຕັ້ງ text/plain ສະເພາະຕອນສຳເລັດ: ຖ້າຕັ້ງທົ່ວໄປ error JSON ຈະຖືກສົ່ງເປັນ text/plain
    res.type("text/plain; charset=utf-8");
    return challenge;
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers("x-hub-signature-256") signature?: string,
  ): Promise<{ received: number; failed?: number; comments?: number }> {
    const adapter = this.channels.facebook;
    if (!adapter.canReceive) throw apiError("CHANNEL_NOT_CONFIGURED", "Facebook webhook is not configured");
    if (!req.rawBody || !adapter.verifySignature(req.rawBody, signature)) throw new UnauthorizedException();

    const events = adapter.parseWebhook(body);
    const stored = new Set<string>();
    const enrich = new Set<string>();
    let failed = 0;
    try {
      for (const event of events) {
        try {
          const result = await this.ingest.ingest(event);
          if (!result.duplicate) {
            stored.add(result.conversationId);
            if (event.kind === "message") enrich.add(result.conversationId);
          }
        } catch (error) {
          // ຂໍ້ຜິດພາດຊົ່ວຄາວ (DB/ເຄືອຂ່າຍ) → 500 ໃຫ້ Meta ສົ່ງຊ້ຳ; ຂໍ້ມູນເສຍ (ລອງໃໝ່ກໍບໍ່ຜ່ານ) → ຂ້າມ ບໍ່ໃຫ້ກີດ event ອື່ນ
          if (classifyIngestError(error) === "transient") throw error;
          failed += 1;
          // ບັນທຶກສະເພາະ mid + ຊື່ error (ບໍ່ເອົາ payload/ຄວາມລັບລົງ log)
          this.logger.error(`skipping unprocessable event mid=${event.externalId} (${errorName(error)})`);
        }
      }
    } finally {
      // ເຄສທີ່ບັນທຶກແລ້ວຕ້ອງໄດ້ enrich/ແຈ້ງ ເຖິງ batch ຈະ 500 ກາງທາງ (Meta ສົ່ງຊ້ຳ → duplicate ຈະບໍ່ແຈ້ງອີກ)
      // enrich ບໍ່ລໍຖ້າ: Meta ຕ້ອງໄດ້ 200 ໄວ; ແຈ້ງ SSE ຫຼັງ loop ເຄສລະ 1 ຄັ້ງແບບຂະໜານ
      for (const conversationId of enrich) this.ingest.enrichInBackground(conversationId);
      await this.ingest.notify(stored);
    }
    // ຄອມເມັ້ນ CF ເຂົ້າ queue ຫຼັງງານ inbox (DB ລ້ວນ ແລະ idempotent) ແລ້ວ: Redis ລົ້ມ = 500 ໃຫ້ Meta ສົ່ງຊ້ຳ
    // ໂດຍຂໍ້ຄວາມ inbox ບໍ່ເສຍ (jobId ກັນຄອມເມັ້ນຊ້ຳ); ບໍ່ປະມວນຜົນ CF ໃນ request
    const comments = adapter.parseComments(body);
    const queuedComments = comments.length > 0 ? await this.cf.enqueue(comments) : 0;
    const base = failed > 0 ? { received: events.length - failed, failed } : { received: events.length };
    return queuedComments > 0 ? { ...base, comments: queuedComments } : base;
  }
}
