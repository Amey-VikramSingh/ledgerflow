import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors';
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

/**
 * Errors raised by Express/body-parser for a bad request (malformed JSON,
 * oversized body, unsupported encoding…). They carry a 4xx status and
 * `expose: true`; they are the client's fault, not an internal error.
 */
interface HttpClientError {
  status: number;
  type?: string;
}

function asHttpClientError(err: unknown): HttpClientError | null {
  if (typeof err !== 'object' || err === null) return null;
  const candidate = err as {
    status?: unknown;
    statusCode?: unknown;
    expose?: unknown;
    type?: unknown;
  };
  const status = candidate.status ?? candidate.statusCode;
  if (typeof status !== 'number' || status < 400 || status > 499) return null;
  if (candidate.expose !== true) return null;
  return { status, type: typeof candidate.type === 'string' ? candidate.type : undefined };
}

const CLIENT_ERROR_ENVELOPES: Record<string, { type: string; message: string }> = {
  'entity.parse.failed': { type: 'invalid_json', message: 'Request body is not valid JSON' },
  'entity.too.large': { type: 'payload_too_large', message: 'Request body is too large' },
};

const GENERIC_CLIENT_ERROR = {
  type: 'bad_request',
  message: 'The request could not be processed',
};

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

  const clientError = asHttpClientError(err);
  if (clientError) {
    const envelope =
      (clientError.type ? CLIENT_ERROR_ENVELOPES[clientError.type] : undefined) ??
      GENERIC_CLIENT_ERROR;
    res.status(clientError.status).json({
      error: { ...envelope, request_id: req.id },
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
