import { SLIP_JOB_READ, SLIP_READ_JOB_OPTIONS } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { BullSlipQueue } from "./slip.providers";

const env = { REDIS_URL: "redis://x", QUEUE_PREFIX: "t" };

describe("BullSlipQueue", () => {
  it("ບໍ່ສ້າງ queue ຈົນກວ່າຈະ enqueue ຄັ້ງທຳອິດ (ບໍ່ເຊື່ອມ Redis ຕອນເປີດແອັບ)", () => {
    const factory = vi.fn();
    new BullSlipQueue(env, factory);
    expect(factory).not.toHaveBeenCalled();
  });

  it("enqueueRead ເພີ່ມ job ຊື່ + data + option ທີ່ຖືກ ແລະ ໃຊ້ queue ດຽວຄືນ", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const factory = vi.fn().mockReturnValue({ add, close: vi.fn() });
    const queue = new BullSlipQueue(env, factory);
    await queue.enqueueRead("s1");
    await queue.enqueueRead("s2");
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(env);
    expect(add).toHaveBeenNthCalledWith(1, SLIP_JOB_READ, { slipId: "s1" }, SLIP_READ_JOB_OPTIONS);
    expect(add).toHaveBeenNthCalledWith(2, SLIP_JOB_READ, { slipId: "s2" }, SLIP_READ_JOB_OPTIONS);
  });

  it("onModuleDestroy ປິດ queue ທີ່ສ້າງແລ້ວ ແລະ ບໍ່ເປັນຫຍັງຖ້າຍັງບໍ່ສ້າງ", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const queue = new BullSlipQueue(env, () => ({ add: vi.fn().mockResolvedValue(undefined), close }));
    await queue.onModuleDestroy();
    expect(close).not.toHaveBeenCalled();
    await queue.enqueueRead("s1");
    await queue.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
