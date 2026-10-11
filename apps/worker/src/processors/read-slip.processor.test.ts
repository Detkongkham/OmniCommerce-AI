import { StorageInvalidKeyError, StorageNotFoundError } from "@oca/ai-engine";
import { type PrismaClient, markSlipReadFailed, storeSlipReadResult } from "@oca/database";
import { SLIP_MAX_BYTES } from "@oca/shared";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_READER_TIMEOUT_MS, type ReadSlipDeps, createReadSlipDeps, processReadSlip } from "./read-slip.processor";

const bytes = new Uint8Array([1, 2, 3]);

function makeDeps(
  overrides: Partial<ReadSlipDeps> = {},
  slip: unknown = { imageKey: "slips/k", imageMime: "image/png", status: "PENDING_READ" },
) {
  const findUnique = vi.fn().mockResolvedValue(slip);
  const deps: ReadSlipDeps = {
    db: { paymentSlip: { findUnique } } as unknown as PrismaClient,
    storage: { put: vi.fn(), get: vi.fn().mockResolvedValue({ bytes, mime: "image/png" }) },
    reader: { name: "fake", version: "1", read: vi.fn().mockResolvedValue({ amount: "10", raw: { a: 1 } }) },
    store: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    logger: { error: vi.fn() },
    deadlineGraceMs: 0,
    ...overrides,
  };
  return { deps, findUnique };
}
const job = (attemptsMade = 0, attempts = 3) => ({ slipId: "s1", attemptsMade, attempts });
const failingReader = (error: unknown = new Error("boom")) => ({
  name: "f",
  version: "1",
  read: vi.fn().mockRejectedValue(error),
});

describe("processReadSlip", () => {
  it("ອ່ານຮູບຈາກ storage → reader → store ດ້ວຍຊື່/ເວີຊັນ reader ແລະ ຄືນ 'read'", async () => {
    const result = { amount: "10", raw: { a: 1 } };
    const { deps, findUnique } = makeDeps({
      reader: { name: "fake", version: "1", read: vi.fn().mockResolvedValue(result) },
    });
    expect(await processReadSlip(deps, job())).toBe("read");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "s1" },
      select: { imageKey: true, imageMime: true, status: true },
    });
    expect(deps.storage.get).toHaveBeenCalledWith("slips/k");
    expect(deps.reader.read).toHaveBeenCalledWith(
      { bytes, mime: "image/png" },
      { signal: expect.any(AbortSignal) },
    );
    // ຜົນທີ່ເກັບ = ຜົນທີ່ reader ຄືນ ແບບດຽວກັນທຸກຢ່າງ (ອ້າງອີງດຽວກັນ)
    expect(deps.store).toHaveBeenCalledWith(deps.db, "s1", { name: "fake", version: "1" }, result);
    expect(vi.mocked(deps.store).mock.calls[0]?.[3]).toBe(result);
  });

  it("store ຄືນ false (ຖືກຂ້າມ) → 'skipped'", async () => {
    const { deps } = makeDeps({ store: vi.fn().mockResolvedValue(false) });
    expect(await processReadSlip(deps, job())).toBe("skipped");
  });

  it.each([
    [null],
    [{ imageKey: "k", imageMime: "image/png", status: "READ" }],
    [{ imageKey: "k", imageMime: "image/png", status: "REJECTED" }],
  ])("ບໍ່ພົບສະລິບ ຫຼື ບໍ່ແມ່ນ PENDING_READ → 'skipped' ໂດຍບໍ່ເອີ້ນ reader", async (slip) => {
    const { deps } = makeDeps({}, slip);
    expect(await processReadSlip(deps, job())).toBe("skipped");
    expect(deps.reader.read).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("reader throw ຄັ້ງທີ່ຍັງເຫຼືອໂອກາດ → throw ຕໍ່ (ໃຫ້ BullMQ retry) ແລະ ບໍ່ mark failed", async () => {
    const { deps } = makeDeps({ reader: failingReader() });
    await expect(processReadSlip(deps, job(0, 3))).rejects.toThrow("boom");
    await expect(processReadSlip(deps, job(1, 3))).rejects.toThrow("boom");
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("reader throw ຄັ້ງສຸດທ້າຍ → mark READ_FAILED ແລ້ວ throw ຕໍ່ (job ຖືກບັນທຶກວ່າລົ້ມ)", async () => {
    const { deps } = makeDeps({ reader: failingReader() });
    await expect(processReadSlip(deps, job(2, 3))).rejects.toThrow("boom");
    expect(deps.markFailed).toHaveBeenCalledWith(deps.db, "s1");
  });

  it("attempts ບໍ່ໄດ້ຕັ້ງ (=1) → ຄັ້ງທຳອິດຄືຄັ້ງສຸດທ້າຍ", async () => {
    const { deps } = makeDeps({ reader: failingReader() });
    await expect(processReadSlip(deps, { slipId: "s1", attemptsMade: 0, attempts: undefined })).rejects.toThrow("boom");
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
  });

  it("ໄຟລ໌ໃນ storage ຫາຍ → ບໍ່ retry: mark failed ທັນທີ ແລະ ຄືນ 'failed' ໂດຍບໍ່ throw", async () => {
    const { deps } = makeDeps({
      storage: { put: vi.fn(), get: vi.fn().mockRejectedValue(new StorageNotFoundError("slips/k")) },
    });
    expect(await processReadSlip(deps, job(0, 3))).toBe("failed");
    expect(deps.markFailed).toHaveBeenCalledWith(deps.db, "s1");
    expect(deps.reader.read).not.toHaveBeenCalled();
  });

  it("StorageError ອື່ນ (INVALID_KEY) ກໍບໍ່ retry: mark failed ແລະ ຄືນ 'failed'", async () => {
    const { deps } = makeDeps({
      storage: { put: vi.fn(), get: vi.fn().mockRejectedValue(new StorageInvalidKeyError("../x")) },
    });
    expect(await processReadSlip(deps, job(0, 3))).toBe("failed");
    expect(deps.markFailed).toHaveBeenCalledWith(deps.db, "s1");
    expect(deps.reader.read).not.toHaveBeenCalled();
  });

  it("error ອື່ນຈາກ storage (I/O ຊົ່ວຄາວ) → retry ຕາມປົກກະຕິ (throw, ບໍ່ mark ຖ້າຍັງມີໂອກາດ)", async () => {
    const { deps } = makeDeps({
      storage: { put: vi.fn(), get: vi.fn().mockRejectedValue(new Error("EIO")) },
    });
    await expect(processReadSlip(deps, job(0, 3))).rejects.toThrow("EIO");
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("store throw (DB ລົ້ມຊົ່ວຄາວ) ນັບເປັນຄວາມລົ້ມເຫຼວຂອງຄັ້ງນັ້ນຄືກັນ", async () => {
    const { deps } = makeDeps({ store: vi.fn().mockRejectedValue(new Error("db down")) });
    await expect(processReadSlip(deps, job(2, 3))).rejects.toThrow("db down");
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
  });

  it("store ຄືນ false → ບໍ່ເອີ້ນ markFailed", async () => {
    const { deps } = makeDeps({ store: vi.fn().mockResolvedValue(false) });
    await processReadSlip(deps, job());
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  describe("markFailed ລົ້ມ", () => {
    it("ຄັ້ງສຸດທ້າຍ: markFailed throw → ຍັງ throw error ຕົ້ນສະບັບ ແລະ log ໂດຍບໍ່ມີ payload", async () => {
      const { deps } = makeDeps({
        reader: failingReader(new Error("boom")),
        markFailed: vi.fn().mockRejectedValue(new Error("db down")),
      });
      await expect(processReadSlip(deps, job(2, 3))).rejects.toThrow("boom");
      expect(deps.logger.error).toHaveBeenCalledTimes(1);
      expect(String(vi.mocked(deps.logger.error).mock.calls[0]?.[0])).toContain("s1");
    });

    it("StorageError + markFailed ລົ້ມ → throw (ໃຫ້ BullMQ retry) ບໍ່ຄືນ 'failed'", async () => {
      const { deps } = makeDeps({
        storage: { put: vi.fn(), get: vi.fn().mockRejectedValue(new StorageNotFoundError("slips/k")) },
        markFailed: vi.fn().mockRejectedValue(new Error("db down")),
      });
      await expect(processReadSlip(deps, job(0, 3))).rejects.toThrow("db down");
    });

    it("ຮູບໃຫຍ່ເກີນ + markFailed ລົ້ມ → throw ແລະ ບໍ່ເອີ້ນ reader", async () => {
      const big = new Uint8Array(SLIP_MAX_BYTES + 1);
      const { deps } = makeDeps({
        storage: { put: vi.fn(), get: vi.fn().mockResolvedValue({ bytes: big, mime: "image/png" }) },
        markFailed: vi.fn().mockRejectedValue(new Error("db down")),
      });
      await expect(processReadSlip(deps, job(0, 3))).rejects.toThrow("db down");
      expect(deps.reader.read).not.toHaveBeenCalled();
    });
  });

  describe("createReadSlipDeps", () => {
    it("ສ້າງ deps ດ້ວຍຄ່າເລີ່ມຕົ້ນຂອງ @oca/database", () => {
      const db = {} as PrismaClient;
      const storage = { put: vi.fn(), get: vi.fn() };
      const reader = failingReader();
      const deps = createReadSlipDeps(db, storage, reader);
      expect(deps.db).toBe(db);
      expect(deps.storage).toBe(storage);
      expect(deps.reader).toBe(reader);
      expect(deps.store).toBe(storeSlipReadResult);
      expect(deps.markFailed).toBe(markSlipReadFailed);
      expect(typeof deps.logger.error).toBe("function");
    });
  });

  describe("timeout ຂອງ reader", () => {
    // reader ທີ່ບໍ່ສົນ signal ເລີຍ
    const deafReader = () => ({ name: "d", version: "1", read: vi.fn(() => new Promise<never>(() => {})) });

    it("reader ບໍ່ສົນ signal → deadline ແຂງ reject ດ້ວຍຂໍ້ຄວາມ timeout", async () => {
      const { deps } = makeDeps({ reader: deafReader(), readerTimeoutMs: 20 });
      await expect(processReadSlip(deps, job(0, 3))).rejects.toThrow("slip reader timed out after 20ms");
      expect(deps.markFailed).not.toHaveBeenCalled();
    });

    it("reader ບໍ່ສົນ signal ຄັ້ງສຸດທ້າຍ → mark failed ແລ້ວ reject", async () => {
      const { deps } = makeDeps({ reader: deafReader(), readerTimeoutMs: 20 });
      await expect(processReadSlip(deps, job(2, 3))).rejects.toThrow("timed out");
      expect(deps.markFailed).toHaveBeenCalledWith(deps.db, "s1");
    });

    it("ຄ່າເລີ່ມຕົ້ນ: AbortSignal.timeout ຖືກເອີ້ນດ້ວຍ DEFAULT_READER_TIMEOUT_MS (60_000)", async () => {
      const spy = vi.spyOn(AbortSignal, "timeout");
      const { deps } = makeDeps();
      await processReadSlip(deps, job());
      expect(DEFAULT_READER_TIMEOUT_MS).toBe(60_000);
      expect(spy).toHaveBeenCalledWith(60_000);
      spy.mockRestore();
    });

    // reader ທີ່ຄ້າງຕະຫຼອດ ຈົນກວ່າ signal ຖືກ abort
    const hangingReader = () => ({
      name: "h",
      version: "1",
      read: vi.fn(
        (_image: unknown, options?: { signal?: AbortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => reject(options.signal?.reason));
          }),
      ),
    });

    it("reader ຄ້າງ → ຄັ້ງທີ່ຍັງມີໂອກາດ: attempt reject (retry) ແລະ ບໍ່ mark failed", async () => {
      const { deps } = makeDeps({ reader: hangingReader(), readerTimeoutMs: 20 });
      await expect(processReadSlip(deps, job(0, 3))).rejects.toThrow();
      expect(deps.markFailed).not.toHaveBeenCalled();
      expect(deps.store).not.toHaveBeenCalled();
    });

    it("reader ຄ້າງຄັ້ງສຸດທ້າຍ → mark failed ແລ້ວ reject", async () => {
      const { deps } = makeDeps({ reader: hangingReader(), readerTimeoutMs: 20 });
      await expect(processReadSlip(deps, job(2, 3))).rejects.toThrow();
      expect(deps.markFailed).toHaveBeenCalledWith(deps.db, "s1");
    });

    it("ຄ່າເລີ່ມຕົ້ນ 60 ວິນາທີ: signal ທີ່ສົ່ງໃຫ້ reader ຍັງບໍ່ abort ທັນທີ", async () => {
      const { deps } = makeDeps();
      await processReadSlip(deps, job());
      const options = vi.mocked(deps.reader.read).mock.calls[0]?.[1];
      expect(options?.signal?.aborted).toBe(false);
    });
  });

  describe("ຮູບໃຫຍ່ເກີນ", () => {
    it("ຮູບ > SLIP_MAX_BYTES → mark failed ທັນທີ ແລະ ຄືນ 'failed' ໂດຍບໍ່ເອີ້ນ reader", async () => {
      const big = new Uint8Array(SLIP_MAX_BYTES + 1);
      const { deps } = makeDeps({
        storage: { put: vi.fn(), get: vi.fn().mockResolvedValue({ bytes: big, mime: "image/png" }) },
      });
      expect(await processReadSlip(deps, job(0, 3))).toBe("failed");
      expect(deps.markFailed).toHaveBeenCalledWith(deps.db, "s1");
      expect(deps.reader.read).not.toHaveBeenCalled();
    });

    it("ຮູບ = SLIP_MAX_BYTES ພໍດີ ຍັງອ່ານ", async () => {
      const exact = new Uint8Array(SLIP_MAX_BYTES);
      const { deps } = makeDeps({
        storage: { put: vi.fn(), get: vi.fn().mockResolvedValue({ bytes: exact, mime: "image/png" }) },
      });
      expect(await processReadSlip(deps, job())).toBe("read");
    });
  });
});
