import {
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type MessageEvent,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { type Observable, interval, map, merge, startWith, takeUntil, timer } from "rxjs";
import { RequirePermissions } from "../../common/decorators";
import { ENV, type Env } from "../../config/env";
import { InboxEventsService } from "./inbox-events.service";

export const HEARTBEAT_MS = 25_000;

/**
 * subscribe Redis ກ່ອນເປີດ stream. ຕ້ອງເຮັດໃນ guard: error ຈາກ handler/interceptor ຂອງ @Sse ຖືກສົ່ງເປັນ
 * event ຫຼັງ header 200 ຖືກສົ່ງແລ້ວ ແຕ່ guard ລົ້ມກ່ອນເລີ່ມ stream ຈຶ່ງໄດ້ response error ປົກກະຕິ.
 * (guard ກວດ login/ສິດ ຂອງລະບົບຮັນກ່ອນ ຈຶ່ງບໍ່ມີ request ທີ່ບໍ່ມີສິດມາກະຕຸ້ນ subscribe)
 * ຖ້າ Redis ໃຊ້ບໍ່ໄດ້ ຈະໄດ້ 503 ທີ່ຊັດເຈນ ແທນທີ່ຈະເປີດ stream ເປົ່າທີ່ບໍ່ມີວັນໄດ້ event.
 */
@Injectable()
export class InboxEventsReadyGuard implements CanActivate {
  constructor(@Inject(InboxEventsService) private readonly events: InboxEventsService) {}

  async canActivate(): Promise<boolean> {
    try {
      await this.events.ensureSubscribed();
    } catch {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: "Service Unavailable",
          code: "INTERNAL_ERROR",
          message: "Realtime events are unavailable",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return true;
  }
}

/**
 * SSE: event ເບົາ (`conversation.updated`) ໃຫ້ client refetch ເອງ.
 * `ready` ຖືກສົ່ງຫຼັງ subscribe Redis ສຳເລັດ (client ຮູ້ວ່າຈະບໍ່ພາດ event ຕັ້ງແຕ່ຈຸດນີ້),
 * `ping` ທຸກ 25 ວິ ກັນ proxy ຕັດ connection ທີ່ວ່າງ.
 *
 * ສັນຍາກັບ client: event ມີ `ready`, `conversation.updated`, `ping`.
 * stream ຈົບ/error ເມື່ອໃດ (app ປິດ, access token ຄົບອາຍຸ, ເຄືອຂ່າຍຫຼຸດ) => refresh token ແລ້ວ reconnect
 * ແບບ backoff, ແລະ poll ເປັນ fallback ໃນລະຫວ່າງທີ່ຍັງບໍ່ເຊື່ອມ.
 * stream ຖືກຕັດຫຼັງ `ACCESS_TOKEN_TTL_SECONDS` ເພື່ອໃຫ້ user ທີ່ຖືກຖອນສິດ/token ໝົດອາຍຸ ຖືກກວດສິດໃໝ່ທຸກຮອບ.
 */
@Controller("inbox")
export class InboxEventsController {
  constructor(
    @Inject(InboxEventsService) private readonly events: InboxEventsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Sse("events")
  @UseGuards(InboxEventsReadyGuard)
  @RequirePermissions("inbox:read")
  stream(): Observable<MessageEvent> {
    return merge(
      this.events.updates$.pipe(map((event): MessageEvent => ({ type: event.type, data: event }))),
      interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: "ping", data: {} }))),
    ).pipe(
      startWith<MessageEvent>({ type: "ready", data: {} }),
      takeUntil(merge(this.events.closed$, timer(this.env.ACCESS_TOKEN_TTL_SECONDS * 1000))),
    );
  }
}
