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
  ): Promise<{ received: number; failed?: number }> {
    const adapter = this.channels.facebook;
    if (!adapter.canReceive) throw apiError("CHANNEL_NOT_CONFIGURED", "Facebook webhook is not configured");
    if (!req.rawBody || !adapter.verifySignature(req.rawBody, signature)) throw new UnauthorizedException();

    const events = adapter.parseWebhook(body);
    const enrich = new Set<string>();
    let failed = 0;
    for (const event of events) {
      try {
        const result = await this.ingest.ingest(event);
        if (!result.duplicate && event.kind === "message") enrich.add(result.conversationId);
      } catch (error) {
        // ຂໍ້ຜິດພາດຊົ່ວຄາວ (DB/ເຄືອຂ່າຍ) → 500 ໃຫ້ Meta ສົ່ງຊ້ຳ; ຂໍ້ມູນເສຍ (ລອງໃໝ່ກໍບໍ່ຜ່ານ) → ຂ້າມ ບໍ່ໃຫ້ກີດ event ອື່ນ
        if (classifyIngestError(error) === "transient") throw error;
        failed += 1;
        // ບັນທຶກສະເພາະ mid + ຊື່ error (ບໍ່ເອົາ payload/ຄວາມລັບລົງ log)
        this.logger.error(`skipping unprocessable event mid=${event.externalId} (${errorName(error)})`);
      }
    }
    // ບໍ່ລໍຖ້າ: Meta ຕ້ອງໄດ້ 200 ໄວ; 1 ເຄສ enrich ຄັ້ງດຽວຕໍ່ batch
    for (const conversationId of enrich) this.ingest.enrichInBackground(conversationId);
    return failed > 0 ? { received: events.length - failed, failed } : { received: events.length };
  }
}
