import { type EventStreamOptions, runEventStream } from "./event-stream";

export { HEALTHY_MS, type StreamStatus, defaultSleep } from "./event-stream";

export type InboxStreamOptions = Omit<EventStreamOptions, "events">;

/** SSE ຂອງ inbox (`/inbox/events`): ນັບສະເພາະ `conversation.updated` ວ່າມີການປ່ຽນ */
export function runInboxStream(options: InboxStreamOptions): Promise<void> {
  return runEventStream({ ...options, events: ["conversation.updated"] });
}
