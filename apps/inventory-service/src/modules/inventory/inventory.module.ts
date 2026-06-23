import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { InventoryController } from './presentation/inventory.controller';
import { InventoryService } from './application/inventory.service';
import { InventoryRepository } from './infrastructure/inventory.repository';
import { InventoryEntity } from './infrastructure/inventory.entity';
import { InventoryReservationEntity } from './infrastructure/inventory-reservation.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryEntity, InventoryReservationEntity]),
    CqrsModule,
    ScheduleModule.forRoot(),
    AuthModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository],
  exports: [InventoryService],
})
export class InventoryModule {}