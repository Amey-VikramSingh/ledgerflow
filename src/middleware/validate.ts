import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../shared/errors';

function check(schema: ZodSchema, data: unknown):
  | { ok: true; data: unknown }
  | { ok: false; detail: string } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const first = result.error.issues[0];
  return { ok: false, detail: first ? `${first.path.join('.')}: ${first.message}` : 'invalid request' };
}

/** Validate + coerce req.body; replaces it with the parsed value. */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const r = check(schema, req.body);
    if (!r.ok) return next(new ValidationError(r.detail));
    req.body = r.data;
    next();
  };
}

/** Validate + coerce req.query; result on res.locals.query. */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const r = check(schema, req.query);
    if (!r.ok) return next(new ValidationError(r.detail));
    res.locals.query = r.data;
    next();
  };
}
