import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Dependencies are mocked so these tests need no running Postgres or Redis.
const pingDb = vi.fn<() => Promise<boolean>>();
const pingRedis = vi.fn<() => Promise<boolean>>();
vi.mock('../src/db/pool', () => ({ pingDb: () => pingDb() }));
vi.mock('../src/redis/client', () => ({ pingRedis: () => pingRedis() }));

import { createApp } from '../src/app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('health probes', () => {
  beforeEach(() => {
    pingDb.mockResolvedValue(true);
    pingRedis.mockResolvedValue(true);
  });

  it('liveness answers without touching dependencies', async () => {
    const res = await request(createApp()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(pingDb).not.toHaveBeenCalled();
  });

  it('readiness is 200 when both dependencies are up', async () => {
    const res = await request(createApp()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { postgres: 'up', redis: 'up' } });
  });

  it('readiness flips to 503 when a dependency is down', async () => {
    pingRedis.mockResolvedValue(false);
    const res = await request(createApp()).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'degraded',
      checks: { postgres: 'up', redis: 'down' },
    });
  });

  it('an unexpected failure inside an async handler becomes a 500 envelope', async () => {
    pingDb.mockRejectedValue(new Error('boom'));
    const res = await request(createApp()).get('/health/ready');
    expect(res.status).toBe(500);
    expect(res.body.error.type).toBe('internal_error');
    expect(res.body.error.message).not.toContain('boom');
  });
});

describe('request ids', () => {
  it('generates an id when the client sends none', async () => {
    const res = await request(createApp()).get('/health/live');
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('echoes a well-formed client id', async () => {
    const res = await request(createApp()).get('/health/live').set('x-request-id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(129)],
    ['unexpected characters', 'id with spaces <script>'],
  ])('replaces a %s client id', async (_label, value) => {
    const res = await request(createApp()).get('/health/live').set('x-request-id', value);
    expect(res.headers['x-request-id']).toMatch(UUID);
  });
});

describe('error envelope', () => {
  it('unknown routes return 404 with a request id', async () => {
    const res = await request(createApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.type).toBe('not_found');
    expect(res.body.error.request_id).toBe(res.headers['x-request-id']);
  });

  it('malformed JSON is a 400, not a 500, and still carries a request id', async () => {
    const res = await request(createApp())
      .post('/health/live')
      .set('content-type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('invalid_json');
    expect(res.body.error.request_id).toMatch(UUID);
    expect(res.headers['x-request-id']).toBe(res.body.error.request_id);
  });

  it('an oversized body is a 413', async () => {
    const res = await request(createApp())
      .post('/health/live')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(1024 * 1024 + 1) }));
    expect(res.status).toBe(413);
    expect(res.body.error.type).toBe('payload_too_large');
  });
});
