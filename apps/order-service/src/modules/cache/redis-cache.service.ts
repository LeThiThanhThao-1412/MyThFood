import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { ICache } from "@mythfood/shared-kernel";

/**
 * Redis-backed implementation of the shared ICache interface.
 *
 * The client is created lazily and every command is wrapped so that a Redis
 * outage degrades gracefully (fail-open) instead of breaking the order flow.
 */
@Injectable()
export class RedisCacheService implements ICache, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): Redis {
    if (this.client) {
      return this.client;
    }

    const url =
      this.configService.get<string>("REDIS_URL") ||
      process.env.REDIS_URL ||
      "redis://localhost:6379";

    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });

    this.client.on("error", (err) => {
      this.logger.warn(`Redis connection error: ${err.message}`);
    });

    return this.client;
  }

  async get<T = string>(key: string): Promise<T | null> {
    try {
      const value = await this.getClient().get(key);
      return value as T | null;
    } catch (err) {
      this.logger.warn(
        `Redis GET failed for "${key}": ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await this.getClient().set(key, value, "EX", ttlSeconds);
      } else {
        await this.getClient().set(key, value);
      }
    } catch (err) {
      this.logger.warn(
        `Redis SET failed for "${key}": ${(err as Error)?.message}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.getClient().del(key);
    } catch (err) {
      this.logger.warn(
        `Redis DEL failed for "${key}": ${(err as Error)?.message}`,
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const count = await this.getClient().exists(key);
      return count === 1;
    } catch {
      return false;
    }
  }

  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      const client = this.getClient();
      const result =
        ttlSeconds !== undefined && ttlSeconds > 0
          ? await client.set(key, value, "EX", ttlSeconds, "NX")
          : await client.set(key, value, "NX");
      return result === "OK";
    } catch (err) {
      this.logger.warn(
        `Redis SETNX failed for "${key}": ${(err as Error)?.message}`,
      );
      // Fail-open: pretend the key was acquired so the request can proceed.
      return true;
    }
  }

  async incr(key: string, amount = 1): Promise<number> {
    try {
      return await this.getClient().incrby(key, amount);
    } catch {
      return 0;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.getClient().expire(key, ttlSeconds);
    } catch {
      /* ignore */
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.getClient().ttl(key);
    } catch {
      return -2;
    }
  }

  async lock(key: string, ttlSeconds: number): Promise<boolean> {
    return this.setNX(`lock:${key}`, "1", ttlSeconds);
  }

  async unlock(key: string): Promise<void> {
    await this.del(`lock:${key}`);
  }

  onModuleDestroy(): void {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}
