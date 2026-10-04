import { randomUUID } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@oca/database";
import { type LoginInput, isPermission } from "@oca/shared";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/auth-types";
import { PRISMA } from "../prisma/prisma.module";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

const userInclude = { role: { include: { permissions: true } } } as const;
type UserWithRole = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

function toAuthUser(user: UserWithRole): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleId: user.roleId,
    roleName: user.role.name,
    permissions: user.role.permissions.map((p) => p.permission).filter(isPermission),
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, ctx: RequestContext): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: userInclude,
    });
    if (!user) {
      await this.passwords.verifyDummy(input.password);
      await this.failLogin(input.email, ctx);
      throw new UnauthorizedException("Invalid credentials");
    }
    const passwordOk = await this.passwords.verify(user.passwordHash, input.password);
    if (!passwordOk || !user.isActive) {
      await this.failLogin(input.email, ctx);
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await this.issueSession(user, randomUUID(), ctx);
    await this.audit.record({
      userId: user.id,
      action: "auth.login",
      entity: "User",
      entityId: user.id,
      ip: ctx.ip,
    });
    return session;
  }

  async refresh(token: string | undefined, ctx: RequestContext): Promise<SessionResult> {
    if (!token) throw new UnauthorizedException("Missing refresh token");

    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(token) },
      include: { user: { include: userInclude } },
    });
    if (!row) throw new UnauthorizedException("Invalid refresh token");

    if (row.revokedAt) {
      await this.reportReuse(row.familyId, row.userId, ctx);
      throw new UnauthorizedException("Refresh token reuse detected");
    }
    if (row.expiresAt <= new Date() || !row.user.isActive) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      await this.reportReuse(row.familyId, row.userId, ctx);
      throw new UnauthorizedException("Refresh token reuse detected");
    }
    return this.issueSession(row.user, row.familyId, ctx);
  }

  async logout(token: string | undefined, ctx: RequestContext): Promise<void> {
    if (!token) return;
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(token) },
    });
    if (!row) return;
    await this.revokeFamily(row.familyId);
    await this.audit.record({
      userId: row.userId,
      action: "auth.logout",
      entity: "User",
      entityId: row.userId,
      ip: ctx.ip,
    });
  }

  /** ໂຫຼດ user + permission ປັດຈຸບັນ; null ຖ້າບໍ່ມີ ຫຼື ຖືກປິດ. */
  async getAuthUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: userInclude });
    if (!user || !user.isActive) return null;
    return toAuthUser(user);
  }

  private async issueSession(user: UserWithRole, familyId: string, ctx: RequestContext): Promise<SessionResult> {
    const { token, hash } = this.tokens.generateRefreshToken();
    const expiresAt = this.tokens.refreshExpiry();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        familyId,
        expiresAt,
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
      },
    });
    return {
      accessToken: await this.tokens.signAccessToken(user.id),
      refreshToken: token,
      refreshExpiresAt: expiresAt,
      user: toAuthUser(user),
    };
  }

  private async revokeFamily(familyId: string): Promise<number> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  private async reportReuse(familyId: string, userId: string, ctx: RequestContext): Promise<void> {
    // ຖ້າ family ຖືກ revoke ໝົດແລ້ວ (ບໍ່ມີ token ທີ່ຍັງໃຊ້ໄດ້) ບໍ່ບັນທຶກ reuse ຊ້ຳ.
    const revoked = await this.revokeFamily(familyId);
    if (revoked === 0) return;
    await this.audit.record({
      userId,
      action: "auth.refresh_reuse",
      entity: "User",
      entityId: userId,
      ip: ctx.ip,
    });
  }

  private async failLogin(email: string, ctx: RequestContext): Promise<void> {
    await this.audit.record({
      action: "auth.login_failed",
      entity: "User",
      after: { email },
      ip: ctx.ip,
    });
  }
}
