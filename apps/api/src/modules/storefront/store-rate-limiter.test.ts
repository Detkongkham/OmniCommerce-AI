import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { StoreRateLimiter } from "./store-rate-limiter";

const rejected = (run: () => void) => {
  try {
    run();
  } catch (error) {
    return error as HttpException;
  }
  return undefined;
};

describe("StoreRateLimiter", () => {
  it("ຜ່ານຈົນຮອດ limit; ຄັ້ງຖັດໄປ = 429 TOO_MANY_ATTEMPTS", () => {
    const limiter = new StoreRateLimiter();
    limiter.hit("a", 2, 1000, 0);
    limiter.hit("a", 2, 1000, 10);
    const error = rejected(() => limiter.hit("a", 2, 1000, 20));
    expect(error).toBeInstanceOf(HttpException);
    expect(error?.getStatus()).toBe(429);
    expect(error?.getResponse()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });

  it("ພົ້ນ window ແລ້ວຜ່ານອີກ", () => {
    const limiter = new StoreRateLimiter();
    limiter.hit("a", 1, 1000, 0);
    expect(rejected(() => limiter.hit("a", 1, 1000, 999))).toBeDefined();
    expect(rejected(() => limiter.hit("a", 1, 1000, 1000))).toBeUndefined();
  });

  it("key ຕ່າງກັນນັບແຍກກັນ", () => {
    const limiter = new StoreRateLimiter();
    limiter.hit("a", 1, 1000, 0);
    expect(rejected(() => limiter.hit("b", 1, 1000, 0))).toBeUndefined();
  });

  it("ຄຳຂໍທີ່ຖືກປະຕິເສດບໍ່ຍືດ window", () => {
    const limiter = new StoreRateLimiter();
    limiter.hit("a", 1, 1000, 0);
    expect(rejected(() => limiter.hit("a", 1, 1000, 900))).toBeDefined();
    expect(rejected(() => limiter.hit("a", 1, 1000, 1000))).toBeUndefined();
  });

  it("ລ້າງ key ເກົ່າເມື່ອຈຳນວນ key ເກີນເພດານ (ບໍ່ໃຫ້ memory ໃຫຍ່ຂຶ້ນບໍ່ຈຳກັດ)", () => {
    const limiter = new StoreRateLimiter(3);
    limiter.hit("a", 1, 1000, 0);
    limiter.hit("b", 1, 1000, 0);
    limiter.hit("c", 1, 1000, 0);
    limiter.hit("d", 1, 1000, 5000);
    expect(limiter.size).toBe(1);
  });
});
