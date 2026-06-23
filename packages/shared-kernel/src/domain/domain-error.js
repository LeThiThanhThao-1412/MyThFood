"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.BusinessRuleViolationError = exports.EntityNotFoundError = exports.DomainError = void 0;
/**
 * Base Domain Error class for Domain-Driven Design.
 * All domain-level errors should extend this class.
 */
class DomainError extends Error {
    code;
    statusCode;
    constructor(message, code, statusCode = 400) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        // Preserve the stack trace (works in V8)
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.DomainError = DomainError;
/**
 * Error thrown when an entity is not found.
 */
class EntityNotFoundError extends DomainError {
    constructor(entityName, id) {
        super(`${entityName} with id '${id}' was not found`, `${entityName.toUpperCase()}_NOT_FOUND`, 404);
    }
}
exports.EntityNotFoundError = EntityNotFoundError;
/**
 * Error thrown when a business rule is violated.
 */
class BusinessRuleViolationError extends DomainError {
    constructor(message) {
        super(message, 'BUSINESS_RULE_VIOLATION', 409);
    }
}
exports.BusinessRuleViolationError = BusinessRuleViolationError;
/**
 * Error thrown when validation fails on a value object.
 */
class ValidationError extends DomainError {
    constructor(message) {
        super(message, 'VALIDATION_ERROR', 422);
    }
}
exports.ValidationError = ValidationError;
/**
 * Error thrown when an unauthorized action is attempted.
 */
class UnauthorizedError extends DomainError {
    constructor(message = 'Unauthorized') {
        super(message, 'UNAUTHORIZED', 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
/**
 * Error thrown when a forbidden action is attempted.
 */
class ForbiddenError extends DomainError {
    constructor(message = 'Forbidden') {
        super(message, 'FORBIDDEN', 403);
    }
}
exports.ForbiddenError = ForbiddenError;
//# sourceMappingURL=domain-error.js.map