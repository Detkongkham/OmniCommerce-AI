import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { OrdersModule } from "../orders/orders.module";
import { CfCommentsController } from "./cf-comments.controller";
import { CfCommentsService } from "./cf-comments.service";
import { CfIngestService } from "./cf-ingest.service";
import { CfProcessorService } from "./cf-processor.service";
import { CfQueueService } from "./cf-queue.service";
import { CfReplyService } from "./cf-reply.service";
import { LiveSessionsController } from "./live-sessions.controller";
import { LiveSessionsService } from "./live-sessions.service";

/** Live & Post CF Engine: session/ລະຫັດ CF, ledger ຄອມເມັ້ນ, queue ປະມວນຜົນ. */
@Module({
  imports: [ChannelsModule, OrdersModule],
  controllers: [LiveSessionsController, CfCommentsController],
  providers: [CfCommentsService, CfIngestService, CfProcessorService, CfQueueService, CfReplyService, LiveSessionsService],
  exports: [CfIngestService, CfReplyService],
})
export class LiveCfModule {}
