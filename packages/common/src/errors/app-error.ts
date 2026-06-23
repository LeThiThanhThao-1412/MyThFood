/**
 * Application-level error with metadata for structured error responses.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;

    if (
      typeof (
        Error as unknown as {
          captureStackTrace?: (
            target: object,
            constructorOpt?: Function,
          ) => void;
        }
      ).captureStackTrace === "function"
    ) {
      (
        Error as unknown as {
          captureStackTrace: (
            target: object,
            constructorOpt?: Function,
          ) => void;
        }
      ).captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        ...(this.metadata ? { metadata: this.metadata } : {}),
      },
    };
  }
}

/**
 * Predefined application errors.
 */
export class BadRequestError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, "BAD_REQUEST", 400, metadata);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, "CONFLICT", 409, metadata);
  }
}

export class InternalServerError extends AppError {
  constructor(
    message: string = "Internal Server Error",
    metadata?: Record<string, unknown>,
  ) {
    super(message, "INTERNAL_SERVER_ERROR", 500, metadata);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message: string = "Too Many Requests",
    metadata?: Record<string, unknown>,
  ) {
    super(message, "TOO_MANY_REQUESTS", 429, metadata);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = "Service Unavailable",
    metadata?: Record<string, unknown>,
  ) {
    super(message, "SERVICE_UNAVAILABLE", 503, metadata);
  }
}
