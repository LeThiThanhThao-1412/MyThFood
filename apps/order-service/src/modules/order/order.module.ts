import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { OrderController } from "./presentation/order.controller";
import { OrderService } from "./application/order.service";
import { OrderRepository } from "./infrastructure/order.repository";
import { OrderEntity } from "./infrastructure/order.entity";
import { OrderItemEntity } from "./infrastructure/order-item.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, OrderItemEntity]),
    CqrsModule,
    AuthModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService],
})
export class OrderModule {}
