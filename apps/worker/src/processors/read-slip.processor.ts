import { SLIP_MAX_BYTES } from "@oca/shared";
import { type SlipReader, StorageError, type StorageService } from "@oca/ai-engine";
import { type PrismaClient, type SlipReadOutput, markSlipReadFailed, storeSlipReadResult } from "@oca/database";

/** ເວລາສູງສຸດທີ່ reader ໃຊ້ຕໍ່ 1 ຄັ້ງ (ms); ເກີນ → abort ແລ້ວນັບເປັນຄັ້ງທີ່ລົ້ມ */
export const DEFAULT_READER_TIMEOUT_MS = 60_000;
/** ເວລາເພີ່ມຫຼັງ timeout ຂອງ signal ກ່ອນ reject ແບບແຂງ (ກໍລະນີ reader ບໍ່ສົນ signal) */
export const DEFAULT_DEADLINE_GRACE_MS = 1_000;

export interface ReadSlipLogger {
  error(message: string): void;
}

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
  /** ເວລາເພີ່ມກ່ອນ deadline ແຂງ (ms); ຄ່າເລີ່ມຕົ້ນ DEFAULT_DEADLINE_GRACE_MS */
  deadlineGraceMs?: number;
  /** ໃຊ້ log ເມື່ອ mark failed ລົ້ມ (ຫ້າມໃສ່ payload ດິບ) */
  logger: ReadSlipLogger;
}

/** ສ້າງ deps ຄ່າເລີ່ມຕົ້ນ (ໃຊ້ໃນ worker ຈິງ) */
export function createReadSlipDeps(
  db: PrismaClient,
  storage: StorageService,
  reader: SlipReader,
  logger: ReadSlipLogger = { error: (message) => console.error(message) },
): ReadSlipDeps {
  return { db, storage, reader, store: storeSlipReadResult, markFailed: markSlipReadFailed, logger };
}

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

  let bytes: Uint8Array;
  try {
    ({ bytes } = await deps.storage.get(slip.imageKey));
  } catch (error) {
    // ໄຟລ໌ຫາຍ / key ບໍ່ຖືກຕ້ອງ: retry ບໍ່ຊ່ວຍ. ຖ້າ mark ລົ້ມ ໃຫ້ throw ເພື່ອ retry (ບໍ່ຄືນ "failed" ທີ່ບໍ່ໄດ້ບັນທຶກ)
    if (error instanceof StorageError) {
      await deps.markFailed(deps.db, job.slipId);
      return "failed";
    }
    return failAttempt(deps, job, error);
  }

  // ຢູ່ນອກ try ຂອງການ retry: ຖ້າ mark ລົ້ມ ຈະ throw ອອກໄປເອງ
  if (bytes.byteLength > SLIP_MAX_BYTES) {
    await deps.markFailed(deps.db, job.slipId);
    return "failed";
  }

  try {
    const result = await readWithDeadline(deps, { bytes, mime: slip.imageMime });
    const stored = await deps.store(
      deps.db,
      job.slipId,
      { name: deps.reader.name, version: deps.reader.version },
      result,
    );
    return stored ? "read" : "skipped";
  } catch (error) {
    return failAttempt(deps, job, error);
  }
}

/** ເອີ້ນ reader ພ້ອມ signal ແລະ deadline ແຂງ (ກັນ reader ທີ່ບໍ່ສົນ signal ຄ້າງ slot ຕະຫຼອດ) */
async function readWithDeadline(deps: ReadSlipDeps, image: { bytes: Uint8Array; mime: string }) {
  const timeoutMs = deps.readerTimeoutMs ?? DEFAULT_READER_TIMEOUT_MS;
  const graceMs = deps.deadlineGraceMs ?? DEFAULT_DEADLINE_GRACE_MS;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`slip reader timed out after ${timeoutMs}ms`)), timeoutMs + graceMs);
    timer.unref();
  });
  try {
    return await Promise.race([deps.reader.read(image, { signal: AbortSignal.timeout(timeoutMs) }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** ຄັ້ງສຸດທ້າຍ → mark READ_FAILED (ຖ້າ mark ລົ້ມ ແຄ່ log; ບໍ່ບັງ error ຕົ້ນສະບັບ) ແລ້ວ throw error ເດີມ */
async function failAttempt(deps: ReadSlipDeps, job: ReadSlipJob, error: unknown): Promise<never> {
  const isLastAttempt = job.attemptsMade + 1 >= (job.attempts ?? 1);
  if (isLastAttempt) {
    try {
      await deps.markFailed(deps.db, job.slipId);
    } catch (markError) {
      const reason = markError instanceof Error ? markError.message : String(markError);
      deps.logger.error(`Failed to mark slip ${job.slipId} READ_FAILED: ${reason}`);
    }
  }
  throw error;
}
