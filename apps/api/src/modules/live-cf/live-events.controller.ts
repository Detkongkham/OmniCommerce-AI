import {
  Controller,
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type MessageEvent,
  Param,
  Sse,
  UseGuards,
} from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type { Request } from "express";
import { type Observable, filter, interval, map, merge, startWith, takeUntil, timer } from "rxjs";
import { apiError } from "../../common/api-error";
import { RequirePermissions } from "../../common/decorators";
import { ENV, type Env } from "../../config/env";
import { PRISMA } from "../../prisma/prisma.module";
import { HEARTBEAT_MS } from "../inbox/inbox-events.controller";
import { LiveEventsService } from "./live-events.service";

/**
 * ກວດກ່ອນເປີດ stream (error ຫຼັງເປີດ SSE ຈະກາຍເປັນ event ບໍ່ແມ່ນ status): session ຕ້ອງມີ (404)
 * ແລະ subscribe Redis ໄດ້ (503). guard ກວດ login/ສິດ ຂອງລະບົບຮັນກ່ອນ.
 */
@Injectable()
export class LiveEventsReadyGuard implements CanActivate {
  constructor(
    @Inject(LiveEventsService) private readonly events: LiveEventsService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const param = context.switchToHttp().getRequest<Request>().params.id;
    const id = typeof param === "string" ? param : "";
    const session = await this.prisma.liveSession.findUnique({ where: { id }, select: { id: true } });
    if (!session) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
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
 * SSE ຂອງ session ດຽວ: `ready` (subscribe ແລ້ວ), `live.updated` (client refetch snapshot ເອງ), `ping` ທຸກ 25 ວິ.
 * ຕັດຫຼັງ `ACCESS_TOKEN_TTL_SECONDS` ໃຫ້ client refresh token ແລ້ວເຊື່ອມໃໝ່ (ກວດສິດໃໝ່ທຸກຮອບ) ຄື /inbox/events.
 */
@Controller("live-sessions")
export class LiveEventsController {
  constructor(
    @Inject(LiveEventsService) private readonly events: LiveEventsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Sse(":id/events")
  @UseGuards(LiveEventsReadyGuard)
  @RequirePermissions("live-cf:read")
  stream(@Param("id") id: string): Observable<MessageEvent> {
    return merge(
      this.events.updates$.pipe(
        filter((event) => event.sessionId === id),
        map((event): MessageEvent => ({ type: event.type, data: event })),
      ),
      interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: "ping", data: {} }))),
    ).pipe(
      startWith<MessageEvent>({ type: "ready", data: {} }),
      takeUntil(merge(this.events.closed$, timer(this.env.ACCESS_TOKEN_TTL_SECONDS * 1000))),
    );
  }
}
