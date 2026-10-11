import { normalizeSlipAmount } from "@oca/shared";
import type { PrismaClient } from "../generated/client";
import { evaluateSlip } from "./evaluate-slip";

/** ຮູບຜົນອ່ານ (ກົງກັບ SlipReadResult ຂອງ @oca/ai-engine ແຕ່ບໍ່ import ເພື່ອບໍ່ໃຫ້ database ຜູກກັບ ai-engine) */
export interface SlipReadOutput {
  amount?: string;
  currency?: string;
  /** ISO 8601 */
  paidAt?: string;
  destAccount?: string;
  refNo?: string;
  raw: unknown;
}

export interface StoreSlipReadOptions {
  /** ສຳລັບ test */
  now?: Date;
}

const CURRENCIES = ["LAK", "THB", "USD"] as const;
type SlipCurrency = (typeof CURRENCIES)[number];
const TEXT_MAX = 100;
const RAW_MAX_CHARS = 20_000;

// Postgres (text/JSONB) ປະຕິເສດ NUL (\u0000): ຕັດອອກຈາກທຸກຂໍ້ຄວາມທີ່ມາຈາກ reader
// Postgres ປະຕິເສດ NUL (\u0000) ແລະ lone surrogate (\udXXX) ໃນ text/jsonb: ຕັດ NUL ອອກ ແລະ ແທນ surrogate ເດີ່ຍວດ້ວຍ U+FFFD
const sanitizeText = (text: string): string => (text.split("\u0000").join("") as string & { toWellFormed(): string }).toWellFormed();

/** ຊັ້ນຊ້ອນສູງສຸດຂອງ raw (ເກີນ → ຖືວ່າເປັນສັດຕູ ແລະ ເກັບແຕ່ { truncated: true }) */
const RAW_MAX_DEPTH = 64;

function sanitizeDeep(value: unknown, depth = 0): unknown {
  if (depth > RAW_MAX_DEPTH) throw new Error("raw too deep");
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map((inner) => sanitizeDeep(inner, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      // key ຊື່ __proto__ ຖືກຖິ້ມຢ່າງຊັດເຈນ (Prisma ກໍຕັດມັນຢູ່ແລ້ວ; ຖິ້ມເອງເພື່ອບໍ່ໃຫ້ prototype ຖືກແຕະ ແລະ ພຶດຕິກຳແນ່ນອນ)
      if (key === "__proto__") continue;
      Object.defineProperty(out, sanitizeText(key), {
        value: sanitizeDeep(inner, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return value;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = sanitizeText(value).trim();
  return trimmed === "" ? null : trimmed.slice(0, TEXT_MAX);
}

function cleanCurrency(value: unknown): SlipCurrency | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (CURRENCIES as readonly string[]).includes(upper) ? (upper as SlipCurrency) : null;
}

function cleanDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ຜົນດິບຂອງ reader ບໍ່ເຊື່ອຖື: ຫໍ່ເປັນ { value } (ກັນ JSON null) ແລະ ຈຳກັດຂະໜາດ */
function boundedRaw(raw: unknown): { value: unknown } | { truncated: true } {
  try {
    const text = JSON.stringify(raw ?? null) ?? "null"; // cyclic/BigInt → throw
    if (text.length > RAW_MAX_CHARS) return { truncated: true };
    return { value: sanitizeDeep(JSON.parse(text)) };
  } catch {
    return { truncated: true };
  }
}

/**
 * ບັນທຶກຜົນທີ່ເຄື່ອງອ່ານໄດ້ ລົງສະລິບທີ່ຍັງ PENDING_READ ເທົ່ານັ້ນ (conditional UPDATE: ຖ້າແອດມິນປະຕິເສດ/ກວດແລ້ວລະຫວ່າງອ່ານ
 * ຈະບໍ່ຂຽນທັບ) ແລ້ວຄິດ flag. ຄືນ false ເມື່ອຂ້າມ. ຄ່າທີ່ແປງບໍ່ໄດ້ = null (ບໍ່ throw): ແອດມິນຕື່ມມືໄດ້.
 */
export async function storeSlipReadResult(
  db: PrismaClient,
  slipId: string,
  reader: { name: string; version: string },
  result: SlipReadOutput,
  options: StoreSlipReadOptions = {},
): Promise<boolean> {
  // update ແລະ ຄິດ flag ໃນ transaction ດຽວ: ຖ້າຄິດ flag ລົ້ມ ຈະ rollback ແລ້ວ BullMQ retry ຍັງເຫັນ PENDING_READ
  return db.$transaction(async (tx) => {
    const { count } = await tx.paymentSlip.updateMany({
      where: { id: slipId, status: "PENDING_READ" },
      data: {
        status: "READ",
        readerName: reader.name,
        readerVersion: reader.version,
        readAmount: normalizeSlipAmount(result.amount),
        readCurrency: cleanCurrency(result.currency),
        readPaidAt: cleanDate(result.paidAt),
        readDestAccount: cleanText(result.destAccount),
        readRefNo: cleanText(result.refNo),
        readRaw: boundedRaw(result.raw) as object,
      },
    });
    if (count === 0) return false;
    await evaluateSlip(tx, slipId, options);
    return true;
  });
}

/** job ລົ້ມຄົບຈຳນວນຄັ້ງ: PENDING_READ → READ_FAILED (ແອດມິນ retry ຫຼື ຕື່ມມືໄດ້). ຄືນ false ເມື່ອບໍ່ແຕະ. */
export async function markSlipReadFailed(db: PrismaClient, slipId: string): Promise<boolean> {
  const { count } = await db.paymentSlip.updateMany({
    where: { id: slipId, status: "PENDING_READ" },
    data: { status: "READ_FAILED" },
  });
  return count > 0;
}
