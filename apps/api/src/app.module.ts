import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CostRedactionInterceptor } from "./common/cost-redaction.interceptor";
import { HttpErrorsFilter } from "./common/http-errors.filter";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { StorageModule } from "./common/storage/storage.module";
import { AppConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { FEATURE_MODULES } from "./modules";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    StorageModule,
    AuditModule,
    AuthModule,
    HealthModule,
    ...Object.values(FEATURE_MODULES),
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpErrorsFilter },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: CostRedactionInterceptor },
  ],
})
export class AppModule {}
