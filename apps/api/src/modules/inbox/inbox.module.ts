import { Module } from "@nestjs/common";
import { ChannelRegistry } from "./channel-registry";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { FacebookWebhookController } from "./facebook-webhook.controller";
import { InboxEventsService } from "./inbox-events.service";
import { InboxIngestService } from "./inbox-ingest.service";

/** Omnichannel Inbox: ຮັບ webhook, ເກັບເຄສ/ຂໍ້ຄວາມ, ຕອບ, realtime. */
@Module({
  controllers: [FacebookWebhookController, ConversationsController],
  providers: [ChannelRegistry, InboxEventsService, InboxIngestService, ConversationsService],
  exports: [InboxEventsService],
})
export class InboxModule {}
