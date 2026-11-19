import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Agent, fetch } from 'undici';
import { isPublicIp, publicOnlyLookup, validateWebhookUrl } from './net-guard';

test('isPublicIp rejects private, loopback, link-local and metadata addresses', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', // IPv4-mapped IPv6
    'not-an-ip',
  ]) {
    assert.equal(isPublicIp(ip), false, ip);
  }
});

test('isPublicIp accepts public addresses', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPublicIp(ip), true, ip);
  }
});

test('validateWebhookUrl (production rules) blocks internal targets', () => {
  const prod = { allowPrivate: false };
  assert.equal(validateWebhookUrl('https://hooks.example.com/ledgerflow', prod), null);
  assert.equal(validateWebhookUrl('https://8.8.8.8/x', prod), null);
  for (const [url, reason] of [
    ['http://hooks.example.com/x', /https/],
    ['https://localhost/x', /public hostname/],
    ['https://api.localhost/x', /public hostname/],
    ['https://redis.internal/x', /public hostname/],
    ['https://red-abc123/x', /public hostname/], // single-label = internal service name
    ['https://127.0.0.1/x', /private or internal/],
    ['https://169.254.169.254/latest/meta-data', /private or internal/],
    ['https://[::1]/x', /private or internal/],
    ['https://[::ffff:10.0.0.1]/x', /private or internal/],
    ['https://user:pass@hooks.example.com/x', /credentials/],
    ['ftp://hooks.example.com/x', /https/],
    ['not a url', /valid URL/],
  ] as const) {
    assert.match(validateWebhookUrl(url, prod) ?? 'ALLOWED', reason, url);
  }
});

test('validateWebhookUrl (dev rules) allows local http but still rejects credentials', () => {
  const dev = { allowPrivate: true };
  assert.equal(validateWebhookUrl('http://localhost:4000/hook', dev), null);
  assert.equal(validateWebhookUrl('http://host.docker.internal:4000/hook', dev), null);
  assert.match(validateWebhookUrl('http://u:p@localhost/x', dev) ?? '', /credentials/);
  assert.match(validateWebhookUrl('ftp://localhost/x', dev) ?? '', /http or https/);
});

test('publicOnlyLookup refuses hostnames that resolve to private addresses', async () => {
  const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
    publicOnlyLookup('localhost', { all: true }, (e) => resolve(e)),
  );
  assert.equal(err?.code, 'ENOTPUBLIC');
});

test('a connection through the guarded agent never reaches an internal server', async () => {
  let reached = false;
  const server = createServer((_req, res) => {
    reached = true;
    res.end('internal secret');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  const agent = new Agent({ connect: { lookup: publicOnlyLookup } });
  try {
    await assert.rejects(
      fetch(`http://localhost:${port}/`, { dispatcher: agent }),
      (e: Error & { cause?: { code?: string } }) => e.cause?.code === 'ENOTPUBLIC',
    );
    assert.equal(reached, false, 'the internal server must not receive the request');
  } finally {
    await agent.close();
    server.close();
  }
});
