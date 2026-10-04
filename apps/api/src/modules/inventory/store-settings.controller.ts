import { Body, Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import { type UpdateStoreSettingsInput, updateStoreSettingsSchema } from "@oca/shared";
import type { Request } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StoreSettingsService } from "./store-settings.service";

@Controller("settings/store")
export class StoreSettingsController {
  constructor(@Inject(StoreSettingsService) private readonly settings: StoreSettingsService) {}

  @Get()
  @RequirePermissions("inventory:read")
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermissions("inventory:write")
  update(
    @Body(new ZodValidationPipe(updateStoreSettingsSchema)) body: UpdateStoreSettingsInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.settings.update(body, actor, req.ip);
  }
}
