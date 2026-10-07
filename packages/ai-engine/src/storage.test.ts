import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStorage, newStorageKey } from "./storage";

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

  it("get key ທີ່ບໍ່ມີ → throw ພ້ອມ code NOT_FOUND", async () => {
    await expect(storage.get("slips/none")).rejects.toMatchObject({ code: "NOT_FOUND" });
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
    await expect(storage.put(key, new Uint8Array([1]), "image/png")).rejects.toThrow("Invalid storage key");
    await expect(storage.get(key)).rejects.toThrow("Invalid storage key");
  });

  it("ບໍ່ຂຽນທັບ key ເດີມ (ກັນ key ຊ້ຳ)", async () => {
    await storage.put("slips/x", new Uint8Array([1]), "image/png");
    await expect(storage.put("slips/x", new Uint8Array([2]), "image/png")).rejects.toThrow("already exists");
    expect(Array.from((await storage.get("slips/x")).bytes)).toEqual([1]);
  });

  it("ບໍ່ປ່ອຍໄຟລ໌ຊົ່ວຄາວຄ້າງຫຼັງຂຽນສຳເລັດ", async () => {
    await storage.put("slips/y", new Uint8Array([1]), "image/webp");
    const files = await readdir(path.join(dir, "slips"));
    expect(files.sort()).toEqual(["y", "y.mime"]);
  });

  it("ຂຽນໄຟລ໌ຂໍ້ມູນລົ້ມເຫຼວ → ລຶບ sidecar .mime + ໄຟລ໌ຊົ່ວຄາວ ແລະ put ໃໝ່ໄດ້", async () => {
    // ສ້າງໂຟເດີທີ່ path ປາຍທາງ ເພື່ອໃຫ້ rename ຂອງໄຟລ໌ຂໍ້ມູນລົ້ມ
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

  it("ບໍ່ຂຽນຜ່ານ symlink ທີ່ຊີ້ອອກນອກ root", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "oca-outside-"));
    try {
      await symlink(outside, path.join(dir, "link"));
      await expect(storage.put("link/x", new Uint8Array([1]), "image/png")).rejects.toThrow("Invalid storage key");
      expect(await readdir(outside)).toEqual([]);
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
