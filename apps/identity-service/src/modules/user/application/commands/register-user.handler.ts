import { Injectable, Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IRepository, Result, DomainError } from "@mythfood/shared-kernel";
import { User, UserRole } from "../../domain/user.aggregate";
import { UserId } from "../../domain/user-id";
import { Password } from "../../domain/password.vo";
import { UserRepository } from "../../infrastructure/user.repository";
import { RegisterUserCommand } from "./register-user.command";

@Injectable()
@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(
    @Inject(UserRepository)
    private readonly userRepository: IRepository<User, UserId>,
  ) {}

  async execute(
    command: RegisterUserCommand,
  ): Promise<Result<User, DomainError>> {
    // Create password value object
    const passwordResult = await Password.create(command.password);
    if (passwordResult.isFailure) {
      return Result.fail(passwordResult.error);
    }

    // Register the user aggregate
    const userResult = User.register({
      phoneNumber: command.phoneNumber,
      email: command.email,
      fullName: command.fullName,
      password: passwordResult.value,
      roles: command.roles as UserRole[] | undefined,
      deviceId: command.deviceId,
      ipAddress: command.ipAddress,
    });

    if (userResult.isFailure) {
      return userResult;
    }

    const user = userResult.value;

    // Persist the aggregate
    await this.userRepository.save(user);

    return Result.ok(user);
  }
}
