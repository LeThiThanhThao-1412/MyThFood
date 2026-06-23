/**
 * Environment variable loader with validation.
 * Reads from process.env with defaults and required checks.
 */
export interface EnvConfig {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  DATABASE_HOST: string;
  DATABASE_PORT: number;
  DATABASE_NAME: string;
  DATABASE_USER: string;
  DATABASE_PASSWORD: string;
  JWT_SECRET: string;
  JWT_EXPIRATION: string;
  REDIS_URL?: string;
  KAFKA_BROKERS?: string;
  KAFKA_CLIENT_ID?: string;
}

export function loadEnv(): EnvConfig {
  const missing: string[] = [];

  const required = (key: string): string => {
    const value = process.env[key];
    if (!value && process.env.NODE_ENV !== "test") {
      missing.push(key);
    }
    return value ?? "";
  };

  const config: EnvConfig = {
    NODE_ENV: (process.env.NODE_ENV as EnvConfig["NODE_ENV"]) ?? "development",
    PORT: parseInt(process.env.PORT ?? "3000", 10),
    DATABASE_HOST: required("DATABASE_HOST"),
    DATABASE_PORT: parseInt(process.env.DATABASE_PORT ?? "5432", 10),
    DATABASE_NAME: required("DATABASE_NAME"),
    DATABASE_USER: required("DATABASE_USER"),
    DATABASE_PASSWORD: required("DATABASE_PASSWORD"),
    JWT_SECRET: required("JWT_SECRET"),
    JWT_EXPIRATION: process.env.JWT_EXPIRATION ?? "1h",
    REDIS_URL: process.env.REDIS_URL,
    KAFKA_BROKERS: process.env.KAFKA_BROKERS,
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
  };

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  return config;
}
