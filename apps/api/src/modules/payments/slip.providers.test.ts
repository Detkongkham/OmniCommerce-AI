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
    // queue ໃໝ່ (ອັນເກົ່າຖືກປິດແລ້ວ enqueue ບໍ່ໄດ້)
    const queue2 = new BullSlipQueue(env, () => ({ add: vi.fn().mockResolvedValue(undefined), close }));
    await queue2.enqueueRead("s1");
    await queue2.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("enqueue ພ້ອມກັນ ສ້າງ queue ພຽງຄັ້ງດຽວ", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const factory = vi.fn().mockReturnValue({ add, close: vi.fn() });
    const queue = new BullSlipQueue(env, factory);
    await Promise.all([queue.enqueueRead("a"), queue.enqueueRead("b")]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(2);
  });

  it("add ລົ້ມ: ປິດ+ຖິ້ມ handle ແລ້ວຄັ້ງຕໍ່ໄປສ້າງໃໝ່", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const bad = { add: vi.fn().mockRejectedValue(new Error("boom")), close };
    const good = { add: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
    const factory = vi.fn().mockReturnValueOnce(bad).mockReturnValueOnce(good);
    const queue = new BullSlipQueue(env, factory);
    await expect(queue.enqueueRead("a")).rejects.toThrow("boom");
    expect(close).toHaveBeenCalledTimes(1);
    await queue.enqueueRead("b");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(good.add).toHaveBeenCalledTimes(1);
  });

  it("add ຄ້າງເກີນເວລາ: reject ດ້ວຍຂໍ້ຄວາມຊັດເຈນ ແລະ ຖິ້ມ handle (close ລົ້ມກໍບໍ່ເປັນຫຍັງ)", async () => {
    const close = vi.fn().mockRejectedValue(new Error("close fail"));
    const hung = { add: vi.fn().mockReturnValue(new Promise(() => {})), close };
    const good = { add: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
    const factory = vi.fn().mockReturnValueOnce(hung).mockReturnValueOnce(good);
    const queue = new BullSlipQueue(env, factory, { addTimeoutMs: 20 });
    await expect(queue.enqueueRead("a")).rejects.toThrow("Slip queue unavailable: add timed out");
    expect(close).toHaveBeenCalledTimes(1);
    await queue.enqueueRead("b");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("enqueueRead ຫຼັງ onModuleDestroy ຖືກປະຕິເສດ ແລະ ບໍ່ສ້າງ queue ໃໝ່", async () => {
    const factory = vi.fn();
    const queue = new BullSlipQueue(env, factory);
    await queue.onModuleDestroy();
    await expect(queue.enqueueRead("a")).rejects.toThrow("Slip queue closed");
    expect(factory).not.toHaveBeenCalled();
  });
});
