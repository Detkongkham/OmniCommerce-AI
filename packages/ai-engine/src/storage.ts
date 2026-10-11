import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredFile {
  bytes: Uint8Array;
  mime: string;
}

/**
 * ບ່ອນເກັບໄຟລ໌. ປ່ຽນເປັນ S3/R2 ໄດ້ພາຍຫຼັງ ໂດຍບໍ່ແກ້ຜູ້ໃຊ້. key ມາຈາກລະບົບເທົ່ານັ້ນ (ບໍ່ແມ່ນ input ຜູ້ໃຊ້).
 * - interface ອີງ buffer (ທັງໄຟລ໌ຢູ່ໃນໜ່ວຍຄວາມຈຳ) ໂດຍເຈດຕະນາ: ຮູບສະລິບມີຂະໜາດນ້ອຍ.
 * - ຂະໜາດສູງສຸດເປັນໜ້າທີ່ຂອງຜູ້ເອີ້ນ (ກວດກ່ອນ put); storage ບໍ່ຈຳກັດ.
 * - mime ເກັບຕາມທີ່ໃຫ້ມາ ບໍ່ກວດ; ຜູ້ເອີ້ນຕ້ອງຫາ mime ເອງຈາກການ sniff bytes.
 */
export interface StorageService {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<StoredFile>;
  /** ລຶບໄຟລ໌ + sidecar; idempotent (ບໍ່ມີ = ບໍ່ເປັນ error). ໃຊ້ເກັບກວາດໄຟລ໌ກຳພ້າ */
  delete(key: string): Promise<void>;
}

/** error ທັງໝົດຂອງ storage ມີ `code` ໃຫ້ຜູ້ເອີ້ນແຍກປະເພດ */
export abstract class StorageError extends Error {
  abstract readonly code: "NOT_FOUND" | "INVALID_KEY" | "ALREADY_EXISTS";
}

export class StorageNotFoundError extends StorageError {
  readonly code = "NOT_FOUND";
  constructor(key: string) {
    super(`Storage key not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}

export class StorageInvalidKeyError extends StorageError {
  readonly code = "INVALID_KEY";
  constructor(key: string) {
    super(`Invalid storage key: ${JSON.stringify(key)}`);
    this.name = "StorageInvalidKeyError";
  }
}

export class StorageKeyExistsError extends StorageError {
  readonly code = "ALREADY_EXISTS";
  constructor(key: string) {
    super(`Storage key already exists: ${key}`);
    this.name = "StorageKeyExistsError";
  }
}

/** key ໃໝ່: `<prefix>/<yyyy>/<mm>/<uuid>` (UTC). prefix ທີ່ບໍ່ປອດໄພຈະຖືກປະຕິເສດຕອນ put/get (ບໍ່ກວດຢູ່ນີ້) */
export function newStorageKey(prefix: string, at: Date = new Date()): string {
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}/${at.getUTCFullYear()}/${month}/${randomUUID()}`;
}

const SAFE_KEY = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
// ຄວາມຍາວ: segment ≤ 200 ເພື່ອເຫຼືອບ່ອນໃຫ້ຕໍ່ທ້າຍ `.<uuid>.tmp` (200+1+36+4=241 ≤ 255 ຂອງຊື່ໄຟລ໌; `.mime` ສັ້ນກວ່າ)
const MAX_KEY_LENGTH = 512;
const MAX_SEGMENT_LENGTH = 200;
// ຊື່ທ້າຍທີ່ສະຫງວນໃຫ້ໄຟລ໌ຂ້າງຄຽງ (ປຽບທຽບແບບບໍ່ແຍກຕົວພິມ ເພາະ macOS/Windows ບໍ່ແຍກ)
const RESERVED_SUFFIX = /\.(mime|tmp)$/i;

/** p ຢູ່ໃນ root (ຫຼືແມ່ນ root ເອງ) ຫຼືບໍ່ — ທັງສອງເປັນ path ສົມບູນທີ່ resolve ແລ້ວ */
function isInside(root: string, p: string): boolean {
  return p === root || p.startsWith(root + path.sep);
}

function assertSafeKey(key: string): void {
  if (key.length > MAX_KEY_LENGTH || !SAFE_KEY.test(key)) throw new StorageInvalidKeyError(key);
  for (const segment of key.split("/")) {
    // segment ຈຸດລ້ວນ (".", "..", "...") ຫ້າມ ເພື່ອກັນ path traversal
    if (segment.length > MAX_SEGMENT_LENGTH || /^\.+$/.test(segment)) throw new StorageInvalidKeyError(key);
    // ກັນຊົນກັບ sidecar `<key>.mime` ແລະ ໄຟລ໌ຊົ່ວຄາວ `.tmp`
    if (RESERVED_SUFFIX.test(segment)) throw new StorageInvalidKeyError(key);
  }
}

/** ເກັບໃນໂຟເດີຂອງເຄື່ອງ: ໄຟລ໌ `<root>/<key>` + `<root>/<key>.mime`. ບໍ່ຮອງຮັບຫຼາຍ instance ທີ່ບໍ່ໃຊ້ volume ຮ່ວມ. */
export class LocalDiskStorage implements StorageService {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (full === path.resolve(this.root) || !isInside(path.resolve(this.root), full)) throw new StorageInvalidKeyError(key);
    return full;
  }

  async put(key: string, bytes: Uint8Array, mime: string): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    // ກັນ symlink: ໂຟເດີຈິງ (ຫຼັງ resolve symlink) ຕ້ອງຢູ່ໃນ root ຈິງ
    if (!isInside(await realpath(this.root), await realpath(path.dirname(target)))) throw new StorageInvalidKeyError(key);

    const sidecar = `${target}.mime`;
    const temp = `${target}.${randomUUID()}.tmp`;
    // flag "wx" ບໍ່ຂຽນທັບ ແລະ ບໍ່ຕາມ symlink; sidecar ເປັນຕົວຈອງ key
    try {
      await writeFile(sidecar, mime, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new StorageKeyExistsError(key);
      throw error;
    }
    // ຂຽນໄຟລ໌ຊົ່ວຄາວແລ້ວ rename ເພື່ອບໍ່ໃຫ້ມີໄຟລ໌ເຄິ່ງສຳເລັດ; ຖ້າລົ້ມ ລຶບ sidecar+temp (best effort) ເພື່ອໃຫ້ put key ນີ້ໃໝ່ໄດ້
    try {
      await writeFile(temp, bytes, { flag: "wx" });
      await rename(temp, target);
    } catch (error) {
      await Promise.allSettled([rm(temp, { force: true }), rm(sidecar, { force: true })]);
      throw error;
    }
  }

  async get(key: string): Promise<StoredFile> {
    const target = this.pathFor(key);
    try {
      // ຕ້ອງມີທັງສອງໄຟລ໌ ຈຶ່ງຄືນຄ່າ; ຂາດອັນໃດອັນໜຶ່ງ → ENOENT → NOT_FOUND
      const sidecar = `${target}.mime`;
      // ກັນ symlink ຕອນອ່ານ: ໄຟລ໌ຈິງທັງສອງຕ້ອງຢູ່ໃນ root ຈິງ
      const realRoot = await realpath(this.root);
      const [realData, realSidecar] = await Promise.all([realpath(target), realpath(sidecar)]);
      if (!isInside(realRoot, realData) || !isInside(realRoot, realSidecar)) throw new StorageInvalidKeyError(key);
      const [buf, mime] = await Promise.all([readFile(realData), readFile(realSidecar, "utf8")]);
      // ບໍ່ copy: ສົ່ງ view ຂອງ Buffer ເດີມ
      return { bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.length), mime };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageNotFoundError(key);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.pathFor(key);
    try {
      // ກັນ symlink ຂອງໂຟເດີ: ໂຟເດີຈິງຕ້ອງຢູ່ໃນ root ຈິງ (ໂຟເດີບໍ່ມີ = ບໍ່ມີຫຍັງໃຫ້ລຶບ)
      if (!isInside(await realpath(this.root), await realpath(path.dirname(target)))) throw new StorageInvalidKeyError(key);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    // rm ໄຟລ໌ symlink ລຶບຕົວ link ເອງ ບໍ່ຕາມໄປລຶບປາຍທາງ; force = ບໍ່ມີກໍ່ບໍ່ error
    await Promise.all([rm(target, { force: true }), rm(`${target}.mime`, { force: true })]);
  }
}
