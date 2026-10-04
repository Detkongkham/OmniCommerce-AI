import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { AppConfigModule } from "./config/config.module";
import { StaffModule } from "./modules/staff/staff.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [AppConfigModule, PrismaModule, AuditModule, AuthModule, StaffModule],
})
export class AppModule {}
