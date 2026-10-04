import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { TokenService } from "./token.service";

const env = {
  JWT_ACCESS_SECRET: "a".repeat(32),
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 7,
} as Env;

const service = new TokenService(new JwtService(), env);

describe("TokenService", () => {
  it("sign ແລະ verify access token ໄດ້ sub ຄືນ", async () => {
    const token = await service.signAccessToken("user-1");
    expect(await service.verifyAccessToken(token)).toMatchObject({ sub: "user-1" });
  });

  it("ປະຕິເສດ token ທີ່ເຊັນດ້ວຍ secret ອື່ນ, ຖືກແກ້ໄຂ ແລະ token ຂີ້ເຫຍື້ອ", async () => {
    const other = new TokenService(new JwtService(), { ...env, JWT_ACCESS_SECRET: "b".repeat(32) });
    const foreign = await other.signAccessToken("user-1");
    await expect(service.verifyAccessToken(foreign)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.verifyAccessToken("garbage")).rejects.toBeInstanceOf(UnauthorizedException);

    const valid = await service.signAccessToken("user-1");
    await expect(service.verifyAccessToken(`${valid}x`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refresh token ສຸ່ມທຸກຄັ້ງ ແລະ hash ຄົງທີ່ (ບໍ່ເທົ່າກັບ token)", () => {
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(service.hashRefreshToken(a.token));
    expect(a.hash).not.toBe(a.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refreshExpiry ເທົ່າກັບ 7 ວັນຈາກເວລາທີ່ໃຫ້", () => {
    const from = new Date("2026-10-04T00:00:00.000Z");
    expect(service.refreshExpiry(from).toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });
});
