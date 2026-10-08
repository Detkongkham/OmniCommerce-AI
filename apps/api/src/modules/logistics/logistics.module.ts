import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { CouriersController } from "./couriers.controller";
import { CouriersService } from "./couriers.service";
import { FulfillmentController } from "./fulfillment.controller";
import { FulfillmentService } from "./fulfillment.service";

/** Smart Logistics Hub (8a): ບໍລິສັດຂົນສົ່ງ, ແພັກ/ກວດສະແກນ, ສົ່ງອອກ, ແຈ້ງ tracking */
@Module({
  imports: [OrdersModule],
  controllers: [CouriersController, FulfillmentController],
  providers: [CouriersService, FulfillmentService],
})
export class LogisticsModule {}
