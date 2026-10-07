import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredFile {
  bytes: Uint8Array;
  mime: string;
}

/** ບ່ອນເກັບໄຟລ໌. ປ່ຽນເປັນ S3/R2 ໄດ້ພາຍຫຼັງ ໂດຍບໍ່ແກ້ຜູ້ໃຊ້. key ມາຈາກລະບົບເທົ່ານັ້ນ (ບໍ່ແມ່ນ input ຜູ້ໃຊ້). */
export interface StorageService {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<StoredFile>;
}

export class StorageNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(key: string) {
    super(`Storage key not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}

/** key ໃໝ່: `<prefix>/<yyyy>/<mm>/<uuid>` (UTC) */
export function newStorageKey(prefix: string, at: Date = new Date()): string {
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}/${at.getUTCFullYear()}/${month}/${randomUUID()}`;
}

const SAFE_KEY = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
// ຄວາມຍາວ: segment ≤ 200 ເພື່ອເຫຼືອບ່ອນໃຫ້ຕໍ່ທ້າຍ `.mime` / `.<uuid>.tmp` ໂດຍບໍ່ເກີນ 255 ຂອງຊື່ໄຟລ໌
const MAX_KEY_LENGTH = 512;
const MAX_SEGMENT_LENGTH = 200;
// ຊື່ທ້າຍທີ່ສະຫງວນໃຫ້ໄຟລ໌ຂ້າງຄຽງ (ປຽບທຽບແບບບໍ່ແຍກຕົວພິມ ເພາະ macOS/Windows ບໍ່ແຍກ)
const RESERVED_SUFFIX = /\.(mime|tmp)$/i;

function invalidKey(key: string): Error {
  return new Error(`Invalid storage key: ${JSON.stringify(key)}`);
}

function assertSafeKey(key: string): void {
  if (key.length > MAX_KEY_LENGTH || !SAFE_KEY.test(key)) throw invalidKey(key);
  for (const segment of key.split("/")) {
    // segment ຈຸດລ້ວນ (".", "..", "...") ຫ້າມ ເພື່ອກັນ path traversal
    if (segment.length > MAX_SEGMENT_LENGTH || /^\.+$/.test(segment)) throw invalidKey(key);
    // ກັນຊົນກັບ sidecar `<key>.mime` ແລະ ໄຟລ໌ຊົ່ວຄາວ `.tmp`
    if (RESERVED_SUFFIX.test(segment)) throw invalidKey(key);
  }
}

/** ເກັບໃນໂຟເດີຂອງເຄື່ອງ: ໄຟລ໌ `<root>/<key>` + `<root>/<key>.mime`. ບໍ່ຮອງຮັບຫຼາຍ instance ທີ່ບໍ່ໃຊ້ volume ຮ່ວມ. */
export class LocalDiskStorage implements StorageService {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw invalidKey(key);
    return full;
  }

  async put(key: string, bytes: Uint8Array, mime: string): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    // ກັນ symlink: ໂຟເດີຈິງ (ຫຼັງ resolve symlink) ຕ້ອງຢູ່ໃນ root ຈິງ
    const realRoot = await realpath(this.root);
    const realDir = await realpath(path.dirname(target));
    if (realDir !== realRoot && !realDir.startsWith(realRoot + path.sep)) throw invalidKey(key);

    const sidecar = `${target}.mime`;
    const temp = `${target}.${randomUUID()}.tmp`;
    // flag "wx" ບໍ່ຂຽນທັບ ແລະ ບໍ່ຕາມ symlink; sidecar ເປັນຕົວຈອງ key
    try {
      await writeFile(sidecar, mime, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Storage key already exists: ${key}`);
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
    const target = this.resolve(key);
    try {
      // ຕ້ອງມີທັງສອງໄຟລ໌ ຈຶ່ງຄືນຄ່າ; ຂາດອັນໃດອັນໜຶ່ງ → ENOENT → NOT_FOUND
      const [bytes, mime] = await Promise.all([readFile(target), readFile(`${target}.mime`, "utf8")]);
      return { bytes: new Uint8Array(bytes), mime };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageNotFoundError(key);
      throw error;
    }
  }
}
