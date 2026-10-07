export type IngestErrorKind = "permanent" | "transient";

/** Prisma known-request code ທີ່ເກີດຈາກຂໍ້ມູນເອງ (ລອງໃໝ່ກໍບໍ່ສຳເລັດ) */
const PERMANENT_PRISMA_CODES = new Set(["P2000", "P2005", "P2006", "P2007", "P2033"]);

interface PrismaLike {
  name?: unknown;
  code?: unknown;
  meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
}

/**
 * ແຍກ error ຂອງການບັນທຶກ event:
 * - permanent = ຂໍ້ມູນຂອງ event ເອງທີ່ Postgres ປະຕິເສດ ແລະ ລອງໃໝ່ກໍເທົ່າເດີມ (ຂ້າມ event ນີ້ໄດ້)
 *   ເຊັ່ນ "\u0000" ໃນ text: Prisma 7 + adapter-pg ໂຍນ PrismaClientKnownRequestError code P2039
 *   ທີ່ meta.driverAdapterError.cause.code ເປັນ SQLSTATE 22021 (class 22 = data exception).
 * - transient = ທຸກຢ່າງອື່ນ (ເຊື່ອມຕໍ່/DB ລົ້ມ P1xxx, P2024, P2034, P2002 ທີ່ຍັງຊົນຫຼັງ retry, error ທີ່ບໍ່ຮູ້ຈັກ)
 *   → ໃຫ້ 500 ເພື່ອ Meta ສົ່ງຊ້ຳ.
 */
export function classifyIngestError(error: unknown): IngestErrorKind {
  if (typeof error !== "object" || error === null) return "transient";
  const err = error as PrismaLike;
  if (err.name === "PrismaClientValidationError") return "permanent";
  if (typeof err.code !== "string") return "transient";
  if (PERMANENT_PRISMA_CODES.has(err.code)) return "permanent";
  if (err.code === "P2039") {
    const sqlState = err.meta?.driverAdapterError?.cause?.code;
    if (typeof sqlState === "string" && sqlState.startsWith("22")) return "permanent";
  }
  return "transient";
}
