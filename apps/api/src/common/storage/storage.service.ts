import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";

/** key = ສຸ່ມ 128 bit (hex) + ນາມສະກຸນ; ກວດທຸກຄັ້ງກ່ອນແຕະ disk (ກັນ path traversal) */
const KEY_PATTERN = /^[a-f0-9]{32}\.(?:jpg|png|webp)$/;

export function isStorageKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/**
 * ເກັບໄຟລ໌ເທິງ disk ທີ່ `MEDIA_DIR` (ໂຟນເດີດຽວ, server ດຽວ). ໂມດູນອື່ນ (ເຊັ່ນ ສະລິບ) ໃຊ້ຮ່ວມໄດ້;
 * ການເປີດໃຫ້ດາວໂຫຼດ (public ຫຼື ຕ້ອງ login) ເປັນໜ້າທີ່ຂອງ controller ຂອງແຕ່ລະໂມດູນ.
 */
@Injectable()
export class StorageService {
  readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.MEDIA_DIR);
  }

  newKey(extension: "jpg" | "png" | "webp"): string {
    return `${randomBytes(16).toString("hex")}.${extension}`;
  }

  pathOf(key: string): string {
    if (!isStorageKey(key)) throw new Error("Invalid storage key");
    return join(this.root, key);
  }

  /** ຂຽນໄຟລ໌ຊົ່ວຄາວແລ້ວ rename: ຜູ້ອ່ານບໍ່ເຫັນໄຟລ໌ເຄິ່ງໆ */
  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathOf(key);
    await mkdir(this.root, { recursive: true });
    const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(temp, data, { flag: "wx" });
    await rename(temp, target);
  }

  /** ບໍ່ມີໄຟລ໌ = null */
  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
