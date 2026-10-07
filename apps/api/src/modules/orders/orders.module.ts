import { Module } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

/** ບິນ + ວົງຈອນສະຖານະ. Inbox/CF Engine ຈະ import module ນີ້ເພື່ອເອີ້ນ OrdersService. */
@Module({
  controllers: [OrdersController, CustomersController],
  providers: [OrdersService, CustomersService],
  exports: [OrdersService],
})
export class OrdersModule {}
