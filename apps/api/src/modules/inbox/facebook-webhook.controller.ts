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

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

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
    @Query("hub.challenge") challenge: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): string {
    const adapter = this.channels.facebook;
    if (!adapter.canReceive) throw apiError("CHANNEL_NOT_CONFIGURED", "Facebook webhook is not configured");
    if (!adapter.verifyHandshake(mode, token) || !challenge || !CHALLENGE_PATTERN.test(challenge)) {
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
  ): Promise<{ received: number }> {
    const adapter = this.channels.facebook;
    if (!adapter.canReceive) throw apiError("CHANNEL_NOT_CONFIGURED", "Facebook webhook is not configured");
    if (!req.rawBody || !adapter.verifySignature(req.rawBody, signature)) throw new UnauthorizedException();

    const events = adapter.parseWebhook(body);
    for (const event of events) {
      const result = await this.ingest.ingest(event);
      if (!result.duplicate && event.kind === "message") {
        // ບໍ່ລໍຖ້າ: Meta ຕ້ອງໄດ້ 200 ໄວ
        void this.ingest.enrichProfile(result.conversationId).catch((error: unknown) => {
          this.logger.warn(`profile enrich failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
    return { received: events.length };
  }
}
