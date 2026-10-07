import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { InboxEvent } from "@oca/shared";
import { Redis } from "ioredis";
import { type Observable, Subject } from "rxjs";
import { ENV, type Env } from "../../config/env";

export const INBOX_EVENTS_CHANNEL = "oca:inbox:events";
const CLIENT_TIMEOUT_MS = 1000;

function parseEvent(raw: string): InboxEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      (value as InboxEvent).type === "conversation.updated" &&
      typeof (value as InboxEvent).conversationId === "string"
    ) {
      return { type: "conversation.updated", conversationId: (value as InboxEvent).conversationId };
    }
  } catch {
    // ຂໍ້ຄວາມທີ່ບໍ່ແມ່ນ JSON ຖືກຂ້າມ
  }
  return null;
}

/**
 * event ຂອງ inbox ຜ່ານ Redis pub/sub ເພື່ອຮອງຮັບຫຼາຍ instance ຂອງ API.
 * publish ລົ້ມເຫຼວບໍ່ເຮັດໃຫ້ການບັນທຶກຂໍ້ຄວາມລົ້ມ (client ມີ poll ສຳຮອງ).
 */
@Injectable()
export class InboxEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(InboxEventsService.name);
  private readonly subject = new Subject<InboxEvent>();
  private readonly closedSubject = new Subject<void>();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private subscribing: Promise<void> | null = null;
  private destroyed = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private createClient(): Redis {
    const client = new Redis(this.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      // ກັນ publish ຄ້າງ webhook ເມື່ອ Redis ຫາຍ/packet ຕົກ (ສູງສຸດ ~1 ວິນາທີ)
      connectTimeout: CLIENT_TIMEOUT_MS,
      commandTimeout: CLIENT_TIMEOUT_MS,
    });
    client.on("error", (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    return client;
  }

  async publish(event: InboxEvent): Promise<void> {
    if (this.destroyed) return;
    try {
      this.publisher ??= this.createClient();
      await this.publisher.publish(INBOX_EVENTS_CHANNEL, JSON.stringify(event));
    } catch (error) {
      this.logger.warn(`publish failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** subscribe ຄັ້ງທຳອິດທີ່ມີ client SSE (connection ແຍກຈາກ publisher ເພາະ subscriber mode ສົ່ງຄຳສັ່ງອື່ນບໍ່ໄດ້) */
  ensureSubscribed(): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error("InboxEventsService is destroyed"));
    this.subscribing ??= (async () => {
      const subscriber = this.createClient();
      subscriber.on("message", (_channel: string, raw: string) => {
        const event = parseEvent(raw);
        if (event) this.subject.next(event);
      });
      try {
        await subscriber.subscribe(INBOX_EVENTS_CHANNEL);
      } catch (error) {
        subscriber.disconnect();
        throw error;
      }
      if (this.destroyed) {
        // app ປິດລະຫວ່າງລໍ subscribe: ຢ່າປ່ອຍ connection ຄ້າງ
        subscriber.disconnect();
        throw new Error("InboxEventsService is destroyed");
      }
      this.subscriber = subscriber;
    })().catch((error: unknown) => {
      this.subscribing = null;
      throw error;
    });
    return this.subscribing;
  }

  get updates$(): Observable<InboxEvent> {
    return this.subject.asObservable();
  }

  /** ປ່ອຍສັນຍານ + ຈົບ ເມື່ອ service ຖືກປິດ (ໃຫ້ stream SSE ຈົບຕາມ) */
  get closed$(): Observable<void> {
    return this.closedSubject.asObservable();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.closedSubject.next();
    this.closedSubject.complete();
    this.subject.complete();
    await Promise.allSettled([closeClient(this.publisher), closeClient(this.subscriber)]);
  }
}

/** quit ແບບສຸພາບ; ຖ້າບໍ່ສຳເລັດພາຍໃນ ~1 ວິນາທີ (Redis ຄ້າງ/ຫາຍ) ໃຫ້ຕັດ connection ທັນທີ */
async function closeClient(client: Redis | null): Promise<void> {
  if (!client) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.quit(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("quit timeout")), CLIENT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    client.disconnect();
  } finally {
    clearTimeout(timer);
  }
}
