import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hash ເປັນ argon2id ແລະ verify ໄດ້", async () => {
    const hashed = await service.hash("Password123!");
    expect(hashed.startsWith("$argon2id$")).toBe(true);
    expect(await service.verify(hashed, "Password123!")).toBe(true);
    expect(await service.verify(hashed, "wrong-password")).toBe(false);
  });

  it("verify ຄືນ false (ບໍ່ throw) ເມື່ອ hash ເສຍ", async () => {
    expect(await service.verify("not-a-hash", "x")).toBe(false);
  });

  it("verifyDummy ບໍ່ throw", async () => {
    await expect(service.verifyDummy("anything")).resolves.toBeUndefined();
  });
});
