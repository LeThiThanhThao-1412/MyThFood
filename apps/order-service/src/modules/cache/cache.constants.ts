/**
 * DI token used to inject the shared cache implementation (e.g. Redis)
 * into consumers such as the idempotency interceptor.
 */
export const CACHE_SERVICE = Symbol("CACHE_SERVICE");
