import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

// ໂມດູນ 10: ລາຍງານຍອດຂາຍ, P&L ຂັ້ນຕົ້ນ, ຊ່ອງທາງ, ສິນຄ້າຂາຍດີ/ຄ້າງສະຕ໋ອກ, ສົ່ງອອກ CSV
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
