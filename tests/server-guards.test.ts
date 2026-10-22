import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../src/server/auth';
import { HttpError, readBytes, readJson, sameOrigin } from '../src/server/http';
import { nextCursor, readCursor } from '../src/server/pagination';

test('password hashes use fresh salts and reject incorrect passwords', async () => {
  const password = 'A long password kept only in this test';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('Another password', first), false);
  assert.equal(await verifyPassword(password, 'invalid'), false);
  const [, salt, key] = first.split(':');
  for (const malformed of [
    `argon2:${salt}:${key}`, `scrypt:${salt}:${key}:extra`,
    `scrypt:${salt.slice(1)}:${key}`, `scrypt:${'z'.repeat(32)}:${key}`,
    `scrypt:${salt}:${key.slice(1)}`, `scrypt::${key}`,
  ]) assert.equal(await verifyPassword(password, malformed), false);
});

test('mutation origin checks reject missing, foreign, and cross-site origins', () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://moe.example';
  try {
    assert.doesNotThrow(() => sameOrigin(new Request('https://moe.example/api/cms/content', { headers: { Origin: 'https://moe.example' } })));
    const invalidHeaders: Array<Record<string, string>> = [
      {},
      { Origin: 'https://attacker.example' },
      { Origin: 'https://moe.example.attacker.example' },
      { Origin: 'null' },
      { Origin: 'https://moe.example', 'Sec-Fetch-Site': 'cross-site' },
    ];
    for (const headers of invalidHeaders) {
      assert.throws(() => sameOrigin(new Request('https://moe.example/api/cms/content', { headers })), error => error instanceof HttpError && error.status === 403);
    }
    assert.doesNotThrow(() => sameOrigin(new Request('http://localhost:3005/api/cms/content', { headers: { Origin: 'http://localhost:3005' } })));
    assert.throws(() => sameOrigin(new Request('http://localhost:3005/api/cms/content', { headers: { Origin: 'http://localhost:3006' } })), error => error instanceof HttpError && error.status === 403);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  }
});

test('body limits apply to the actual stream even when content length lies', async () => {
  const request = new Request('https://moe.example/api/cms/content', {
    method: 'POST', headers: { 'Content-Length': '1' }, body: 'This actual body exceeds ten bytes.',
  });
  await assert.rejects(() => readBytes(request, 10), error => error instanceof HttpError && error.status === 413);
});

test('JSON requests reject wrong media type and malformed content', async () => {
  const wrongType = new Request('https://moe.example/api/cms/content', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  await assert.rejects(() => readJson(wrongType), error => error instanceof HttpError && error.status === 415);
  const malformed = new Request('https://moe.example/api/cms/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  await assert.rejects(() => readJson(malformed), error => error instanceof HttpError && error.status === 400);
  const valid = new Request('https://moe.example/api/cms/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"A visitor"}' });
  assert.deepEqual(await readJson(valid), { name: 'A visitor' });
});

test('pagination preserves timestamp tie-breakers and rejects malformed or operator-bearing cursors', () => {
  const cursor = { id: 'some-record-id', createdAt: '2026-10-23T12:00:00.000Z' };
  assert.deepEqual(readCursor(nextCursor(cursor)), cursor);
  assert.equal(readCursor(null), null);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const invalid of [
    'not-json', 'a'.repeat(401), encode({ id: { $gt: '' }, createdAt: cursor.createdAt }),
    encode({ id: cursor.id, createdAt: 'invalid-date' }), encode({ id: '', createdAt: cursor.createdAt }),
  ]) {
    assert.throws(() => readCursor(invalid), error => error instanceof HttpError && error.status === 400);
  }
});
