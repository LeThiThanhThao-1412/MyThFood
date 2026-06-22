import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { UserEntity } from './infrastructure/user.entity';
import { UserRepository } from './infrastructure/user.repository';
import { RegisterUserHandler } from './application/commands/register-user.handler';

const CommandHandlers = [RegisterUserHandler];

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([UserEntity])],
  providers: [
    ...CommandHandlers,
    UserRepository,
  ],
  exports: [CqrsModule, UserRepository],
})
export class UserModule {}