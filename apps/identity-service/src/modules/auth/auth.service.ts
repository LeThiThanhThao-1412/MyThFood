import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CommandBus } from "@nestjs/cqrs";
import { Result, DomainError } from "@mythfood/shared-kernel";
import { UserRepository } from "../user/infrastructure/user.repository";
import { User } from "../user/domain/user.aggregate";
import { UserId } from "../user/domain/user-id";
import { RegisterUserCommand } from "../user/application/commands/register-user.command";

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    phone: string;
    fullName: string;
    roles: string[];
  };
}

@Injectable()
export class AuthService {
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
    const command = new RegisterUserCommand(
      dto.phoneNumber,
      dto.fullName,
      dto.password,
      dto.email,
      dto.roles,
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

    const accessToken = this.jwtService.sign(payload);
    const decoded = this.jwtService.decode(accessToken) as { exp: number };

    return {
      accessToken,
      expiresIn: decoded.exp,
      user: {
        id: user.id.toString(),
        phone: user.phone,
        fullName: user.displayName,
        roles: user.userRoles,
      },
    };
  }
}
