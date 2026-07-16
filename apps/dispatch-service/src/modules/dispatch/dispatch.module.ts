import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DispatchEntity } from "./infrastructure/dispatch.entity";
import { DispatchRepository } from "./infrastructure/dispatch.repository";
import { DispatchService } from "./application/dispatch.service";
import { DispatchController } from "./presentation/dispatch.controller";

@Module({
  imports: [TypeOrmModule.forFeature([DispatchEntity])],
  controllers: [DispatchController],
  providers: [DispatchRepository, DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
