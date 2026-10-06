import { Module } from "@nestjs/common";
import { ChannelRegistry } from "./channel-registry";
import { FacebookWebhookController } from "./facebook-webhook.controller";
import { InboxEventsService } from "./inbox-events.service";
import { InboxIngestService } from "./inbox-ingest.service";

/** Omnichannel Inbox: ຮັບ webhook, ເກັບເຄສ/ຂໍ້ຄວາມ, ຕອບ, realtime. */
@Module({
  controllers: [FacebookWebhookController],
  providers: [ChannelRegistry, InboxEventsService, InboxIngestService],
  exports: [InboxEventsService],
})
export class InboxModule {}
