import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors';
import { classifyClientError } from '../shared/http-errors';
import { logger } from '../telemetry/logger';

/**
 * Every error response has the same shape:
 *   { "error": { "type": "...", "message": "...", "request_id": "..." } }
 * Clients can switch on `type`; `request_id` ties the response to logs/traces.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      type: 'not_found',
      message: `Route ${req.method} ${req.path} not found`,
      request_id: req.id,
    },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // If the response has already started we can't send an envelope; let
  // Express close the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { type: err.type, message: err.message, request_id: req.id },
    });
    return;
  }

  // Malformed JSON, oversized body, etc. — a 4xx, not an internal error.
  const clientError = classifyClientError(err);
  if (clientError) {
    res.status(clientError.status).json({
      error: { type: clientError.type, message: clientError.message, request_id: req.id },
    });
    return;
  }

  // Unknown/unexpected error — log the detail, expose nothing internal.
  logger.error({ err, request_id: req.id }, 'unhandled error');
  res.status(500).json({
    error: {
      type: 'internal_error',
      message: 'An unexpected error occurred',
      request_id: req.id,
    },
  });
}
