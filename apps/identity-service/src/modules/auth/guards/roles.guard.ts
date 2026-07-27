import { Injectable, CanActivate, ExecutionContext, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

export const ROLES_KEY = "roles";

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Role hierarchy: higher roles inherit all permissions from lower roles.
 * e.g., ADMIN can access endpoints requiring CONSUMER, DRIVER, MERCHANT, etc.
 */
const ROLE_HIERARCHY: Record<string, string[]> = {
  ADMIN: ["ADMIN", "MERCHANT_OWNER", "MERCHANT_STAFF", "DRIVER", "CONSUMER"],
  MERCHANT_OWNER: ["MERCHANT_OWNER", "MERCHANT_STAFF"],
  MERCHANT_STAFF: ["MERCHANT_STAFF"],
  DRIVER: ["DRIVER"],
  CONSUMER: ["CONSUMER"],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    const userRoles: string[] = user.roles ?? [];

    // FIX #12: Check role hierarchy - user has access if any of their
    // roles (or inherited roles) match the required roles
    return requiredRoles.some((requiredRole) => {
      return userRoles.some((userRole) => {
        const inheritedRoles = ROLE_HIERARCHY[userRole] ?? [userRole];
        return inheritedRoles.includes(requiredRole);
      });
    });
  }
}
