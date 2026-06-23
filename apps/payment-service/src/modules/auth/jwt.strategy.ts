import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || "mythfood_jwt_super_secret_key_dev_only",
    });
  }

  async validate(payload: { sub: string; phone: string; roles: string[] }) {
    return { userId: payload.sub, phone: payload.phone, roles: payload.roles };
  }
}
