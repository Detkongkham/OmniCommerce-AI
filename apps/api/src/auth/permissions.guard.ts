import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Permission, hasPermission } from "@oca/shared";
import type { AuthenticatedRequest } from "../common/auth-types";
import { PERMISSIONS_KEY } from "../common/decorators";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user as
      | AuthenticatedRequest["user"]
      | undefined;
    if (!user || !required.every((permission) => hasPermission(user.permissions, permission))) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}
