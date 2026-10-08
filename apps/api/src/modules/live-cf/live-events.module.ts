import { Module } from "@nestjs/common";
import { LiveEventsService } from "./live-events.service";

/** ແຍກອອກມາເພື່ອໃຫ້ OrdersModule ແລະ LiveCfModule ໃຊ້ຮ່ວມກັນໂດຍບໍ່ import ວົນ */
@Module({
  providers: [LiveEventsService],
  exports: [LiveEventsService],
})
export class LiveEventsModule {}
