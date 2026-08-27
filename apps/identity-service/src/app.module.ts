import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./modules/auth/auth.module";
import { UserModule } from "./modules/user/user.module";
import { databaseConfig } from "./config/database.config";

@Module({
  imports: [
    // Global config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: [".env", ".env.local"],
    }),

    // Rate limiting - configurable via env (ISSUE: throttle TTL=0 to disable in dev/test)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = parseInt(config.get("THROTTLE_TTL") ?? "1000", 10);
        const limit = parseInt(config.get("THROTTLE_LIMIT") ?? "3", 10);
        // If TTL=0, bind a large limit effectively disabling throttling
        if (ttl === 0) {
          return [
            { name: "short", ttl: 60000, limit: 999999 },
            { name: "medium", ttl: 60000, limit: 999999 },
            { name: "long", ttl: 60000, limit: 999999 },
          ];
        }
        return [
          { name: "short", ttl, limit },
          { name: "medium", ttl: ttl * 10, limit: limit * 7 },
          { name: "long", ttl: ttl * 60, limit: limit * 33 },
        ];
      },
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.get("database")!,
    }),

    // CQRS
    CqrsModule.forRoot(),

    // Feature modules
    AuthModule,
    UserModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
