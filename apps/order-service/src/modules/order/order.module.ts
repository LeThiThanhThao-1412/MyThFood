import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { HttpModule } from "@nestjs/axios";
import { OrderController } from "./presentation/order.controller";
import {
  OrderChangeController,
  OrderChangeRequestController,
} from "./presentation/order-change.controller";
import { OrderService } from "./application/order.service";
import { OrderScheduler } from "./application/order.scheduler";
import { OrderChangeService } from "./application/order-change.service";
import { OrderChangeScheduler } from "./application/order-change.scheduler";
import { OrderTimelineHandler } from "./application/order-timeline.handler";
import { OrderGateway } from "./gateway/order.gateway";
import { OrderRepository } from "./infrastructure/order.repository";
import { OrderEntity } from "./infrastructure/order.entity";
import { OrderItemEntity } from "./infrastructure/order-item.entity";
import { OrderTimelineEntity } from "./infrastructure/order-timeline.entity";
import { OrderTimelineRepository } from "./infrastructure/order-timeline.repository";
import { OrderChangeRequestEntity } from "./infrastructure/order-change-request.entity";
import { OrderChangeRequestRepository } from "./infrastructure/order-change-request.repository";
import { OrderAdjustmentEntity } from "./infrastructure/order-adjustment.entity";
import { OrderAdjustmentRepository } from "./infrastructure/order-adjustment.repository";
import { MerchantComplianceService } from "./application/merchant-compliance.service";
import { MerchantComplianceRepository } from "./infrastructure/merchant-compliance.repository";
import { MerchantComplianceStateEntity } from "./infrastructure/merchant-compliance-state.entity";
import { MerchantCompliancePenaltyEntity } from "./infrastructure/merchant-compliance-penalty.entity";
import { OrderWarningEntity } from "./infrastructure/order-warning.entity";
import { OrderWarningRepository } from "./infrastructure/order-warning.repository";
import { OrderWarningService } from "./application/order-warning.service";
import { AuthModule } from "../auth/auth.module";
import { CacheModule } from "../cache/cache.module";
import { ShippingModule } from "../shipping/shipping.module";
import { IdempotencyInterceptor } from "../cache/idempotency.interceptor";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      OrderTimelineEntity,
      OrderChangeRequestEntity,
      OrderAdjustmentEntity,
      MerchantComplianceStateEntity,
      MerchantCompliancePenaltyEntity,
      OrderWarningEntity,
    ]),
    CqrsModule,
    AuthModule,
    HttpModule,
    CacheModule,
    ShippingModule,
  ],
  controllers: [
    OrderController,
    OrderChangeController,
    OrderChangeRequestController,
  ],
  providers: [
    OrderService,
    OrderScheduler,
    OrderChangeService,
    OrderChangeScheduler,
    OrderTimelineHandler,
    OrderGateway,
    OrderRepository,
    OrderTimelineRepository,
    OrderChangeRequestRepository,
    OrderAdjustmentRepository,
    MerchantComplianceService,
    MerchantComplianceRepository,
    OrderWarningService,
    OrderWarningRepository,
    IdempotencyInterceptor,
  ],
  exports: [
    OrderService,
    OrderChangeService,
    OrderGateway,
    OrderWarningService,
  ],
})
export class OrderModule {}
