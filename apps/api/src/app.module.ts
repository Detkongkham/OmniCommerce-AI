import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { AppConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { FEATURE_MODULES } from "./modules";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    HealthModule,
    ...Object.values(FEATURE_MODULES),
  ],
})
export class AppModule {}
