import type { MessageEvent } from "@nestjs/common";
import type { InboxEvent } from "@oca/shared";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../config/env";
import { HEARTBEAT_MS, InboxEventsController } from "./inbox-events.controller";
import type { InboxEventsService } from "./inbox-events.service";

describe("InboxEventsController.stream", () => {
  const updates$ = new Subject<InboxEvent>();
  const closed$ = new Subject<void>();
  const received: MessageEvent[] = [];
  let subscription: { unsubscribe(): void } | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    received.length = 0;
  });
  afterEach(() => {
    subscription?.unsubscribe();
    vi.useRealTimers();
  });

  function start(ttlSeconds = 900) {
    const events = { ensureSubscribed: () => Promise.resolve(), updates$, closed$ } as unknown as InboxEventsService;
    const controller = new InboxEventsController(events, { ACCESS_TOKEN_TTL_SECONDS: ttlSeconds } as Env);
    subscription = controller.stream().subscribe((event) => received.push(event));
  }

  it("ready ມາກ່ອນ, ping ທຸກ HEARTBEAT_MS ແລະ map event ເປັນ conversation.updated", async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual([{ type: "ready", data: {} }]);

    updates$.next({ type: "conversation.updated", conversationId: "c1" });
    expect(received[1]).toEqual({
      type: "conversation.updated",
      data: { type: "conversation.updated", conversationId: "c1" },
    });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(received.at(-1)).toEqual({ type: "ping", data: {} });
  });

  it("ຢຸດ ping ແລະ updates ເມື່ອ closed$ ປ່ອຍສັນຍານ", async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    closed$.next();
    const count = received.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    updates$.next({ type: "conversation.updated", conversationId: "c2" });
    expect(received).toHaveLength(count);
  });
});
