import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Express 4 does not catch rejected promises from async handlers, so an
 * unhandled rejection would hang the request. Wrapping async handlers routes
 * any thrown/rejected error to the centralized error middleware.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
