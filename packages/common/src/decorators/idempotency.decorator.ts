import "reflect-metadata";

/**
 * Idempotency decorator interface.
 * Marks an operation as idempotent - safe to retry with the same key.
 *
 * This is a metadata-only decorator. The actual idempotency logic
 * is implemented by an interceptor/middleware in the service layer.
 */
export interface IdempotencyOptions {
  /** The header or body field containing the idempotency key */
  keyField?: string;

  /** How long to cache the idempotency result (seconds) */
  ttlSeconds?: number;
}

export const IDEMPOTENCY_METADATA_KEY = Symbol("idempotency");

/**
 * Decorator to mark a method as idempotent.
 *
 * Usage:
 * ```typescript
 * @Idempotency({ keyField: 'idempotency_key', ttlSeconds: 86400 })
 * async createOrder(@Body() dto: CreateOrderDto) { ... }
 * ```
 */
export function Idempotency(options: IdempotencyOptions = {}): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(
      IDEMPOTENCY_METADATA_KEY,
      {
        keyField: options.keyField ?? "idempotency_key",
        ttlSeconds: options.ttlSeconds ?? 86400, // 24 hours default
      },
      descriptor.value,
    );
    return descriptor;
  };
}
