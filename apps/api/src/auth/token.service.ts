import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ENV, type Env } from "../config/env";

@Injectable()
export class TokenService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      {},
      {
        subject: userId,
        secret: this.env.JWT_ACCESS_SECRET,
        expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      },
    );
  }

  async verifyAccessToken(token: string): Promise<{ sub: string }> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
      if (!payload.sub) throw new Error("missing sub");
      return { sub: payload.sub };
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  refreshExpiry(from: Date = new Date()): Date {
    return new Date(from.getTime() + this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  }
}
