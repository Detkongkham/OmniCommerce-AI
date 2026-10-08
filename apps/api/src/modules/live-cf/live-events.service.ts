import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { LIVE_EVENTS_CHANNEL, type LiveEvent, isLiveEvent } from "@oca/shared";
import { RedisEventChannel } from "../../common/redis-events";
import { ENV, type Env } from "../../config/env";

/** event ຂອງ session Live/ໂພສ (Host screen ແລະ ໜ້າ /live/:id refetch ເມື່ອໄດ້ຮັບ). worker publish ຊ່ອງດຽວກັນ */
@Injectable()
export class LiveEventsService extends RedisEventChannel<LiveEvent> implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super(env, LIVE_EVENTS_CHANNEL, (value) => (isLiveEvent(value) ? { type: value.type, sessionId: value.sessionId } : null), LiveEventsService.name);
  }

  /** ແຈ້ງວ່າຂໍ້ມູນຂອງ session ປ່ຽນ (ບໍ່ throw) */
  sessionUpdated(sessionId: string): Promise<void> {
    return this.publish({ type: "live.updated", sessionId });
  }

  onModuleDestroy(): Promise<void> {
    return this.destroy();
  }
}
