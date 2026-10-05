import { Controller, Get, Inject, Query } from "@nestjs/common";
import { type CustomerListQuery, customerListQuerySchema } from "@oca/shared";
import { RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customers: CustomersService) {}

  /** orders:read ພໍ: ບິນທີ່ອ່ານໄດ້ກໍເຫັນຊື່/ໂທລະສັບລູກຄ້າຢູ່ແລ້ວ */
  @Get()
  @RequirePermissions("orders:read")
  list(@Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery) {
    return this.customers.list(query);
  }
}
