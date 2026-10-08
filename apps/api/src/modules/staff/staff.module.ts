import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AuditLogsService } from "./audit-logs.service";
import { PermissionsController, RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { AuditLogsController, StaffKpiController } from "./staff-kpi.controller";
import { StaffKpiService } from "./staff-kpi.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  imports: [AuthModule],
  controllers: [StaffController, RolesController, PermissionsController, StaffKpiController, AuditLogsController],
  providers: [StaffService, RolesService, StaffKpiService, AuditLogsService],
})
export class StaffModule {}
