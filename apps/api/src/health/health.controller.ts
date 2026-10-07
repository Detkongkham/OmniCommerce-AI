import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../common/decorators";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Public()
  @Get()
  async check() {
    const result = await this.health.check();
    const body = {
      status: result.db && result.redis ? "ok" : "degraded",
      db: result.db ? "up" : "down",
      redis: result.redis ? "up" : "down",
    };
    if (body.status !== "ok") throw new ServiceUnavailableException(body);
    return body;
  }
}
