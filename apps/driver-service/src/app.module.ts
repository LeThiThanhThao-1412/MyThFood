import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { getDatabaseConfig } from "./config/database.config";
import { AuthModule } from "./modules/auth/auth.module";
import { DriverModule } from "./modules/driver/driver.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        getDatabaseConfig({
          DATABASE_HOST: config.get("DATABASE_HOST"),
          DATABASE_PORT: config.get("DATABASE_PORT"),
          DATABASE_NAME: config.get("DATABASE_NAME"),
          DATABASE_USER: config.get("DATABASE_USER"),
          DATABASE_PASSWORD: config.get("DATABASE_PASSWORD"),
          NODE_ENV: config.get("NODE_ENV"),
        }),
    }),
    AuthModule,
    DriverModule,
  ],
})
export class AppModule {}
