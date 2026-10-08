import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { type AuditLogQuery, type ReportRangeQuery, auditLogQuerySchema, reportRangeQuerySchema } from "@oca/shared";
import { RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuditLogsService } from "./audit-logs.service";
import { StaffKpiService } from "./staff-kpi.service";

@Controller("staff-kpi")
export class StaffKpiController {
  constructor(@Inject(StaffKpiService) private readonly kpi: StaffKpiService) {}

  @Get()
  @RequirePermissions("staff:read")
  summary(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery) {
    return this.kpi.summary(query);
  }

  @Get(":userId/daily")
  @RequirePermissions("staff:read")
  daily(@Param("userId") userId: string, @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery) {
    return this.kpi.daily(userId, query);
  }
}

@Controller("audit-logs")
export class AuditLogsController {
  constructor(@Inject(AuditLogsService) private readonly logs: AuditLogsService) {}

  @Get()
  @RequirePermissions("staff:read")
  list(@Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery) {
    return this.logs.list(query);
  }

  @Get("facets")
  @RequirePermissions("staff:read")
  facets() {
    return this.logs.facets();
  }
}
