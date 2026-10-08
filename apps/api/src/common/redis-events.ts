import { Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import { type Observable, Subject } from "rxjs";
import type { Env } from "../config/env";

const CLIENT_TIMEOUT_MS = 1000;

/**
 * event ເບົາຜ່ານ Redis pub/sub (ຮອງຮັບຫຼາຍ instance ຂອງ API) ສຳລັບ SSE.
 * publish ລົ້ມເຫຼວບໍ່ throw (ການບັນທຶກຂໍ້ມູນຫຼັກຕ້ອງບໍ່ລົ້ມຕາມ; client ມີ poll ສຳຮອງ).
 * ໃຊ້ໂດຍ InboxEventsService ແລະ LiveEventsService.
 */
export class RedisEventChannel<T> {
  private readonly logger: Logger;
  private readonly subject = new Subject<T>();
  private readonly closedSubject = new Subject<void>();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private subscribing: Promise<void> | null = null;
  private destroyed = false;

  constructor(
    private readonly env: Env,
    private readonly channel: string,
    private readonly parse: (value: unknown) => T | null,
    name: string,
  ) {
    this.logger = new Logger(name);
  }

  private createClient(): Redis {
    const client = new Redis(this.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      // ກັນ publish ຄ້າງ request ເມື່ອ Redis ຫາຍ/packet ຕົກ (ສູງສຸດ ~1 ວິນາທີ)
      connectTimeout: CLIENT_TIMEOUT_MS,
      commandTimeout: CLIENT_TIMEOUT_MS,
    });
    client.on("error", (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    return client;
  }

  async publish(event: T): Promise<void> {
    if (this.destroyed) return;
    try {
      this.publisher ??= this.createClient();
      await this.publisher.publish(this.channel, JSON.stringify(event));
    } catch (error) {
      this.logger.warn(`publish failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** subscribe ຄັ້ງທຳອິດທີ່ມີ client SSE (connection ແຍກຈາກ publisher ເພາະ subscriber mode ສົ່ງຄຳສັ່ງອື່ນບໍ່ໄດ້) */
  ensureSubscribed(): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error(`${this.channel} events are closed`));
    this.subscribing ??= (async () => {
      const subscriber = this.createClient();
      subscriber.on("message", (_channel: string, raw: string) => {
        let event: T | null = null;
        try {
          event = this.parse(JSON.parse(raw));
        } catch {
          // ຂໍ້ຄວາມທີ່ບໍ່ແມ່ນ JSON ຖືກຂ້າມ
        }
        if (event) this.subject.next(event);
      });
      try {
        await subscriber.subscribe(this.channel);
      } catch (error) {
        subscriber.disconnect();
        throw error;
      }
      if (this.destroyed) {
        // app ປິດລະຫວ່າງລໍ subscribe: ຢ່າປ່ອຍ connection ຄ້າງ
        subscriber.disconnect();
        throw new Error(`${this.channel} events are closed`);
      }
      this.subscriber = subscriber;
    })().catch((error: unknown) => {
      this.subscribing = null;
      throw error;
    });
    return this.subscribing;
  }

  get updates$(): Observable<T> {
    return this.subject.asObservable();
  }

  /** ປ່ອຍສັນຍານ + ຈົບ ເມື່ອ service ຖືກປິດ (ໃຫ້ stream SSE ຈົບຕາມ) */
  get closed$(): Observable<void> {
    return this.closedSubject.asObservable();
  }

  async destroy(): Promise<void> {
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
