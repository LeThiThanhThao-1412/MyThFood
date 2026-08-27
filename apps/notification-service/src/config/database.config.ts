import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { NotificationEntity } from "../modules/notification/notification.entity";

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: "postgres",
  host: configService.get<string>("DATABASE_HOST") ?? "localhost",
  port: configService.get<number>("DATABASE_PORT") ?? 5432,
  username: configService.get<string>("DATABASE_USER") ?? "mythfood",
  password: configService.get<string>("DATABASE_PASSWORD") ?? "mythfood_secret",
  database:
    configService.get<string>("DATABASE_NAME") ?? "mythfood_notification",
  entities: [NotificationEntity],
  synchronize: configService.get<string>("NODE_ENV") === "development",
  logging: configService.get<string>("NODE_ENV") === "development",
});
