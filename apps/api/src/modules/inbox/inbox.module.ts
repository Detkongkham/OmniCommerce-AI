import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { FacebookWebhookController } from "./facebook-webhook.controller";
import { InboxAssigneesController } from "./inbox-assignees.controller";
import { InboxEventsController } from "./inbox-events.controller";
import { InboxEventsService } from "./inbox-events.service";
import { InboxIngestService } from "./inbox-ingest.service";

/** Omnichannel Inbox: ຮັບ webhook, ເກັບເຄສ/ຂໍ້ຄວາມ, ຕອບ, realtime. */
@Module({
  imports: [ChannelsModule],
  controllers: [FacebookWebhookController, ConversationsController, InboxAssigneesController, InboxEventsController],
  providers: [InboxEventsService, InboxIngestService, ConversationsService],
  exports: [InboxEventsService],
})
export class InboxModule {}
