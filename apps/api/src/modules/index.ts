import type { Type } from "@nestjs/common";
import type { PermissionModule } from "@oca/shared";
import { AffiliateModule } from "./affiliate/affiliate.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AutomationModule } from "./automation/automation.module";
import { CrmModule } from "./crm/crm.module";
import { ImageStudioModule } from "./image-studio/image-studio.module";
import { InboxModule } from "./inbox/inbox.module";
import { InventoryModule } from "./inventory/inventory.module";
import { LiveCfModule } from "./live-cf/live-cf.module";
import { LogisticsModule } from "./logistics/logistics.module";
import { PostingModule } from "./posting/posting.module";
import { PromotionModule } from "./promotion/promotion.module";
import { StaffModule } from "./staff/staff.module";

/** Key ຕ້ອງຕົງກັບ MODULES ຂອງ @oca/shared (compiler ບັງຄັບໃຫ້ຄົບ). */
export const FEATURE_MODULES: Record<PermissionModule, Type<unknown>> = {
  inbox: InboxModule,
  posting: PostingModule,
  "image-studio": ImageStudioModule,
  "live-cf": LiveCfModule,
  promotion: PromotionModule,
  affiliate: AffiliateModule,
  inventory: InventoryModule,
  logistics: LogisticsModule,
  automation: AutomationModule,
  analytics: AnalyticsModule,
  crm: CrmModule,
  staff: StaffModule,
};
