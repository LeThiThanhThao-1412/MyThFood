"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Result = void 0;
/**
 * Result pattern for handling success/failure without throwing exceptions.
 * Inspired by Rust's Result and functional programming Either monad.
 */
class Result {
    _isSuccess;
    _value;
    _error;
    constructor(isSuccess, value, error) {
        this._isSuccess = isSuccess;
        this._value = value;
        this._error = error;
    }
    /**
     * Create a successful Result.
     */
    static ok(value) {
        return new Result(true, value, undefined);
    }
    /**
     * Create a failed Result.
     */
    static fail(error) {
        return new Result(false, undefined, error);
    }
    /**
     * Check if the Result is successful.
     */
    get isSuccess() {
        return this._isSuccess;
    }
    /**
     * Check if the Result is a failure.
     */
    get isFailure() {
        return !this._isSuccess;
    }
    /**
     * Get the value if successful. Throws if failed.
     */
    get value() {
        if (!this._isSuccess) {
            throw new Error('Cannot get value from a failed Result');
        }
        return this._value;
    }
    /**
     * Get the error if failed. Throws if successful.
     */
    get error() {
        if (this._isSuccess) {
            throw new Error('Cannot get error from a successful Result');
        }
        return this._error;
    }
    /**
     * Get the value or a default value.
     */
    getOrElse(defaultValue) {
        return this._isSuccess ? this._value : defaultValue;
    }
    /**
     * Get the value or null.
     */
    getOrNull() {
        return this._isSuccess ? this._value : null;
    }
    /**
     * Get the error or null.
     */
    getErrorOrNull() {
        return this._isSuccess ? null : this._error;
    }
    /**
     * Map the value to a new value.
     */
    map(fn) {
        if (this._isSuccess) {
            return Result.ok(fn(this._value));
        }
        return Result.fail(this._error);
    }
    /**
     * Map the error to a new error.
     */
    mapError(fn) {
        if (this._isSuccess) {
            return Result.ok(this._value);
        }
        return Result.fail(fn(this._error));
    }
    /**
     * Chain multiple Result-returning operations (flatMap).
     */
    andThen(fn) {
        if (this._isSuccess) {
            return fn(this._value);
        }
        return Result.fail(this._error);
    }
    /**
     * Execute a side-effect if the Result is successful.
     */
    onSuccess(fn) {
        if (this._isSuccess) {
            fn(this._value);
        }
        return this;
    }
    /**
     * Execute a side-effect if the Result is a failure.
     */
    onFailure(fn) {
        if (!this._isSuccess) {
            fn(this._error);
        }
        return this;
    }
    /**
     * Combine multiple Results into one. Returns the first error or all values.
     */
    static combine(results) {
        const values = [];
        for (const result of results) {
            if (result.isFailure) {
                return Result.fail(result.error);
            }
            values.push(result.value);
        }
        return Result.ok(values);
    }
}
exports.Result = Result;
//# sourceMappingURL=result.js.map