import { DomainError } from "@mythfood/shared-kernel";
import { AppError } from "./app-error";

/**
 * Standardized error response shape for all API errors.
 */
export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
  path?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  details?: unknown[];
}

/**
 * Map any error (DomainError, AppError, or plain Error) to a structured ErrorResponse.
 */
export function mapErrorToResponse(
  error: unknown,
  path?: string,
  correlationId?: string,
): ErrorResponse {
  // Domain errors from shared-kernel
  if (error instanceof DomainError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString(),
      path,
      correlationId,
    };
  }

  // Application errors
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString(),
      path,
      correlationId,
      metadata: error.metadata,
    };
  }

  // Generic Error
  if (error instanceof Error) {
    return {
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
      timestamp: new Date().toISOString(),
      path,
      correlationId,
    };
  }

  // Unknown error type
  return {
    statusCode: 500,
    code: "UNKNOWN_ERROR",
    message: "An unexpected error occurred",
    timestamp: new Date().toISOString(),
    path,
    correlationId,
  };
}
