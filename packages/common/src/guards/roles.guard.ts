import "reflect-metadata";

/**
 * Role-based access control guard shared across services.
 *
 * - `Roles(...roles)` marks a controller class or handler with the roles allowed.
 * - `RolesGuard` enforces it: if no @Roles() metadata is present, access is allowed
 *   (so unannotated endpoints keep their existing JWT-only behaviour).
 * - Must be chained AFTER the JWT guard so `request.user` is populated:
 *     @UseGuards(AuthGuard("jwt"), RolesGuard)
 *
 * This file deliberately avoids @nestjs/* imports so @mythfood/common does not
 * need @nestjs/common as a dependency.
 */

export const ROLES_KEY = "roles";

export const Roles = (...roles: string[]): ClassDecorator & MethodDecorator =>
  ((target: any, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(
      ROLES_KEY,
      roles,
      descriptor ? descriptor.value : target,
    );
  }) as ClassDecorator & MethodDecorator;

export class RolesGuard {
  canActivate(context: any): boolean {
    const requiredRoles: string[] | undefined =
      Reflect.getMetadata(ROLES_KEY, context.getHandler()) ??
      Reflect.getMetadata(ROLES_KEY, context.getClass());

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest()?.user;
    if (!user || !Array.isArray(user.roles)) {
      return false;
    }

    return requiredRoles.some((role: string) => user.roles.includes(role));
  }
}
