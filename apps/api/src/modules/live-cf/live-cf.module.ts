import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { CfIngestService } from "./cf-ingest.service";
import { CfReplyService } from "./cf-reply.service";
import { LiveSessionsController } from "./live-sessions.controller";
import { LiveSessionsService } from "./live-sessions.service";

/** Live & Post CF Engine: session/ລະຫັດ CF, ledger ຄອມເມັ້ນ, queue ປະມວນຜົນ. */
@Module({
  imports: [ChannelsModule],
  controllers: [LiveSessionsController],
  providers: [CfIngestService, CfReplyService, LiveSessionsService],
  exports: [CfIngestService],
})
export class LiveCfModule {}
