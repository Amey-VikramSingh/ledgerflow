import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequestId } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('generates a UUID when the client sends no request id', () => {
  assert.match(resolveRequestId(undefined), UUID);
});

test('echoes a well-formed client request id', () => {
  assert.equal(resolveRequestId('abc-123_x.y'), 'abc-123_x.y');
});

for (const [label, value] of [
  ['empty', ''],
  ['too long', 'a'.repeat(129)],
  ['unexpected characters', 'id with spaces <script>'],
  ['a header injection attempt', 'abc\r\nset-cookie: x=1'],
] as const) {
  test(`replaces a ${label} client request id`, () => {
    assert.match(resolveRequestId(value), UUID);
  });
}

test('replaces a repeated header (array value)', () => {
  assert.match(resolveRequestId(['a', 'b']), UUID);
});
