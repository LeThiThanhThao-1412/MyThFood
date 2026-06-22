/**
 * Base Domain Error class for Domain-Driven Design.
 * All domain-level errors should extend this class.
 */
export abstract class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  protected constructor(
    message: string,
    code: string,
    statusCode: number = 400,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    // Preserve the stack trace (works in V8)
    if (typeof (Error as unknown as { captureStackTrace?: (target: object, constructorOpt?: Function) => void }).captureStackTrace === 'function') {
      (Error as unknown as { captureStackTrace: (target: object, constructorOpt?: Function) => void }).captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when an entity is not found.
 */
export class EntityNotFoundError extends DomainError {
  constructor(entityName: string, id: string) {
    super(
      `${entityName} with id '${id}' was not found`,
      `${entityName.toUpperCase()}_NOT_FOUND`,
      404,
    );
  }
}

/**
 * Error thrown when a business rule is violated.
 */
export class BusinessRuleViolationError extends DomainError {
  constructor(message: string) {
    super(message, 'BUSINESS_RULE_VIOLATION', 409);
  }
}

/**
 * Error thrown when validation fails on a value object.
 */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 422);
  }
}

/**
 * Error thrown when an unauthorized action is attempted.
 */
export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

/**
 * Error thrown when a forbidden action is attempted.
 */
export class ForbiddenError extends DomainError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}