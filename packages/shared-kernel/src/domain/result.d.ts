/**
 * Result pattern for handling success/failure without throwing exceptions.
 * Inspired by Rust's Result and functional programming Either monad.
 */
export declare class Result<T, E = Error> {
    private readonly _isSuccess;
    private readonly _value?;
    private readonly _error?;
    private constructor();
    /**
     * Create a successful Result.
     */
    static ok<T>(value: T): Result<T, never>;
    /**
     * Create a failed Result.
     */
    static fail<E>(error: E): Result<never, E>;
    /**
     * Check if the Result is successful.
     */
    get isSuccess(): boolean;
    /**
     * Check if the Result is a failure.
     */
    get isFailure(): boolean;
    /**
     * Get the value if successful. Throws if failed.
     */
    get value(): T;
    /**
     * Get the error if failed. Throws if successful.
     */
    get error(): E;
    /**
     * Get the value or a default value.
     */
    getOrElse(defaultValue: T): T;
    /**
     * Get the value or null.
     */
    getOrNull(): T | null;
    /**
     * Get the error or null.
     */
    getErrorOrNull(): E | null;
    /**
     * Map the value to a new value.
     */
    map<U>(fn: (value: T) => U): Result<U, E>;
    /**
     * Map the error to a new error.
     */
    mapError<F>(fn: (error: E) => F): Result<T, F>;
    /**
     * Chain multiple Result-returning operations (flatMap).
     */
    andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
    /**
     * Execute a side-effect if the Result is successful.
     */
    onSuccess(fn: (value: T) => void): Result<T, E>;
    /**
     * Execute a side-effect if the Result is a failure.
     */
    onFailure(fn: (error: E) => void): Result<T, E>;
    /**
     * Combine multiple Results into one. Returns the first error or all values.
     */
    static combine<T>(results: Result<T, Error>[]): Result<T[], Error>;
}
//# sourceMappingURL=result.d.ts.map