import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { UserEntity } from "./infrastructure/user.entity";
import { UserRepository } from "./infrastructure/user.repository";
import { RegisterUserHandler } from "./application/commands/register-user.handler";
import { UserAdminService } from "./application/user-admin.service";
import { UserAdminController } from "./presentation/user-admin.controller";
import { RolesGuard } from "../auth/guards/roles.guard";

const CommandHandlers = [RegisterUserHandler];
const Services = [UserAdminService];
const Controllers = [UserAdminController];
const Guards = [RolesGuard];

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([UserEntity])],
  providers: [...CommandHandlers, ...Services, UserRepository, ...Guards],
  controllers: [...Controllers],
  exports: [CqrsModule, UserRepository],
})
export class UserModule {}
