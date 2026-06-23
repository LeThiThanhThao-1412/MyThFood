import { registerAs } from "@nestjs/config";

export const databaseConfig = registerAs("database", () => ({
  type: "postgres" as const,
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? "mythfood",
  password: process.env.DATABASE_PASSWORD ?? "mythfood_secret",
  database: process.env.DATABASE_NAME ?? "mythfood_order",
  entities: [__dirname + "/../**/*.entity{.ts,.js}"],
  synchronize: process.env.NODE_ENV === "development",
  logging: process.env.NODE_ENV === "development",
}));
