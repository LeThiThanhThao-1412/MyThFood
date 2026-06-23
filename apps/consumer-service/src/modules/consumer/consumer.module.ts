import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { AuthModule } from "../auth/auth.module";
import { ConsumerController } from "./presentation/consumer.controller";
import { ConsumerService } from "./application/consumer.service";
import { ConsumerRepository } from "./infrastructure/consumer.repository";
import { ConsumerEntity } from "./infrastructure/consumer.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ConsumerEntity]), CqrsModule, AuthModule],
  controllers: [ConsumerController],
  providers: [ConsumerService, ConsumerRepository],
  exports: [ConsumerService],
})
export class ConsumerModule {}
