import { Module } from "@nestjs/common";
import { CfIngestService } from "./cf-ingest.service";
import { LiveSessionsController } from "./live-sessions.controller";
import { LiveSessionsService } from "./live-sessions.service";

/** Live & Post CF Engine: session/ລະຫັດ CF, ledger ຄອມເມັ້ນ, queue ປະມວນຜົນ. */
@Module({
  controllers: [LiveSessionsController],
  providers: [CfIngestService, LiveSessionsService],
  exports: [CfIngestService],
})
export class LiveCfModule {}
