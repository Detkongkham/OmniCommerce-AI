import { Controller, Get, Header, Inject, Query, Res } from "@nestjs/common";
import {
  type DeadstockQuery,
  type ReportRangeQuery,
  type TopProductsQuery,
  deadstockQuerySchema,
  hasPermission,
  reportRangeQuerySchema,
  topProductsQuerySchema,
} from "@oca/shared";
import type { Response } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AnalyticsService } from "./analytics.service";

/** ລາຍງານ (ອ່ານຢ່າງດຽວ). ຕົວເລກຕົ້ນທຶນ (cogs, grossProfit, grossMargin, stockValue) ຖືກຕັດໂດຍ CostRedactionInterceptor ເມື່ອບໍ່ມີ costs:read */
@Controller("analytics")
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @Get("summary")
  @RequirePermissions("analytics:read")
  summary(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery) {
    return this.analytics.summary(query);
  }

  @Get("daily")
  @RequirePermissions("analytics:read")
  daily(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery) {
    return this.analytics.daily(query);
  }

  @Get("channels")
  @RequirePermissions("analytics:read")
  channels(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery) {
    return this.analytics.channels(query);
  }

  @Get("top-products")
  @RequirePermissions("analytics:read")
  topProducts(@Query(new ZodValidationPipe(topProductsQuerySchema)) query: TopProductsQuery) {
    return this.analytics.topProducts(query);
  }

  @Get("deadstock")
  @RequirePermissions("analytics:read")
  deadstock(@Query(new ZodValidationPipe(deadstockQuerySchema)) query: DeadstockQuery) {
    return this.analytics.deadstock(query);
  }

  /** CSV ບໍ່ຜ່ານ interceptor (ບໍ່ແມ່ນ JSON) ຈຶ່ງກວດ costs:read ເອງ */
  @Get("export.csv")
  @RequirePermissions("analytics:read")
  @Header("Cache-Control", "no-store")
  async exportCsv(
    @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.analytics.exportCsv(query, hasPermission(user.permissions, "costs:read"));
    res
      .status(200)
      .type("text/csv; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="${file.filename}"`)
      .send(file.body);
  }
}
