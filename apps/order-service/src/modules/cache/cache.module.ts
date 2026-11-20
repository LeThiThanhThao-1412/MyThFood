import { Module } from "@nestjs/common";
import { CACHE_SERVICE } from "./cache.constants";
import { RedisCacheService } from "./redis-cache.service";

@Module({
  providers: [{ provide: CACHE_SERVICE, useClass: RedisCacheService }],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
