import type { Request, Response, NextFunction } from 'express';
import { redis } from '../redis/client';
import { TooManyRequestsError } from '../shared/errors';

/**
 * Atomic token-bucket rate limiter in a single Lua script — the GET-then-SET
 * is done inside Redis so there's no check-then-act race between processes.
 * Refills continuously at points/duration tokens per second.
 */
const TOKEN_BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local now      = tonumber(ARGV[3])
local cost     = tonumber(ARGV[4])
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local delta = math.max(0, now - ts) / 1000.0
tokens = math.min(capacity, tokens + delta * refill)
local allowed = 0
if tokens >= cost then allowed = 1; tokens = tokens - cost end
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / refill * 1000) + 1000)
return { allowed, math.floor(tokens) }
`;

// Register as a custom command so it's cached server-side (EVALSHA).
(redis as unknown as { defineCommand: (n: string, o: object) => void }).defineCommand(
  'tokenBucket',
  { numberOfKeys: 1, lua: TOKEN_BUCKET_LUA },
);

interface RateLimitOptions {
  points: number;
  durationSec: number;
  prefix: string;
  by?: 'ip' | 'tenant';
}

export function rateLimit(opts: RateLimitOptions) {
  const refillPerSec = opts.points / opts.durationSec;
  return (req: Request, res: Response, next: NextFunction): void => {
    void apply(req, res, next).catch(next);
  };

  async function apply(req: Request, res: Response, next: NextFunction): Promise<void> {
    const id = opts.by === 'tenant' && req.user ? req.user.tenantId : req.ip;
    const key = `rl:${opts.prefix}:${id}`;
    const [allowed, remaining] = (await (
      redis as unknown as {
        tokenBucket: (
          k: string,
          cap: number,
          refill: number,
          now: number,
          cost: number,
        ) => Promise<[number, number]>;
      }
    ).tokenBucket(key, opts.points, refillPerSec, Date.now(), 1)) as [number, number];

    res.setHeader('X-RateLimit-Limit', String(opts.points));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (allowed === 1) {
      next();
      return;
    }
    res.setHeader('Retry-After', '1');
    next(new TooManyRequestsError());
  }
}
