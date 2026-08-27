import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class ServiceKeyOrJwtGuard
  extends AuthGuard("jwt")
  implements CanActivate
{
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const serviceKey = req.headers?.["x-service-key"];
    const expectedKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    if (serviceKey && serviceKey === expectedKey) {
      (req as any).user = {
        userId: "service",
        phone: "service",
        roles: ["ADMIN"],
      };
      return true;
    }
    return (await super.canActivate(context)) as boolean;
  }
}
