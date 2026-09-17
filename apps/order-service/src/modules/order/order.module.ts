import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { HttpModule } from "@nestjs/axios";
import { OrderController } from "./presentation/order.controller";
import { OrderService } from "./application/order.service";
import { OrderScheduler } from "./application/order.scheduler";
import { OrderTimelineHandler } from "./application/order-timeline.handler";
import { OrderGateway } from "./gateway/order.gateway";
import { OrderRepository } from "./infrastructure/order.repository";
import { OrderEntity } from "./infrastructure/order.entity";
import { OrderItemEntity } from "./infrastructure/order-item.entity";
import { OrderTimelineEntity } from "./infrastructure/order-timeline.entity";
import { OrderTimelineRepository } from "./infrastructure/order-timeline.repository";
import { AuthModule } from "../auth/auth.module";
import { CacheModule } from "../cache/cache.module";
import { IdempotencyInterceptor } from "../cache/idempotency.interceptor";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      OrderTimelineEntity,
    ]),
    CqrsModule,
    AuthModule,
    HttpModule,
    CacheModule,
  ],
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderScheduler,
    OrderTimelineHandler,
    OrderGateway,
    OrderRepository,
    OrderTimelineRepository,
    IdempotencyInterceptor,
  ],
  exports: [OrderService, OrderGateway],
})
export class OrderModule {}
