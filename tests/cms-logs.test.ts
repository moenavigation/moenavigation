import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { ClientSession, Db, Document, MongoClient } from 'mongodb';
import { cmsLogCategories, cmsLogEventSchema, cmsLogGroups, cmsLogPageSize, parseCmsLogQuery, type CmsLogEvent } from '../src/lib/cms-logs';
import { appendAuditEvent, auditActor, auditExpiryDate, buildCmsLogPipeline, formatCmsLogPage } from '../src/server/audit';
import { collections, ensureIndexes, type AuditDocument } from '../src/server/db';
import { HttpError } from '../src/server/http';

const query = parseCmsLogQuery(new URLSearchParams());
const event: CmsLogEvent = { action: 'content.updated', actor: { id: randomUUID(), username: 'operator', role: 'Operator' }, target: { type: 'Vessel', id: 'moe-vessel', label: 'MOE Vessel' } };
function document(overrides: Partial<AuditDocument> = {}): AuditDocument {
  return { _id: randomUUID(), occurredAt: new Date('2026-10-30T10:00:00.000Z'), expiresAt: new Date('2027-10-30T10:00:00.000Z'), ...event, category: 'content', outcome: 'success', ...overrides };
}

test('activity expiry is one calendar year in UTC and clamps leap day without changing time', () => {
  for (const [start, expected] of [
    ['2024-02-29T15:37:42.123Z', '2025-02-28T15:37:42.123Z'],
    ['2023-03-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z'],
    ['2026-01-31T23:59:59.999Z', '2027-01-31T23:59:59.999Z'],
    ['2026-12-31T23:59:59.999Z', '2027-12-31T23:59:59.999Z'],
  ]) {
    const input = new Date(start);
    assert.equal(auditExpiryDate(input).toISOString(), expected);
    assert.equal(input.toISOString(), start);
  }
  assert.throws(() => auditExpiryDate(new Date('invalid')));
});

test('event validation rejects unknown and sensitive fields at every level', () => {
  assert.equal(cmsLogEventSchema.parse(event).outcome, 'success');
  for (const forbidden of [
    { ...event, password: 'never-store' }, { ...event, metadata: { token: 'never-store' } },
    { ...event, summary: 'arbitrary request body' }, { ...event, action: 'logs.deleted' },
    { ...event, actor: { ...event.actor, passwordHash: 'never-store' } },
    { ...event, actor: { ...event.actor, ip: '127.0.0.1' } },
    { ...event, target: { ...event.target, body: 'never-store' } },
    { ...event, action: 'enquiry.status_changed', target: { type: 'Enquiry', id: 'enquiry', label: 'Private enquiry message' } },
    { ...event, action: 'auth.login', target: { type: 'Session', id: 'actual-token' } },
    { ...event, action: 'user.updated', target: { type: 'Vessel', id: 'wrong-kind' } },
  ]) assert.equal(cmsLogEventSchema.safeParse(forbidden).success, false);
  const sanitized = cmsLogEventSchema.parse({ ...event, target: { ...event.target, label: `  MOE\nVessel\0 ${'x'.repeat(200)}` } });
  assert.equal(sanitized.target.label?.length, 160);
  assert.ok(sanitized.target.label?.startsWith('MOE Vessel '));
});

test('audit actor uses only the persisted account identity and resolved role', () => {
  const source = { _id: 'legacy-admin', username: 'legacy-admin', passwordHash: 'secret-hash', password: 'secret', token: 'secret-token' };
  assert.deepEqual(auditActor(source), { id: 'legacy-admin', username: 'legacy-admin', role: 'Admin' });
  assert.deepEqual(cmsLogEventSchema.parse({ action: 'auth.login', actor: { system: true }, target: { type: 'Session', id: 'cms' }, outcome: 'denied' }).actor, { system: true });
  const legacyUsername = `${'l'.repeat(67)}@example.test`;
  assert.equal(legacyUsername.length, 80);
  const legacyActor = auditActor({ ...source, username: legacyUsername });
  assert.deepEqual(cmsLogEventSchema.parse({ ...event, actor: legacyActor }).actor, legacyActor);
});

test('append uses the caller transaction, a generated identity, safe fields, and calendar expiry', async () => {
  const writes: { row: AuditDocument; options: { session: ClientSession } }[] = [];
  const session = {} as ClientSession;
  const db = { collection: (name: string) => name === 'moe_logs' ? { insertOne: async (row: AuditDocument, options: { session: ClientSession }) => { writes.push({ row, options }); } } : {} } as unknown as Db;
  const id = await appendAuditEvent(db, session, event);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].row._id, id);
  assert.equal(writes[0].options.session, session);
  assert.equal(writes[0].row.expiresAt.toISOString(), auditExpiryDate(writes[0].row.occurredAt).toISOString());
  assert.equal(writes[0].row.category, 'content');
  assert.deepEqual(Object.keys(writes[0].row).sort(), ['_id', 'occurredAt', 'expiresAt', 'action', 'actor', 'target', 'outcome', 'category'].sort());
  await assert.rejects(appendAuditEvent(db, session, { ...event, password: 'secret' } as CmsLogEvent));
  assert.equal(writes.length, 1);
});

test('CMS log collection is insert-only and forbids aggregation writes including nested stages', () => {
  let calls = 0;
  const db = { collection: () => ({ aggregate: () => { calls++; return {}; } }) } as unknown as Db;
  const logs = collections(db).logs;
  assert.equal(Object.isFrozen(logs), true);
  assert.deepEqual(Object.keys(logs).sort(), ['aggregate', 'find', 'insertOne']);
  for (const pipeline of [[{ $out: 'moe_logs' }], [{ $merge: { into: 'moe_logs' } }], [{ $facet: { nested: [{ $merge: 'moe_logs' }] } }]]) {
    assert.throws(() => logs.aggregate(pipeline));
  }
  assert.equal(calls, 0);
  logs.aggregate([{ $match: { action: 'content.updated' } }]);
  assert.equal(calls, 1);
});

test('activity query parsing is bounded and rejects duplicates, unknown filters, or invalid cursors', () => {
  assert.deepEqual(query, { q: '', category: 'All', action: 'All', cursor: null });
  assert.deepEqual(parseCmsLogQuery(new URLSearchParams({ q: '  Vessel .*  ', category: 'content', action: 'content.updated' })), { q: 'Vessel .*', category: 'content', action: 'content.updated', cursor: null });
  for (const params of [
    'q=one&q=two', 'category=content&category=media', 'unknown=1', 'category=private', 'action=logs.deleted',
    'q=%00', `q=${'x'.repeat(161)}`, 'cursor=', 'cursor=bad%2Fbase64', `cursor=${'a'.repeat(513)}`,
  ]) assert.throws(() => parseCmsLogQuery(new URLSearchParams(params)));
});

test('log search is literal, expires exactly at cutoff, and totals do not use the page cursor', () => {
  const now = new Date('2026-10-30T12:00:00.000Z');
  const filtered = parseCmsLogQuery(new URLSearchParams({ q: 'Vessel.*', category: 'content', action: 'content.updated' }));
  const pipeline = buildCmsLogPipeline(filtered, now);
  assert.deepEqual(pipeline[0].$match.expiresAt, { $gt: now });
  assert.equal(pipeline[0].$match.action, 'content.updated');
  assert.equal(pipeline[0].$match.category, 'content');
  assert.ok(pipeline[0].$match.$or.every((item: Document) => Object.values(item)[0].$regex === 'Vessel\\.\\*'));
  const facet = pipeline[1].$facet;
  assert.deepEqual(facet.total, [{ $count: 'value' }]);
  assert.deepEqual(facet.items[0], { $sort: { occurredAt: -1, _id: 1 } });
  assert.deepEqual(facet.items[1], { $limit: cmsLogPageSize + 1 });
  assert.equal(facet.items[2].$project.actor, undefined);
  assert.equal(facet.items[2].$project['actor.username'], 1);
  assert.equal(facet.items[2].$project['target.label'], 1);
});

test('activity groups cover every stored category once without changing stored event categories', () => {
  assert.deepEqual(cmsLogGroups[0].categories, cmsLogCategories);
  const grouped = cmsLogGroups.slice(1).flatMap(group => [...group.categories]);
  assert.deepEqual([...grouped].sort(), [...cmsLogCategories].sort());
  assert.equal(new Set(grouped).size, grouped.length);
  assert.equal(cmsLogEventSchema.safeParse({ ...event, category: 'data_changes' }).success, false);
});

test('group filters match all relevant categories before totals and bounded pagination', () => {
  for (const group of cmsLogGroups.slice(1)) {
    const query = parseCmsLogQuery(new URLSearchParams({ category: group.value }));
    const pipeline = buildCmsLogPipeline(query);
    assert.equal(query.category, group.value);
    assert.deepEqual(pipeline[0].$match.category, { $in: [...group.categories] });
    assert.deepEqual(pipeline[1].$facet.total, [{ $count: 'value' }]);
    assert.deepEqual(pipeline[1].$facet.items[1], { $limit: cmsLogPageSize + 1 });
  }
  for (const category of cmsLogCategories) {
    assert.equal(buildCmsLogPipeline(parseCmsLogQuery(new URLSearchParams({ category })))[0].$match.category, category);
  }
});

test('group pagination cursors cannot be reused for another group or a legacy category', () => {
  const dataQuery = parseCmsLogQuery(new URLSearchParams({ category: 'data_changes' }));
  const rows = Array.from({ length: 31 }, () => document());
  const first = formatCmsLogPage(rows, 91, dataQuery);
  assert.ok(first.nextCursor);
  const following = { ...dataQuery, cursor: first.nextCursor };
  assert.deepEqual(buildCmsLogPipeline(following)[0].$match.category, { $in: ['content', 'media', 'settings'] });
  for (const category of ['All', 'content', 'user_activity', 'enquiry_activity'] as const) {
    assert.throws(() => buildCmsLogPipeline({ ...following, category }), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
});

test('pagination has a strict canonical cursor scoped to the filters and a stable date/id boundary', () => {
  const rows = Array.from({ length: 31 }, () => document());
  const first = formatCmsLogPage(rows, 91, query);
  assert.equal(first.items.length, 30);
  assert.equal(first.total, 91);
  assert.ok(first.nextCursor);
  const following = { ...query, cursor: first.nextCursor };
  const pipeline = buildCmsLogPipeline(following);
  assert.deepEqual(pipeline[1].$facet.items[0].$match.$or, [
    { occurredAt: { $lt: rows[29].occurredAt } }, { occurredAt: rows[29].occurredAt, _id: { $gt: rows[29]._id } },
  ]);
  assert.deepEqual(pipeline[1].$facet.total, [{ $count: 'value' }]);
  const invalid = (error: unknown) => error instanceof HttpError && error.status === 400;
  assert.throws(() => buildCmsLogPipeline({ ...following, q: 'different' }), invalid);
  assert.throws(() => buildCmsLogPipeline({ ...following, category: 'media' }), invalid);
  assert.throws(() => buildCmsLogPipeline({ ...following, action: 'content.created' }), invalid);
  assert.throws(() => buildCmsLogPipeline({ ...query, cursor: 'bad' }), invalid);
  const decoded = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'));
  assert.throws(() => buildCmsLogPipeline({ ...query, cursor: Buffer.from(JSON.stringify(decoded, null, 2)).toString('base64url') }), invalid);
  assert.equal(formatCmsLogPage(rows.slice(0, 2), 2, query).nextCursor, null);
});

test('public log formatting never exposes unexpected top-level or nested secrets', () => {
  const row = document({ action: 'enquiry.status_changed', category: 'enquiry', target: { type: 'Enquiry', id: 'enquiry' } });
  const unsafe = { ...row, password: 'top-secret', actor: { ...row.actor, token: 'actor-secret' }, target: { ...row.target, body: 'enquiry-secret', label: 'enquiry-secret' } };
  const page = formatCmsLogPage([unsafe], 1, query);
  const serialized = JSON.stringify(page);
  for (const secret of ['top-secret', 'actor-secret', 'enquiry-secret', 'password', 'token', 'body']) assert.equal(serialized.includes(secret), false);
  assert.equal(page.items[0].summary, 'Updated enquiry status');
  assert.equal(page.items[0].occurredAt, row.occurredAt.toISOString());
});

test('denied sign-ins and incomplete cleanup never claim success in their summary', () => {
  const denied = document({ action: 'auth.login', category: 'auth', actor: { system: true }, target: { type: 'Session', id: 'cms' }, outcome: 'denied' });
  const failed = document({ action: 'media.cleanup', category: 'media', target: { type: 'MediaLibrary', id: 'library' }, outcome: 'failed' });
  const items = formatCmsLogPage([denied, failed], 2, query).items;
  assert.equal(items[0].summary, 'Sign-in denied');
  assert.equal(items[1].summary, 'Image cleanup incomplete');
});

test('index bootstrap upgrades a legacy hot-reload cache once, shares concurrent work, and retries failure', async () => {
  const cache = globalThis as typeof globalThis & { moeMongo?: Promise<MongoClient>; moeIndexes?: Promise<void>; moeIndexCache?: { version: string; promise: Promise<void> } };
  const original = { mongo: cache.moeMongo, legacy: cache.moeIndexes, index: cache.moeIndexCache, uri: process.env.MONGODB_URI, name: process.env.MONGODB_DB_NAME };
  const writes: { collection: string; key: unknown; options: unknown }[] = [];
  let failNext = false;
  let rejectLegacy!: (error: Error) => void;
  const legacy = new Promise<void>((_, reject) => { rejectLegacy = reject; });
  const db = { collection: (collection: string) => ({ createIndex: async (key: unknown, options: unknown) => {
    writes.push({ collection, key, options });
    if (failNext) { failNext = false; throw new Error('Mock index failure'); }
    return 'mock-index';
  } }) } as unknown as Db;
  try {
    process.env.MONGODB_URI = 'mongodb://unused.invalid';
    process.env.MONGODB_DB_NAME = 'audit_unit';
    cache.moeMongo = Promise.resolve({ db: () => db } as unknown as MongoClient);
    cache.moeIndexCache = undefined;
    cache.moeIndexes = legacy.catch(error => { cache.moeIndexes = undefined; throw error; });
    const first = ensureIndexes();
    const shared = ensureIndexes();
    const activeEntry = cache.moeIndexCache;
    assert.equal(writes.length, 0);
    rejectLegacy(new Error('Legacy initialization failed'));
    await Promise.all([first, shared]);
    assert.equal(cache.moeIndexCache, activeEntry);
    assert.ok(writes.some(item => item.collection === 'moe_logs' && JSON.stringify(item.key) === '{"expiresAt":1}' && JSON.stringify(item.options) === '{"expireAfterSeconds":0}'));
    const perBuild = writes.length;
    await Promise.all([ensureIndexes(), ensureIndexes()]);
    assert.equal(writes.length, perBuild);
    assert.ok(cache.moeIndexCache);
    (cache.moeIndexCache as { version: string }).version = 'older-schema';
    failNext = true;
    await assert.rejects(ensureIndexes(), /Mock index failure/);
    assert.equal(cache.moeIndexCache, undefined);
    await Promise.all([ensureIndexes(), ensureIndexes()]);
    assert.equal(writes.length, perBuild * 3);
  } finally {
    cache.moeMongo = original.mongo; cache.moeIndexes = original.legacy; cache.moeIndexCache = original.index;
    if (original.uri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = original.uri;
    if (original.name === undefined) delete process.env.MONGODB_DB_NAME; else process.env.MONGODB_DB_NAME = original.name;
  }
});
