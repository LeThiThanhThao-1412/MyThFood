import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from "@nestjs/common";
import { Observable, of } from "rxjs";
import { tap } from "rxjs/operators";
import type { ICache } from "@mythfood/shared-kernel";
import { IDEMPOTENCY_METADATA_KEY } from "@mythfood/common";
import { CACHE_SERVICE } from "./cache.constants";

interface IdempotencyMetadata {
  keyField?: string;
  ttlSeconds?: number;
}

const IN_PROGRESS = "__IN_PROGRESS__";
const DEFAULT_TTL_SECONDS = 600; // 10 minutes
const MAX_WAIT_MS = 2000;

/**
 * Enforces idempotency for handlers decorated with `@Idempotency(...)`.
 *
 * Flow (Case 1):
 * 1. Extract the `Idempotency-Key` from the request.
 * 2. Atomically claim the key in Redis (`SET ... NX`).
 *    - Claimed → run the handler, then store the result under the key (TTL).
 *    - Already present → return the previously stored result (blocks duplicates).
 * 3. On handler error, the claim is removed so the client can safely retry.
 *
 * If the key is missing or Redis is unavailable the interceptor fails open
 * (the request is processed normally, without idempotency protection).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @Optional()
    @Inject(CACHE_SERVICE)
    private readonly cache?: ICache,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (!this.cache || context.getType() !== "http") {
      return next.handle();
    }

    const handler = context.getHandler();
    const metadata: IdempotencyMetadata | undefined = Reflect.getMetadata(
      IDEMPOTENCY_METADATA_KEY,
      handler,
    );
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const key = this.extractKey(request, metadata.keyField);
    if (!key) {
      // Client did not send an idempotency key → skip the guard.
      return next.handle();
    }

    const cacheKey = `idempotency:${handler?.name ?? "operation"}:${key}`;
    const ttl = metadata.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    try {
      const claimed = await this.cache.setNX(cacheKey, IN_PROGRESS, ttl);

      if (claimed) {
        return next.handle().pipe(
          tap({
            next: async (result) => {
              try {
                await this.cache!.set(
                  cacheKey,
                  JSON.stringify({ status: "COMPLETED", data: result }),
                  ttl,
                );
              } catch {
                /* ignore */
              }
            },
            error: async () => {
              try {
                await this.cache!.del(cacheKey);
              } catch {
                /* ignore */
              }
            },
          }),
        );
      }

      // Key already exists → return the previously created result.
      const cached = await this.waitForResult(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.status === "COMPLETED") {
          return of(parsed.data);
        }
      }

      // Still processing (or the result expired) → block duplicate submission.
      throw new ConflictException(
        "Đơn hàng đang được xử lý, vui lòng thử lại sau giây lát",
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        throw err;
      }
      this.logger.warn(
        `Idempotency check skipped (cache unavailable): ${(err as Error)?.message}`,
      );
      return next.handle();
    }
  }

  private extractKey(request: any, keyField?: string): string | null {
    const field = keyField ?? "idempotency_key";
    const headers = request?.headers ?? {};

    const headerValue =
      headers[field] ??
      headers[field.toLowerCase()] ??
      headers[field.toUpperCase()];

    if (typeof headerValue === "string" && headerValue.trim().length > 0) {
      return headerValue.trim();
    }

    const bodyValue = request?.body?.[field];
    if (typeof bodyValue === "string" && bodyValue.trim().length > 0) {
      return bodyValue.trim();
    }

    return null;
  }

  private async waitForResult(cacheKey: string): Promise<string | null> {
    const started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
      const value = await this.cache!.get<string>(cacheKey);
      if (value && value !== IN_PROGRESS) {
        return value;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }
}
