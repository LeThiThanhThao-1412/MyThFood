import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { DriverEntity } from "../modules/driver/infrastructure/driver.entity";

export function getDatabaseConfig(
  env: Record<string, string | undefined>,
): TypeOrmModuleOptions {
  return {
    type: "postgres",
    host: env.DATABASE_HOST || "localhost",
    port: parseInt(env.DATABASE_PORT || "5432", 10),
    database: env.DATABASE_NAME || "mythfood_driver",
    username: env.DATABASE_USER || "mythfood",
    password: env.DATABASE_PASSWORD || "mythfood_secret",
    entities: [DriverEntity],
    synchronize: env.NODE_ENV !== "production",
    logging: env.NODE_ENV === "development",
  };
}
