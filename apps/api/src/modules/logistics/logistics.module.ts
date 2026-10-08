import { Module } from "@nestjs/common";
import { InboxModule } from "../inbox/inbox.module";
import { OrdersModule } from "../orders/orders.module";
import { CouriersController } from "./couriers.controller";
import { CouriersService } from "./couriers.service";
import { FulfillmentController } from "./fulfillment.controller";
import { FulfillmentService } from "./fulfillment.service";
import { ShipmentNotifierService } from "./shipment-notifier.service";

/** Smart Logistics Hub (8a): ບໍລິສັດຂົນສົ່ງ, ແພັກ/ກວດສະແກນ, ສົ່ງອອກ, ແຈ້ງ tracking */
@Module({
  imports: [InboxModule, OrdersModule],
  controllers: [CouriersController, FulfillmentController],
  providers: [CouriersService, FulfillmentService, ShipmentNotifierService],
})
export class LogisticsModule {}
