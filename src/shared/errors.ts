/**
 * Typed errors. Every operational error carries an HTTP status and a stable
 * machine-readable `type` string that appears in the API error envelope.
 * Throwing these anywhere in a handler produces a consistent client response.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly type: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'not_found', message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(422, 'validation_error', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'forbidden', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, 'conflict', message);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(message = 'Insufficient funds') {
    super(422, 'insufficient_funds', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(429, 'rate_limited', message);
  }
}
