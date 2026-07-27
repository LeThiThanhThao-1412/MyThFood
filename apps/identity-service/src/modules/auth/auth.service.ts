import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CommandBus } from "@nestjs/cqrs";
import { Result, DomainError } from "@mythfood/shared-kernel";
import { UserRepository } from "../user/infrastructure/user.repository";
import { User } from "../user/domain/user.aggregate";
import { UserId } from "../user/domain/user-id";
import { Password } from "../user/domain/password.vo";
import { RegisterUserCommand } from "../user/application/commands/register-user.command";
import { UserRole } from "../user/domain/user.aggregate";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    phone: string;
    fullName: string;
    roles: string[];
  };
}

/** Allowed roles for self-registration (cannot self-assign elevated roles) */
const ALLOWED_SELF_REGISTER_ROLES: UserRole[] = ["CONSUMER", "DRIVER"];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly commandBus: CommandBus,
    private readonly userRepository: UserRepository,
  ) {}

  async register(dto: {
    phoneNumber: string;
    fullName: string;
    password: string;
    email?: string;
    roles?: string[];
    deviceId?: string;
    ipAddress?: string;
  }): Promise<User> {
    // FIX #19: Sanitize roles - never trust client-provided roles blindly.
    // Only allow CONSUMER and DRIVER during self-registration.
    // ADMIN, MERCHANT_OWNER, MERCHANT_STAFF must be assigned by admin.
    let sanitizedRoles = dto.roles ?? [];
    if (sanitizedRoles.length === 0) {
      sanitizedRoles = ["CONSUMER"];
    }
    sanitizedRoles = sanitizedRoles.filter((r) =>
      ALLOWED_SELF_REGISTER_ROLES.includes(r as UserRole),
    );
    if (sanitizedRoles.length === 0) {
      sanitizedRoles = ["CONSUMER"];
    }
    this.logger.log(
      `Register roles: requested=${dto.roles}, sanitized=${sanitizedRoles}`,
    );

    const command = new RegisterUserCommand(
      dto.phoneNumber,
      dto.fullName,
      dto.password,
      dto.email,
      sanitizedRoles,
      dto.deviceId,
      dto.ipAddress,
    );

    const result = await this.commandBus.execute<
      RegisterUserCommand,
      Result<User, DomainError>
    >(command);

    if (result.isFailure || !result.value) {
      throw new UnauthorizedException(
        result.error?.message ?? "Registration failed",
      );
    }

    return result.value;
  }

  async login(phoneNumber: string, password: string): Promise<AuthTokens> {
    const user = await this.userRepository.findByPhone(phoneNumber);
    if (!user) {
      throw new UnauthorizedException("Invalid phone number or password");
    }

    if (!user.isActive()) {
      throw new UnauthorizedException("Account is not active");
    }

    const isValid = await user.verifyPassword(password);
    if (!isValid) {
      throw new UnauthorizedException("Invalid phone number or password");
    }

    user.recordLogin();
    await this.userRepository.save(user);

    return this.generateTokens(user);
  }

  async validateUser(userId: string): Promise<User | null> {
    const id = UserId.from(userId);
    return this.userRepository.findById(id);
  }

  private generateTokens(user: User): AuthTokens {
    const payload = {
      sub: user.id.toString(),
      phone: user.phone,
      roles: user.userRoles,
    };

    // Access token: short-lived (1h from config)
    const accessToken = this.jwtService.sign(payload);

    // FIX #7: Generate actual refresh token with longer expiry
    const refreshPayload = {
      sub: user.id.toString(),
      type: "refresh",
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: process.env.JWT_REFRESH_EXPIRATION ?? "7d",
      secret: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET,
    });

    const decoded = this.jwtService.decode(accessToken) as { exp: number };

    return {
      accessToken,
      refreshToken,
      expiresIn: decoded.exp,
      user: {
        id: user.id.toString(),
        phone: user.phone,
        fullName: user.displayName,
        roles: user.userRoles,
      },
    };
  }

  // ---- Change Password (FIX #18: removed inline require) ----
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const id = UserId.from(userId);
    const user = await this.userRepository.findById(id);
    if (!user) throw new UnauthorizedException("User not found");

    const isValid = await user.verifyPassword(currentPassword);
    if (!isValid) throw new UnauthorizedException("Current password is incorrect");

    const pwResult = await Password.create(newPassword);
    if (pwResult.isFailure) {
      throw new UnauthorizedException(pwResult.error?.message ?? "Invalid new password");
    }
    user.changePassword(pwResult.value);
    await this.userRepository.save(user);
  }

  // ---- Refresh Token (FIX #7: verify separate refresh token) ----
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const refreshSecret = process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET;
      const payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Invalid token type");
      }

      const user = await this.userRepository.findById(UserId.from(payload.sub));
      if (!user) throw new UnauthorizedException("Invalid refresh token");

      if (!user.isActive()) {
        throw new UnauthorizedException("Account is no longer active");
      }

      return this.generateTokens(user);
    } catch (err) {
      this.logger.warn(`Refresh token validation failed: ${err}`);
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }
}
