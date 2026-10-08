import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { InboxEvent } from "@oca/shared";
import { RedisEventChannel } from "../../common/redis-events";
import { ENV, type Env } from "../../config/env";

export const INBOX_EVENTS_CHANNEL = "oca:inbox:events";

function parseEvent(value: unknown): InboxEvent | null {
  if (
    typeof value === "object" &&
    value !== null &&
    (value as InboxEvent).type === "conversation.updated" &&
    typeof (value as InboxEvent).conversationId === "string"
  ) {
    return { type: "conversation.updated", conversationId: (value as InboxEvent).conversationId };
  }
  return null;
}

/** event ຂອງ inbox ຜ່ານ Redis pub/sub (ເບິ່ງ RedisEventChannel) */
@Injectable()
export class InboxEventsService extends RedisEventChannel<InboxEvent> implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super(env, INBOX_EVENTS_CHANNEL, parseEvent, InboxEventsService.name);
  }

  onModuleDestroy(): Promise<void> {
    return this.destroy();
  }
}
