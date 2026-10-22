import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { escapeInboxSearch, normalizeInboxFilters, parseInboxQuery } from '../src/lib/inbox-query';
import { buildEnquiryFilter, readEnquiryCursor } from '../src/server/enquiries';
import { HttpError } from '../src/server/http';
import { nextCursor } from '../src/server/pagination';

test('inbox filters trim bilingual search, preserve literal punctuation, and default only missing values', () => {
  assert.deepEqual(normalizeInboxFilters(), { q: '', status: 'All' });
  assert.deepEqual(normalizeInboxFilters({ q: null, status: null }), { q: '', status: 'All' });
  assert.deepEqual(normalizeInboxFilters({ q: '  ขนส่ง [A+B]  ', status: 'In progress' }), { q: 'ขนส่ง [A+B]', status: 'In progress' });
  assert.equal(normalizeInboxFilters({ q: `  ${'a'.repeat(200)}  ` }).q.length, 200);
  for (const input of [{ q: 'a'.repeat(201) }, { q: 'hidden\0value' }, { status: '' }, { status: 'new' }, { status: 'Archived' }]) {
    assert.throws(() => normalizeInboxFilters(input), z.ZodError);
  }
});

test('inbox query accepts one value per supported field and rejects ambiguous or operator-shaped parameters', () => {
  assert.deepEqual(parseInboxQuery(new URLSearchParams()), { q: '', status: 'All', cursor: null });
  const cursor = nextCursor({ id: 'enquiry-id', createdAt: '2026-10-23T12:00:00.000Z' });
  assert.deepEqual(parseInboxQuery(new URLSearchParams({ q: '  sales@example.com ', status: 'Resolved', cursor })), {
    q: 'sales@example.com', status: 'Resolved', cursor,
  });
  for (const invalid of [
    'q=one&q=two', 'q=one&q=one', 'status=New&status=Resolved', 'cursor=one&cursor=two',
    'limit=1000', 'q[$ne]=', 'status[$ne]=', 'id=some-id', 'cursor=', 'cursor=%20',
    'cursor=has%2Bpadding%3D', `cursor=${'a'.repeat(401)}`, `q=${'a'.repeat(201)}`,
  ]) assert.throws(() => parseInboxQuery(new URLSearchParams(invalid)), z.ZodError, invalid);
});

test('inbox search escapes every regular expression metacharacter and keeps Unicode literal', () => {
  const input = 'ขนส่ง . * + ? ^ $ { } ( ) | [ ] \\ / -';
  const pattern = new RegExp(escapeInboxSearch(input), 'i');
  assert.equal(pattern.test(`prefix ${input} suffix`), true);
  assert.equal(pattern.test(input.replace('[ ]', 'wildcard')), false);
  assert.equal(new RegExp(escapeInboxSearch('Team+OPS@example.com'), 'i').test('team+ops@EXAMPLE.com'), true);
  for (const literal of ['.*', '(a+)+$', '[abc]', '^$', '$where', '\\d+', 'A|B']) {
    const regex = new RegExp(escapeInboxSearch(literal), 'i');
    assert.equal(regex.test(literal), true, literal);
    assert.equal(regex.test('unrelated text'), false, literal);
  }
});

test('enquiry filters search all six fields without weakening status or timestamp tie-breakers', () => {
  const filters = normalizeInboxFilters({ q: '[Fleet]+', status: 'In progress' });
  const match = buildEnquiryFilter(filters);
  assert.equal(match.status, 'In progress');
  assert.deepEqual(match.$or?.map(clause => Object.keys(clause)[0]), ['name', 'email', 'company', 'subject', 'message', 'id']);
  for (const clause of match.$or ?? []) {
    const search = Object.values(clause)[0] as { $regex: string; $options: string };
    assert.equal(new RegExp(search.$regex, search.$options).test('A [FLEET]+ enquiry'), true);
    assert.equal(new RegExp(search.$regex, search.$options).test('Fleeeet'), false);
  }
  const cursor = { id: '00000000-0000-4000-8000-000000000050', createdAt: '2026-10-23T12:00:00.000Z' };
  assert.deepEqual(buildEnquiryFilter(filters, cursor), {
    $and: [match, { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }] }],
  });
  assert.deepEqual(buildEnquiryFilter({ q: '', status: 'All' }), {});
  assert.deepEqual(buildEnquiryFilter({ q: '', status: 'New' }), { status: 'New' });
  assert.equal('$and' in match, false, 'the matching count filter must not include a page boundary');
});

test('enquiry cursors preserve existing tokens and reject extra data, invalid dates, and permissive base64', () => {
  const cursor = { id: '00000000-0000-4000-8000-000000000050', createdAt: '2026-10-23T12:00:00.000Z' };
  const encoded = nextCursor(cursor);
  assert.deepEqual(readEnquiryCursor(encoded), cursor);
  assert.equal(readEnquiryCursor(null), null);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const invalid of [
    '', 'not-json', 'a'.repeat(401), `${encoded}=`, ` ${encoded}`, `${encoded}!`,
    encode({ ...cursor, status: 'New' }), encode({ id: { $gt: '' }, createdAt: cursor.createdAt }),
    encode({ ...cursor, id: '' }), encode({ ...cursor, createdAt: 'not-a-date' }),
  ]) assert.throws(() => readEnquiryCursor(invalid), error => error instanceof HttpError && error.status === 400, invalid);
});
