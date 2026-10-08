import { Module } from "@nestjs/common";
import { CouriersController } from "./couriers.controller";
import { CouriersService } from "./couriers.service";

/** Smart Logistics Hub (8a): ບໍລິສັດຂົນສົ່ງ, ແພັກ/ກວດສະແກນ, ສົ່ງອອກ, ແຈ້ງ tracking */
@Module({
  controllers: [CouriersController],
  providers: [CouriersService],
})
export class LogisticsModule {}
