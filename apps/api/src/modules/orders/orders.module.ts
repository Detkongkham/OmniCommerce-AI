import { Module } from "@nestjs/common";
import { LiveEventsModule } from "../live-cf/live-events.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

/** ບິນ + ວົງຈອນສະຖານະ. Inbox/CF Engine ຈະ import module ນີ້ເພື່ອເອີ້ນ OrdersService. */
@Module({
  imports: [LiveEventsModule],
  controllers: [OrdersController, CustomersController],
  providers: [OrdersService, CustomersService],
  exports: [OrdersService],
})
export class OrdersModule {}
