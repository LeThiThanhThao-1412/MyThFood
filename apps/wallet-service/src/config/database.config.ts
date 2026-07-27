import { TypeOrmModuleOptions } from "@nestjs/typeorm";

const databaseConfig: TypeOrmModuleOptions = {
  type: "postgres",
  host: process.env.DATABASE_HOST || "localhost",
  port: parseInt(process.env.DATABASE_PORT || "5432", 10),
  username: process.env.DATABASE_USER || "mythfood",
  password: process.env.DATABASE_PASSWORD || "mythfood_secret",
  database: process.env.DATABASE_NAME || "mythfood_wallet",
  entities: [__dirname + "/../modules/**/*.entity{.ts,.js}"],
  synchronize: process.env.NODE_ENV !== "production",
  logging: process.env.NODE_ENV === "development" ? ["error", "query"] : ["error"],
};

export default databaseConfig;