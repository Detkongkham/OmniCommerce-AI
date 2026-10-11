import { type SlipReader, StorageError, type StorageService } from "@oca/ai-engine";
import { type PrismaClient, type SlipReadOutput, markSlipReadFailed, storeSlipReadResult } from "@oca/database";

/** ເວລາສູງສຸດທີ່ reader ໃຊ້ຕໍ່ 1 ຄັ້ງ (ms); ເກີນ → abort ແລ້ວນັບເປັນຄັ້ງທີ່ລົ້ມ */
export const DEFAULT_READER_TIMEOUT_MS = 60_000;
/** ຂະໜາດຮູບສູງສຸດທີ່ຍອມສົ່ງໃຫ້ reader (ກັນຮູບຜິດປົກກະຕິ) */
export const MAX_SLIP_IMAGE_BYTES = 16 * 1024 * 1024;

export interface ReadSlipDeps {
  db: PrismaClient;
  storage: StorageService;
  reader: SlipReader;
  /** ໃສ່ໄດ້ເພື່ອ test; ຄ່າເລີ່ມຕົ້ນຢູ່ `defaultStore` */
  store: (
    db: PrismaClient,
    slipId: string,
    reader: { name: string; version: string },
    result: SlipReadOutput,
  ) => Promise<boolean>;
  markFailed: (db: PrismaClient, slipId: string) => Promise<boolean>;
  /** ເວລາ timeout ຂອງ reader (ms); ຄ່າເລີ່ມຕົ້ນ DEFAULT_READER_TIMEOUT_MS */
  readerTimeoutMs?: number;
}

export const defaultStore: ReadSlipDeps["store"] = (db, slipId, reader, result) =>
  storeSlipReadResult(db, slipId, reader, result);
export const defaultMarkFailed: ReadSlipDeps["markFailed"] = markSlipReadFailed;

export interface ReadSlipJob {
  slipId: string;
  /** ຈຳນວນຄັ້ງທີ່ລອງແລ້ວກ່ອນຄັ້ງນີ້ (BullMQ job.attemptsMade ຕອນກຳລັງປະມວນຜົນ) */
  attemptsMade: number;
  attempts: number | undefined;
}

export type ReadSlipOutcome = "read" | "skipped" | "failed";

/**
 * ອ່ານ 1 ສະລິບ. throw ເມື່ອລົ້ມແລະຍັງມີໂອກາດ retry (ໃຫ້ BullMQ ຈັດການ backoff); ຄັ້ງສຸດທ້າຍ → mark READ_FAILED ກ່ອນ throw.
 * ຂ້າມ (ບໍ່ throw) ເມື່ອສະລິບຫາຍ ຫຼື ບໍ່ແມ່ນ PENDING_READ (ແອດມິນປະຕິເສດ/ກວດແລ້ວ ຫຼື job ຊ້ຳ).
 * ບໍ່ retry (mark failed ທັນທີ, ຄືນ "failed"): StorageError ທຸກຊະນິດ ແລະ ຮູບໃຫຍ່ເກີນກຳນົດ.
 * ຫ້າມ log ຜົນດິບ (raw) ຂອງ reader.
 */
export async function processReadSlip(deps: ReadSlipDeps, job: ReadSlipJob): Promise<ReadSlipOutcome> {
  const slip = await deps.db.paymentSlip.findUnique({
    where: { id: job.slipId },
    select: { imageKey: true, imageMime: true, status: true },
  });
  if (!slip || slip.status !== "PENDING_READ") return "skipped";

  try {
    const { bytes } = await deps.storage.get(slip.imageKey);
    if (bytes.byteLength > MAX_SLIP_IMAGE_BYTES) {
      await deps.markFailed(deps.db, job.slipId);
      return "failed";
    }
    const result = await deps.reader.read(
      { bytes, mime: slip.imageMime },
      { signal: AbortSignal.timeout(deps.readerTimeoutMs ?? DEFAULT_READER_TIMEOUT_MS) },
    );
    const stored = await deps.store(
      deps.db,
      job.slipId,
      { name: deps.reader.name, version: deps.reader.version },
      result,
    );
    return stored ? "read" : "skipped";
  } catch (error) {
    // ໄຟລ໌ຫາຍ / key ບໍ່ຖືກຕ້ອງ: retry ບໍ່ຊ່ວຍ
    if (error instanceof StorageError) {
      await deps.markFailed(deps.db, job.slipId);
      return "failed";
    }
    const isLastAttempt = job.attemptsMade + 1 >= (job.attempts ?? 1);
    if (isLastAttempt) await deps.markFailed(deps.db, job.slipId);
    throw error;
  }
}
