/**
 * Cache service interface for distributed caching.
 */
export interface ICache {
  /**
   * Get a value by key.
   */
  get<T = string>(key: string): Promise<T | null>;

  /**
   * Set a value with optional TTL in seconds.
   */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a key.
   */
  del(key: string): Promise<void>;

  /**
   * Check if a key exists.
   */
  exists(key: string): Promise<boolean>;

  /**
   * Set a key only if it doesn't exist (atomic).
   * Returns true if the key was set, false if it already existed.
   */
  setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean>;

  /**
   * Increment a numeric value by 1 (or specified amount).
   */
  incr(key: string, amount?: number): Promise<number>;

  /**
   * Set expiration on a key.
   */
  expire(key: string, ttlSeconds: number): Promise<void>;

  /**
   * Get the remaining TTL of a key in seconds.
   */
  ttl(key: string): Promise<number>;

  /**
   * Acquire a distributed lock.
   */
  lock(key: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Release a distributed lock.
   */
  unlock(key: string): Promise<void>;
}