import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { type LoginInput, loginSchema } from "@oca/shared";
import type { Request, Response } from "express";
import type { AuthUser } from "../common/auth-types";
import { CurrentUser, Public } from "../common/decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ENV, type Env } from "../config/env";
import { AuthService, type RequestContext, type SessionResult } from "./auth.service";

const REFRESH_COOKIE = "oca_rt";

function contextOf(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.headers["user-agent"] };
}

function refreshTokenOf(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE];
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(body, contextOf(req));
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(refreshTokenOf(req), contextOf(req));
      this.setRefreshCookie(res, session);
      return { accessToken: session.accessToken, user: session.user };
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(refreshTokenOf(req), contextOf(req));
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.env.NODE_ENV === "production",
      path: this.env.REFRESH_COOKIE_PATH,
    };
  }

  private setRefreshCookie(res: Response, session: SessionResult): void {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      expires: session.refreshExpiresAt,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
