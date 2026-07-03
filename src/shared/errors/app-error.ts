export type ErrorCategory =
  | "validation"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "unauthorized"
  | "forbidden"
  | "dependency_unavailable"
  | "invariant_violation"
  | "internal";

export type AppErrorOptions = {
  code: string;
  message: string;
  status: number;
  category: ErrorCategory;
  retryable: boolean;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.category = options.category;
    this.retryable = options.retryable;
    this.cause = options.cause;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function asAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  return new AppError({
    code: "INTERNAL_ERROR",
    message: "Unexpected internal error.",
    status: 500,
    category: "internal",
    retryable: false,
    cause: error,
  });
}

export function validationError(code: string, message: string, cause?: unknown): AppError {
  return new AppError({
    code,
    message,
    status: 400,
    category: "validation",
    retryable: false,
    cause,
  });
}

export function unauthorizedError(code: string, message: string): AppError {
  return new AppError({
    code,
    message,
    status: 401,
    category: "unauthorized",
    retryable: false,
  });
}

export function notFoundError(code: string, message: string): AppError {
  return new AppError({
    code,
    message,
    status: 404,
    category: "not_found",
    retryable: false,
  });
}

export function conflictError(code: string, message: string): AppError {
  return new AppError({
    code,
    message,
    status: 409,
    category: "conflict",
    retryable: false,
  });
}

export function rateLimitError(code: string, message: string): AppError {
  return new AppError({
    code,
    message,
    status: 429,
    category: "rate_limit",
    retryable: true,
  });
}

export function dependencyUnavailableError(code: string, message: string, cause?: unknown): AppError {
  return new AppError({
    code,
    message,
    status: 503,
    category: "dependency_unavailable",
    retryable: true,
    cause,
  });
}
