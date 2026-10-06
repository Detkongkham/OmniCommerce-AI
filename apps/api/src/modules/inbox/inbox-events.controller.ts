import { Controller, Inject, type MessageEvent, Sse } from "@nestjs/common";
import { type Observable, defer, interval, map, merge, startWith, switchMap } from "rxjs";
import { RequirePermissions } from "../../common/decorators";
import { InboxEventsService } from "./inbox-events.service";

const HEARTBEAT_MS = 25_000;

/**
 * SSE: event ເບົາ (`conversation.updated`) ໃຫ້ client refetch ເອງ.
 * `ready` ຖືກສົ່ງຫຼັງ subscribe Redis ສຳເລັດ (client ຮູ້ວ່າຈະບໍ່ພາດ event ຕັ້ງແຕ່ຈຸດນີ້),
 * `ping` ທຸກ 25 ວິ ກັນ proxy ຕັດ connection ທີ່ວ່າງ.
 */
@Controller("inbox")
export class InboxEventsController {
  constructor(@Inject(InboxEventsService) private readonly events: InboxEventsService) {}

  @Sse("events")
  @RequirePermissions("inbox:read")
  stream(): Observable<MessageEvent> {
    return defer(() => this.events.ensureSubscribed()).pipe(
      switchMap(() =>
        merge(
          this.events.updates$.pipe(map((event): MessageEvent => ({ type: event.type, data: event }))),
          interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: "ping", data: {} }))),
        ).pipe(startWith<MessageEvent>({ type: "ready", data: {} })),
      ),
    );
  }
}
