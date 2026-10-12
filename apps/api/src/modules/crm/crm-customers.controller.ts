import { Controller, Get, Inject, Query } from "@nestjs/common";
import { type CrmCustomerListQuery, crmCustomerListQuerySchema } from "@oca/shared";
import { RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CrmCustomersService } from "./crm-customers.service";

@Controller("crm/customers")
export class CrmCustomersController {
  constructor(@Inject(CrmCustomersService) private readonly customers: CrmCustomersService) {}

  @Get()
  @RequirePermissions("crm:read")
  list(@Query(new ZodValidationPipe(crmCustomerListQuerySchema)) query: CrmCustomerListQuery) {
    return this.customers.list(query);
  }

  // ຕ້ອງຢູ່ກ່ອນ route ":id" (Task 3)
  @Get("segments")
  @RequirePermissions("crm:read")
  segments() {
    return this.customers.segments();
  }
}
