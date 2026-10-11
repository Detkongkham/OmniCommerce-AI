import { Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";

interface Bucket {
  /** ເວລາ (ms) ຂອງຄຳຂໍທີ່ຜ່ານ ພາຍໃນ window */
  times: number[];
  /** ເວລາທີ່ bucket ນີ້ໝົດຄວາມໝາຍ (ຄຳຂໍຫຼ້າສຸດ + window) */
  expiresAt: number;
}

/**
 * ຈຳກັດຄວາມຖີ່ຂອງ POST ສາທາລະນະ (/store) ແບບ sliding window ໃນ memory ຂອງ process ດຽວ.
 * ບໍ່ໃຊ້ ThrottlerModule: throttler ທີ່ຕັ້ງຊື່ເພີ່ມຈະຖືກບັງຄັບໃຊ້ກັບ /auth/login ນຳ.
 * ຂໍ້ຈຳກັດ: ຫຼາຍ instance ນັບແຍກກັນ ແລະ restart ລ້າງຕົວນັບ.
 */
@Injectable()
export class StoreRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly maxKeys = 10_000) {}

  get size(): number {
    return this.buckets.size;
  }

  /** ນັບ 1 ຄຳຂໍຂອງ `key`; ເກີນ `limit` ພາຍໃນ `windowMs` → 429 (ຄຳຂໍທີ່ຖືກປະຕິເສດບໍ່ຖືກນັບ) */
  hit(key: string, limit: number, windowMs: number, now: number = Date.now()): void {
    const since = now - windowMs;
    const times = (this.buckets.get(key)?.times ?? []).filter((time) => time > since);
    if (times.length >= limit) {
      throw apiError("TOO_MANY_ATTEMPTS", "Too many requests; try again later");
    }
    times.push(now);
    this.buckets.set(key, { times, expiresAt: now + windowMs });
    if (this.buckets.size > this.maxKeys) this.prune(now);
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
  }
}
