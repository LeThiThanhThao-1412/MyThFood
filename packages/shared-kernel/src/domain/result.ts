/**
 * Result pattern for handling success/failure without throwing exceptions.
 * Inspired by Rust's Result and functional programming Either monad.
 */
export class Result<T, E = Error> {
  private readonly _isSuccess: boolean;
  private readonly _value?: T;
  private readonly _error?: E;

  private constructor(isSuccess: boolean, value?: T, error?: E) {
    this._isSuccess = isSuccess;
    this._value = value;
    this._error = error;
  }

  /**
   * Create a successful Result.
   */
  public static ok<T>(value: T): Result<T, never> {
    return new Result<T, never>(true, value, undefined as never);
  }

  /**
   * Create a failed Result.
   */
  public static fail<E>(error: E): Result<never, E> {
    return new Result<never, E>(false, undefined as never, error);
  }

  /**
   * Check if the Result is successful.
   */
  public get isSuccess(): boolean {
    return this._isSuccess;
  }

  /**
   * Check if the Result is a failure.
   */
  public get isFailure(): boolean {
    return !this._isSuccess;
  }

  /**
   * Get the value if successful. Throws if failed.
   */
  public get value(): T {
    if (!this._isSuccess) {
      throw new Error('Cannot get value from a failed Result');
    }
    return this._value as T;
  }

  /**
   * Get the error if failed. Throws if successful.
   */
  public get error(): E {
    if (this._isSuccess) {
      throw new Error('Cannot get error from a successful Result');
    }
    return this._error as E;
  }

  /**
   * Get the value or a default value.
   */
  public getOrElse(defaultValue: T): T {
    return this._isSuccess ? (this._value as T) : defaultValue;
  }

  /**
   * Get the value or null.
   */
  public getOrNull(): T | null {
    return this._isSuccess ? (this._value as T) : null;
  }

  /**
   * Get the error or null.
   */
  public getErrorOrNull(): E | null {
    return this._isSuccess ? null : (this._error as E);
  }

  /**
   * Map the value to a new value.
   */
  public map<U>(fn: (value: T) => U): Result<U, E> {
    if (this._isSuccess) {
      return Result.ok(fn(this._value as T));
    }
    return Result.fail(this._error as E);
  }

  /**
   * Map the error to a new error.
   */
  public mapError<F>(fn: (error: E) => F): Result<T, F> {
    if (this._isSuccess) {
      return Result.ok(this._value as T);
    }
    return Result.fail(fn(this._error as E));
  }

  /**
   * Chain multiple Result-returning operations (flatMap).
   */
  public andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this._isSuccess) {
      return fn(this._value as T);
    }
    return Result.fail(this._error as E);
  }

  /**
   * Execute a side-effect if the Result is successful.
   */
  public onSuccess(fn: (value: T) => void): Result<T, E> {
    if (this._isSuccess) {
      fn(this._value as T);
    }
    return this;
  }

  /**
   * Execute a side-effect if the Result is a failure.
   */
  public onFailure(fn: (error: E) => void): Result<T, E> {
    if (!this._isSuccess) {
      fn(this._error as E);
    }
    return this;
  }

  /**
   * Combine multiple Results into one. Returns the first error or all values.
   */
  public static combine<T>(results: Result<T, Error>[]): Result<T[], Error> {
    const values: T[] = [];
    for (const result of results) {
      if (result.isFailure) {
        return Result.fail(result.error);
      }
      values.push(result.value);
    }
    return Result.ok(values);
  }
}