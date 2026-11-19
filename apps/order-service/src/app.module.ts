import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { ScheduleModule } from "@nestjs/schedule";
import {
  InstrumentationModule,
  TraceMiddleware,
} from "@mythfood/instrumentation";
import { databaseConfig } from "./config/database.config";
import { OrderModule } from "./modules/order/order.module";
import { ShippingModule } from "./modules/shipping/shipping.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
      load: [databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        ...configService.get("database"),
      }),
      inject: [ConfigService],
    }),
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    // Ghi log hop (E2) + thay tầng transport theo SERVICE_CLIENT_MODE (E3).
    // Phải nạp trước OrderModule để provider HttpService toàn cục có hiệu lực.
    InstrumentationModule,
    OrderModule,
    ShippingModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Gán/lan truyền x-trace-id cho mọi request vào; middleware cần chạy trước
    // các guard/controller nên áp cho toàn bộ route.
    consumer.apply(TraceMiddleware).forRoutes("*");
  }
}
