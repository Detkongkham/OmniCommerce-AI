import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PermissionsController, RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  imports: [AuthModule],
  controllers: [StaffController, RolesController, PermissionsController],
  providers: [StaffService, RolesService],
})
export class StaffModule {}
