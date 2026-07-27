import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
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
    OrderModule,
    ShippingModule,
  ],
})
export class AppModule {}
