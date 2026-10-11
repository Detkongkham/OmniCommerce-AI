import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LocalDiskStorage,
  StorageError,
  StorageInvalidKeyError,
  StorageKeyExistsError,
  StorageNotFoundError,
  newStorageKey,
} from "./storage";

describe("LocalDiskStorage", () => {
  let dir: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "oca-storage-"));
    storage = new LocalDiskStorage(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("put ແລ້ວ get ໄດ້ bytes + mime ຄືເກົ່າ", async () => {
    await storage.put("slips/2026/10/abc", new Uint8Array([1, 2, 3, 255]), "image/png");
    const got = await storage.get("slips/2026/10/abc");
    expect(Array.from(got.bytes)).toEqual([1, 2, 3, 255]);
    expect(got.mime).toBe("image/png");
  });

  it("delete ລຶບໄຟລ໌ + sidecar ແລ້ວ get → NOT_FOUND ແລະ put key ເດີມໃໝ່ໄດ້", async () => {
    await storage.put("slips/a/b", new Uint8Array([1, 2]), "image/png");
    await storage.delete("slips/a/b");
    await expect(storage.get("slips/a/b")).rejects.toBeInstanceOf(StorageNotFoundError);
    expect(await readdir(path.join(dir, "slips/a"))).toEqual([]);
    await storage.put("slips/a/b", new Uint8Array([3]), "image/jpeg");
    expect((await storage.get("slips/a/b")).mime).toBe("image/jpeg");
  });

  it("delete key ທີ່ບໍ່ມີ (ຫຼື ໂຟເດີບໍ່ມີ) = no-op ບໍ່ throw", async () => {
    await expect(storage.delete("slips/none/x")).resolves.toBeUndefined();
    await storage.put("slips/a/b", new Uint8Array([1]), "image/png");
    await storage.delete("slips/a/b");
    await expect(storage.delete("slips/a/b")).resolves.toBeUndefined();
  });

  it("delete ປະຕິເສດ key ທີ່ບໍ່ປອດໄພ", async () => {
    await expect(storage.delete("../x")).rejects.toBeInstanceOf(StorageInvalidKeyError);
    await expect(storage.delete("a/b.mime")).rejects.toBeInstanceOf(StorageInvalidKeyError);
  });

  it("get key ທີ່ບໍ່ມີ → throw ພ້ອມ code NOT_FOUND", async () => {
    const error = await storage.get("slips/none").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageNotFoundError);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    "../escape",
    "/abs/path",
    "a/../../b",
    "a//b",
    "",
    "a/\0b",
    "a\\b",
    // ເພີ່ມ: segment . / .. / ຈຸດລ້ວນ, encoded, ຊື່ທີ່ຊົນກັບໄຟລ໌ຂ້າງຄຽງ, ຍາວເກີນ
    "..",
    ".",
    "a/./b",
    "a/..",
    "a/../b",
    "./a",
    "a/",
    "...",
    "..%2fescape",
    "%2e%2e/escape",
    "a%2fb",
    "C:\\windows",
    "a b",
    "slips/x.mime",
    "slips/x.MIME",
    "slips/x.tmp",
    "slips/x.Tmp",
    "slips/x.mime/y",
    "a".repeat(201),
    `${"a/".repeat(300)}a`,
  ])("ປະຕິເສດ key ອັນຕະລາຍ %j", async (key) => {
    for (const op of [() => storage.put(key, new Uint8Array([1]), "image/png"), () => storage.get(key)]) {
      const error = await op().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StorageInvalidKeyError);
      expect(error).toBeInstanceOf(StorageError);
      expect(error).toMatchObject({ code: "INVALID_KEY" });
    }
  });

  it("ບໍ່ຂຽນທັບ key ເດີມ (ກັນ key ຊ້ຳ)", async () => {
    await storage.put("slips/x", new Uint8Array([1]), "image/png");
    const error = await storage.put("slips/x", new Uint8Array([2]), "image/png").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageKeyExistsError);
    expect(error).toMatchObject({ code: "ALREADY_EXISTS" });
    expect(Array.from((await storage.get("slips/x")).bytes)).toEqual([1]);
  });

  it("ບໍ່ປ່ອຍໄຟລ໌ຊົ່ວຄາວຄ້າງຫຼັງຂຽນສຳເລັດ", async () => {
    await storage.put("slips/y", new Uint8Array([1]), "image/webp");
    const files = await readdir(path.join(dir, "slips"));
    expect(files.sort()).toEqual(["y", "y.mime"]);
  });

  it("ຂຽນໄຟລ໌ຂໍ້ມູນລົ້ມເຫຼວ → ລຶບ sidecar .mime + ໄຟລ໌ຊົ່ວຄາວ ແລະ put ໃໝ່ໄດ້", async () => {
    // ສ້າງໂຟເດີທີ່ path ປາຍທາງ ເພື່ອໃຫ້ rename ຂອງໄຟລ໌ຂໍ້ມູນລົ້ມ
    // (ໃຊ້ພຶດຕິກຳ POSIX: rename ໄຟລ໌ທັບໂຟເດີ → ລົ້ມ; ທົດສອບເສັ້ນທາງ cleanup ໃນ macOS/Linux)
    await mkdir(path.join(dir, "slips/z"), { recursive: true });
    await expect(storage.put("slips/z", new Uint8Array([1]), "image/png")).rejects.toThrow();
    expect((await readdir(path.join(dir, "slips"))).sort()).toEqual(["z"]);
    await rm(path.join(dir, "slips/z"), { recursive: true });
    await storage.put("slips/z", new Uint8Array([9]), "image/png");
    expect(Array.from((await storage.get("slips/z")).bytes)).toEqual([9]);
  });

  it("get ບໍ່ຄືນໄຟລ໌ເມື່ອມີແຕ່ໄຟລ໌ດຽວ (ມີແຕ່ sidecar ຫຼື ມີແຕ່ຂໍ້ມູນ)", async () => {
    await mkdir(path.join(dir, "slips"), { recursive: true });
    await writeFile(path.join(dir, "slips/onlymime.mime"), "image/png");
    await writeFile(path.join(dir, "slips/onlydata"), new Uint8Array([1]));
    await expect(storage.get("slips/onlymime")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(storage.get("slips/onlydata")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("ຂຽນ key ດຽວກັນພ້ອມກັນ → ສຳເລັດພຽງອັນດຽວ ແລະ ຂໍ້ມູນບໍ່ເສຍ", async () => {
    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5].map((n) => storage.put("slips/race", new Uint8Array([n]), "image/png")),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(StorageKeyExistsError);
    }
    const got = await storage.get("slips/race");
    expect(got.bytes).toHaveLength(1);
    expect(got.mime).toBe("image/png");
    expect((await readdir(path.join(dir, "slips"))).sort()).toEqual(["race", "race.mime"]);
  });

  it("ບໍ່ຂຽນ/ອ່ານຜ່ານ symlink ທີ່ຊີ້ອອກນອກ root", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "oca-outside-"));
    try {
      try {
        await symlink(outside, path.join(dir, "link"));
      } catch (error) {
        // ບາງລະບົບ (ເຊັ່ນ Windows ທີ່ບໍ່ມີສິດ) ສ້າງ symlink ບໍ່ໄດ້ → ຂ້າມ test
        if ((error as NodeJS.ErrnoException).code === "EPERM") return;
        throw error;
      }
      await expect(storage.put("link/x", new Uint8Array([1]), "image/png")).rejects.toBeInstanceOf(StorageInvalidKeyError);
      expect(await readdir(outside)).toEqual([]);

      // ອ່ານ: ໄຟລ໌ຂໍ້ມູນ + sidecar ເປັນ symlink ຊີ້ອອກນອກ root
      await writeFile(path.join(outside, "secret"), "secret");
      await writeFile(path.join(outside, "secret.mime"), "text/plain");
      await symlink(path.join(outside, "secret"), path.join(dir, "leak"));
      await symlink(path.join(outside, "secret.mime"), path.join(dir, "leak.mime"));
      await expect(storage.get("leak")).rejects.toBeInstanceOf(StorageInvalidKeyError);
      await expect(storage.get("link/secret")).rejects.toBeInstanceOf(StorageInvalidKeyError);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("newStorageKey", () => {
  it("ຮູບແບບ slips/<yyyy>/<mm>/<id> ແລະ ບໍ່ຊ້ຳ", () => {
    const at = new Date("2026-10-07T00:00:00.000Z");
    const a = newStorageKey("slips", at);
    const b = newStorageKey("slips", at);
    expect(a).toMatch(/^slips\/2026\/10\/[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});
