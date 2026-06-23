/**
 * Base Domain Error class for Domain-Driven Design.
 * All domain-level errors should extend this class.
 */
export declare abstract class DomainError extends Error {
    readonly code: string;
    readonly statusCode: number;
    protected constructor(message: string, code: string, statusCode?: number);
}
/**
 * Error thrown when an entity is not found.
 */
export declare class EntityNotFoundError extends DomainError {
    constructor(entityName: string, id: string);
}
/**
 * Error thrown when a business rule is violated.
 */
export declare class BusinessRuleViolationError extends DomainError {
    constructor(message: string);
}
/**
 * Error thrown when validation fails on a value object.
 */
export declare class ValidationError extends DomainError {
    constructor(message: string);
}
/**
 * Error thrown when an unauthorized action is attempted.
 */
export declare class UnauthorizedError extends DomainError {
    constructor(message?: string);
}
/**
 * Error thrown when a forbidden action is attempted.
 */
export declare class ForbiddenError extends DomainError {
    constructor(message?: string);
}
//# sourceMappingURL=domain-error.d.ts.map