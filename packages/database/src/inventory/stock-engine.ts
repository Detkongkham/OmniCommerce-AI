import { randomUUID } from "node:crypto";
import type { Prisma, StockMovementType } from "../generated/client";
import { InsufficientStockError, type StockShortage, isStockCheckViolation } from "./errors";

/**
 * ເຄື່ອງຈັກສະຕ໋ອກ. ທຸກ function ຕ້ອງຖືກເອີ້ນພາຍໃນ `$transaction` ຂອງຜູ້ເອີ້ນ:
 * ຖ້າ throw (ເຊັ່ນ InsufficientStockError) ຜູ້ເອີ້ນປ່ອຍໃຫ້ transaction rollback ທັງໝົດ.
 * ໂມດູນອື່ນຫ້າມ UPDATE "StockLevel" / INSERT "StockMovement" ນອກຈາກຜ່ານໄຟລ໌ນີ້.
 *
 * ສົມມຸດວ່າ transaction ໃຊ້ isolation ຄ່າເລີ່ມຕົ້ນ Read Committed (conditional UPDATE ອ່ານແຖວລ່າສຸດຫຼັງລໍ lock).
 * ຖ້າຜູ້ເອີ້ນໃຊ້ Serializable/RepeatableRead ຈະໄດ້ error 40001 (serialization failure) ເຊິ່ງບໍ່ຖືກແປເປັນ
 * InsufficientStockError ແລະ ຜູ້ເອີ້ນຕ້ອງ retry ເອງ.
 */
export type Tx = Prisma.TransactionClient;

export interface StockKey {
  variantId: string;
  warehouseId: string;
}

export interface StockLine extends StockKey {
  quantity: number;
}

export interface AdjustLine extends StockKey {
  /** ບວກ ຫຼື ລົບ, ບໍ່ແມ່ນ 0 */
  delta: number;
}

export interface TransferLine {
  variantId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
}

export interface MoveContext {
  orderId?: string | null;
  actorId?: string | null;
  note?: string | null;
}

/** ເພດານຂອງ |quantity| / |delta| ຕໍ່ການເຄື່ອນໄຫວ (ເທົ່າກັບ Zod schema) ກັນ int4 overflow. */
export const MAX_STOCK_QUANTITY = 1_000_000;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_STOCK_QUANTITY) {
    throw new RangeError(`quantity must be an integer between 1 and ${MAX_STOCK_QUANTITY}`);
  }
}

function assertDelta(delta: number): void {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_STOCK_QUANTITY) {
    throw new RangeError(`delta must be a non-zero integer with |delta| <= ${MAX_STOCK_QUANTITY}`);
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** ຮຽງແບບ ASCII ຕາມ (variantId, warehouseId) ເພື່ອໃຫ້ທຸກ transaction lock ແຖວຕາມລຳດັບດຽວກັນ (ກັນ deadlock). */
function sortLines<T extends StockKey>(lines: readonly T[]): T[] {
  return [...lines].sort((a, b) => compare(a.variantId, b.variantId) || compare(a.warehouseId, b.warehouseId));
}

async function record(
  tx: Tx,
  key: StockKey,
  type: StockMovementType,
  quantity: number,
  ctx: MoveContext,
  extraNote?: string,
): Promise<void> {
  const note = [ctx.note, extraNote].filter((part): part is string => Boolean(part)).join(" | ");
  await tx.stockMovement.create({
    data: {
      variantId: key.variantId,
      warehouseId: key.warehouseId,
      type,
      quantity,
      orderId: ctx.orderId ?? null,
      actorId: ctx.actorId ?? null,
      note: note === "" ? null : note,
    },
  });
}

async function shortageOf(tx: Tx, key: StockKey, requested: number): Promise<StockShortage> {
  const rows = await tx.$queryRaw<{ available: number }[]>`
    SELECT "onHand" - "reserved" AS "available" FROM "StockLevel"
    WHERE "variantId" = ${key.variantId} AND "warehouseId" = ${key.warehouseId}`;
  return { variantId: key.variantId, warehouseId: key.warehouseId, requested, available: rows[0]?.available ?? 0 };
}

/**
 * ຣັນ conditional UPDATE: true = ແກ້ 1 ແຖວ (ເງື່ອນໄຂຜ່ານ), false = 0 ແຖວ (ບໍ່ພໍ).
 * ຖ້າ CHECK ຂອງ DB ຖືກຕີ ແປເປັນ InsufficientStockError (transaction ຖືກ abort ແລ້ວ ຈຶ່ງບໍ່ query ຕໍ່).
 */
async function conditional(key: StockKey, requested: number, run: () => Promise<number>): Promise<boolean> {
  try {
    return (await run()) > 0;
  } catch (error) {
    if (isStockCheckViolation(error)) {
      // available: 0 ເປັນຄ່າແທນ ບໍ່ໄດ້ອ່ານຈາກ DB (transaction ຖືກ abort ແລ້ວ ຈຶ່ງ query ບໍ່ໄດ້)
      throw new InsufficientStockError([{ ...key, requested, available: 0 }]);
    }
    throw error;
  }
}

async function increaseOnHand(tx: Tx, key: StockKey, quantity: number): Promise<void> {
  // id ຂອງແຖວທີ່ເຄື່ອງຈັກສ້າງເປັນ UUID ໂດຍເຈດຕະນາ (schema default ເປັນ cuid ເຊິ່ງ raw SQL ໃຊ້ບໍ່ໄດ້): ຢ່າ "ແກ້"
  await tx.$executeRaw`
    INSERT INTO "StockLevel" ("id", "variantId", "warehouseId", "onHand", "reserved", "updatedAt")
    VALUES (${randomUUID()}, ${key.variantId}, ${key.warehouseId}, ${quantity}, 0, now())
    ON CONFLICT ("variantId", "warehouseId")
    DO UPDATE SET "onHand" = "StockLevel"."onHand" + ${quantity}, "updatedAt" = now()`;
}

async function tryDecreaseAvailable(tx: Tx, key: StockKey, quantity: number): Promise<boolean> {
  return conditional(key, quantity, () => tx.$executeRaw`
    UPDATE "StockLevel" SET "onHand" = "onHand" - ${quantity}, "updatedAt" = now()
    WHERE "variantId" = ${key.variantId} AND "warehouseId" = ${key.warehouseId}
      AND "onHand" - "reserved" >= ${quantity}`);
}

async function tryReserve(tx: Tx, key: StockKey, quantity: number): Promise<boolean> {
  return conditional(key, quantity, () => tx.$executeRaw`
    UPDATE "StockLevel" SET "reserved" = "reserved" + ${quantity}, "updatedAt" = now()
    WHERE "variantId" = ${key.variantId} AND "warehouseId" = ${key.warehouseId}
      AND "onHand" - "reserved" >= ${quantity}`);
}

async function fail(tx: Tx, key: StockKey, requested: number): Promise<never> {
  throw new InsufficientStockError([await shortageOf(tx, key, requested)]);
}

// ---------------------------------------------------------------------------
// ການເຄື່ອນໄຫວແບບແຖວດຽວ
// ---------------------------------------------------------------------------
export async function receive(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  await increaseOnHand(tx, line, line.quantity);
  await record(tx, line, "RECEIVE", line.quantity, ctx);
}

export async function returnStock(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  await increaseOnHand(tx, line, line.quantity);
  await record(tx, line, "RETURN", line.quantity, ctx);
}

export async function adjust(tx: Tx, line: AdjustLine, ctx: MoveContext = {}): Promise<void> {
  assertDelta(line.delta);
  if (line.delta > 0) {
    await increaseOnHand(tx, line, line.delta);
  } else {
    const ok = await conditional(line, -line.delta, () => tx.$executeRaw`
      UPDATE "StockLevel" SET "onHand" = "onHand" + ${line.delta}, "updatedAt" = now()
      WHERE "variantId" = ${line.variantId} AND "warehouseId" = ${line.warehouseId}
        AND "onHand" + ${line.delta} >= "reserved"`);
    if (!ok) await fail(tx, line, -line.delta);
  }
  await record(tx, line, "ADJUST", line.delta, ctx);
}

export async function reserve(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  if (!(await tryReserve(tx, line, line.quantity))) await fail(tx, line, line.quantity);
  await record(tx, line, "RESERVE", line.quantity, ctx);
}

export async function release(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  const ok = await conditional(line, line.quantity, () => tx.$executeRaw`
    UPDATE "StockLevel" SET "reserved" = "reserved" - ${line.quantity}, "updatedAt" = now()
    WHERE "variantId" = ${line.variantId} AND "warehouseId" = ${line.warehouseId}
      AND "reserved" >= ${line.quantity}`);
  if (!ok) await fail(tx, line, line.quantity);
  await record(tx, line, "RELEASE", line.quantity, ctx);
}

export async function ship(tx: Tx, line: StockLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  const ok = await conditional(line, line.quantity, () => tx.$executeRaw`
    UPDATE "StockLevel"
    SET "onHand" = "onHand" - ${line.quantity}, "reserved" = "reserved" - ${line.quantity}, "updatedAt" = now()
    WHERE "variantId" = ${line.variantId} AND "warehouseId" = ${line.warehouseId}
      AND "reserved" >= ${line.quantity}`);
  if (!ok) await fail(tx, line, line.quantity);
  await record(tx, line, "SHIP", line.quantity, ctx);
}

/**
 * ຍ້າຍສະຕ໋ອກທີ່ຂາຍໄດ້ (onHand - reserved) ລະຫວ່າງສາງ. ສອງຂັ້ນຕອນເຮັດຕາມລຳດັບ warehouseId
 * ນ້ອຍ→ໃຫຍ່ ເພື່ອກັນ deadlock ເມື່ອມີ A→B ແລະ B→A ພ້ອມກັນ.
 */
export async function transfer(tx: Tx, line: TransferLine, ctx: MoveContext = {}): Promise<void> {
  assertQuantity(line.quantity);
  if (line.fromWarehouseId === line.toWarehouseId) {
    throw new RangeError("source and destination warehouse must differ");
  }
  const from: StockKey = { variantId: line.variantId, warehouseId: line.fromWarehouseId };
  const to: StockKey = { variantId: line.variantId, warehouseId: line.toWarehouseId };

  const out = async () => {
    if (!(await tryDecreaseAvailable(tx, from, line.quantity))) await fail(tx, from, line.quantity);
  };
  const into = () => increaseOnHand(tx, to, line.quantity);

  if (line.fromWarehouseId < line.toWarehouseId) {
    await out();
    await into();
  } else {
    await into();
    await out();
  }

  await record(tx, from, "TRANSFER_OUT", line.quantity, ctx, `to ${line.toWarehouseId}`);
  await record(tx, to, "TRANSFER_IN", line.quantity, ctx, `from ${line.fromWarehouseId}`);
}

// ---------------------------------------------------------------------------
// ຫຼາຍລາຍການ (ສຳລັບຄຳສັ່ງຊື້): ຮຽງ lock ສະເໝີ
// ---------------------------------------------------------------------------
/**
 * ຈອງທຸກລາຍການ. ຖ້າບາງລາຍການບໍ່ພໍ ຈະລອງຄົບທຸກລາຍການກ່ອນ ແລ້ວ throw ຄັ້ງດຽວພ້ອມລາຍການທີ່ບໍ່ພໍທັງໝົດ
 * (ເພື່ອໃຫ້ຜູ້ໃຊ້ເຫັນຄົບໃນຄັ້ງດຽວ). ການ throw ເຮັດໃຫ້ transaction ຂອງຜູ້ເອີ້ນ rollback.
 */
export async function reserveMany(tx: Tx, lines: readonly StockLine[], ctx: MoveContext = {}): Promise<void> {
  const sorted = sortLines(lines);
  // ກວດທຸກລາຍການກ່ອນ UPDATE ໃດໆ: ລາຍການເສຍຈະບໍ່ປະການຈອງບາງສ່ວນໄວ້ ເຖິງຜູ້ເອີ້ນຈະຈັບ error ແລ້ວ commit
  for (const line of sorted) assertQuantity(line.quantity);
  const reserved: StockLine[] = [];
  const shortages: StockShortage[] = [];
  for (const line of sorted) {
    if (await tryReserve(tx, line, line.quantity)) reserved.push(line);
    else shortages.push(await shortageOf(tx, line, line.quantity));
  }
  if (shortages.length > 0) throw new InsufficientStockError(shortages);
  for (const line of reserved) await record(tx, line, "RESERVE", line.quantity, ctx);
}

export async function releaseMany(tx: Tx, lines: readonly StockLine[], ctx: MoveContext = {}): Promise<void> {
  const sorted = sortLines(lines);
  for (const line of sorted) assertQuantity(line.quantity);
  for (const line of sorted) await release(tx, line, ctx);
}

export async function shipMany(tx: Tx, lines: readonly StockLine[], ctx: MoveContext = {}): Promise<void> {
  const sorted = sortLines(lines);
  for (const line of sorted) assertQuantity(line.quantity);
  for (const line of sorted) await ship(tx, line, ctx);
}
