import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "mythfood-jwt-secret-dev",
    });
  }

  async validate(payload: any) {
    if (!payload.sub || !payload.roles) {
      throw new UnauthorizedException("Invalid token payload");
    }
    return {
      id: payload.sub,
      phone: payload.phone,
      roles: payload.roles,
    };
  }
}
