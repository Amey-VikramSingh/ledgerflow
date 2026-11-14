import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { classifyClientError } from './http-errors';

/** Run a raw body through the real express.json() parser and return its error. */
function parseError(body: string, limit = '1mb'): Promise<unknown> {
  const parser = express.json({ limit });
  return new Promise((resolve) => {
    const app = express();
    app.post('/', parser, () => resolve(null));
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      resolve(err);
      res.end();
    });
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      await fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }).catch(() => undefined);
      server.close();
    });
  });
}

test('malformed JSON is a 400 invalid_json, not an internal error', async () => {
  const err = await parseError('{bad');
  assert.deepEqual(classifyClientError(err), {
    status: 400,
    type: 'invalid_json',
    message: 'Request body is not valid JSON',
  });
});

test('an oversized body is a 413 payload_too_large', async () => {
  const err = await parseError(JSON.stringify({ blob: 'x'.repeat(200) }), '100b');
  assert.equal(classifyClientError(err)?.status, 413);
  assert.equal(classifyClientError(err)?.type, 'payload_too_large');
});

test('ordinary errors are not treated as client errors', () => {
  assert.equal(classifyClientError(new Error('boom')), null);
  assert.equal(classifyClientError(null), null);
  assert.equal(classifyClientError('nope'), null);
});

test('a 5xx or non-exposed error is not a client error', () => {
  assert.equal(classifyClientError({ status: 500, expose: true }), null);
  assert.equal(classifyClientError({ status: 400, expose: false }), null);
});

test('an unknown exposed 4xx gets the generic envelope', () => {
  assert.deepEqual(classifyClientError({ status: 415, expose: true, type: 'encoding.unsupported' }), {
    status: 415,
    type: 'bad_request',
    message: 'The request could not be processed',
  });
});
