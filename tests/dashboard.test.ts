import assert from 'node:assert/strict';
import test from 'node:test';
import { getContentAttentionIssues, type AttentionQuery } from '../src/lib/cms-dashboard';
import type { ContentRecord } from '../src/lib/cms-types';
import { attentionPageFromRecords, checkDashboardServices, parseAttentionQuery, pingDashboardImages } from '../src/server/dashboard';

const record = (changes: Partial<ContentRecord> = {}): ContentRecord => ({
  type: 'Vessel', id: 'cargo-1', title: 'Cargo vessel', titleTh: 'เรือสินค้า', description: 'Cargo service', descriptionTh: 'บริการขนส่งสินค้า',
  image: '/images/vessel.webp', category: 'Cargo', status: 'Published', revision: 1, vesselSpecs: { lengthM: 100 }, ...changes,
});
const query = (changes: Partial<AttentionQuery> = {}): AttentionQuery => ({ q: '', type: 'All', issue: 'All', cursor: null, ...changes });

test('attention flags missing collection translations, main images and wholly absent vessel details', () => {
  assert.deepEqual(getContentAttentionIssues(record()), []);
  assert.deepEqual(getContentAttentionIssues(record({ titleTh: ' ', image: '', vesselSpecs: {} })).map(issue => issue.code), ['translation', 'image', 'vessel_details']);
  for (const field of ['title', 'titleTh', 'description', 'descriptionTh']) assert.equal(getContentAttentionIssues(record({ [field]: '' }))[0].code, 'translation');
});

test('attention ignores unused core-page images, Trash and optional route images', () => {
  for (const type of ['Page', 'Section'] as const) assert.deepEqual(getContentAttentionIssues(record({ type, image: '', vesselSpecs: undefined })), []);
  assert.deepEqual(getContentAttentionIssues(record({ deletedAt: new Date().toISOString(), titleTh: '', image: '', vesselSpecs: undefined })), []);
  assert.deepEqual(getContentAttentionIssues(record({ deletedAt: '', titleTh: '', image: '', vesselSpecs: undefined })), []);
  assert.deepEqual(getContentAttentionIssues(record({ type: 'Route', image: '', vesselSpecs: undefined })), []);
});

test('core translations check required visible text without requiring optional section copy', () => {
  assert.deepEqual(getContentAttentionIssues(record({ type: 'Page', titleTh: '', image: '' })).map(issue => issue.code), ['translation']);
  assert.deepEqual(getContentAttentionIssues(record({ type: 'Page', description: '', descriptionTh: '', image: '' })).map(issue => issue.code), ['translation']);
  assert.deepEqual(getContentAttentionIssues(record({ type: 'Section', description: '', descriptionTh: '', image: '' })), []);
  assert.deepEqual(getContentAttentionIssues(record({ type: 'Section', descriptionTh: '', image: '' })).map(issue => issue.code), ['translation']);
  assert.deepEqual(getContentAttentionIssues(record({ type: 'Section', id: 'footer', parentId: 'shared', descriptionTh: '', image: '' })), []);
  assert.deepEqual(getContentAttentionIssues(record({ type: 'Section', id: 'footer', parentId: 'shared', titleTh: '', image: '' })).map(issue => issue.code), ['translation']);
});

test('partially completed vessel details do not turn optional specifications into requirements', () => {
  for (const vesselSpecs of [{ lengthM: 100 }, { flag: 'Thailand' }, { availabilityTh: 'พร้อมให้บริการ' }, { yearBuilt: 2020 }]) {
    assert.deepEqual(getContentAttentionIssues(record({ vesselSpecs })), []);
  }
});

test('attention counts and filters cover the complete dataset before bounded pagination', () => {
  const records = Array.from({ length: 29 }, (_, index) => record({ id: `cargo-${index}`, image: '' }));
  records.push(record({ id: 'complete-item' }));
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = attentionPageFromRecords(records, query({ cursor }));
    assert.equal(page.total, 29);
    assert.ok(page.items.length <= 12);
    ids.push(...page.items.map(item => item.record.id)); cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 29); assert.equal(new Set(ids).size, 29);
  assert.equal(attentionPageFromRecords(records, query({ type: 'News' })).total, 0);
  assert.equal(attentionPageFromRecords(records, query({ issue: 'translation' })).total, 0);
});

test('attention searches literal bilingual titles and rejects cursors from different filters', () => {
  const records = [record({ title: 'Cargo [A].*', image: '' }), record({ id: 'thai-match', titleTh: 'เรือเชียงราย', image: '' })];
  assert.equal(attentionPageFromRecords(records, query({ q: '[A].*' })).total, 1);
  assert.equal(attentionPageFromRecords(records, query({ q: 'เชียงราย' })).items[0].record.id, 'thai-match');
  const page = attentionPageFromRecords(Array.from({ length: 15 }, (_, index) => record({ id: `cargo-${index}`, image: '' })), query());
  assert.throws(() => attentionPageFromRecords(records, query({ q: 'changed', cursor: page.nextCursor })), /Refresh the list/);
  for (const cursor of ['invalid', 'YWJj', Buffer.from('{"offset":0,"scope":"wrong"}').toString('base64url')]) assert.throws(() => attentionPageFromRecords(records, query({ cursor })));
});

test('dashboard attention query validates duplicates, known filters and bounded search', () => {
  assert.deepEqual(parseAttentionQuery(new URLSearchParams('view=attention')), query());
  for (const input of ['view=attention&q=a&q=b', 'view=attention&type=Account', 'view=attention&issue=privacy', 'view=other', 'view=attention&status=Draft', `view=attention&q=${'a'.repeat(161)}`]) assert.throws(() => parseAttentionQuery(new URLSearchParams(input)));
});

test('image ping uses a fixed host with credentials only in server authorization headers', async () => {
  const env = { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'private-key', CLOUDINARY_API_SECRET: 'private-secret' };
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.cloudinary.com/v1_1/test-cloud/ping');
    assert.equal(options?.method, 'GET'); assert.equal(options?.redirect, 'error'); assert.equal(options?.cache, 'no-store');
    assert.equal(new Headers(options?.headers).get('authorization'), `Basic ${Buffer.from('private-key:private-secret').toString('base64')}`);
    assert.ok(options?.signal);
    return new Response('{"status":"ok"}');
  };
  assert.deepEqual(await pingDashboardImages({ env, fetcher }), { status: 'ok' });
  await assert.rejects(pingDashboardImages({ env: { ...env, CLOUDINARY_CLOUD_NAME: 'https://private.example' }, fetcher }));
});

test('image ping aborts stalled requests and rejects oversized response bodies', async () => {
  const env = { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' };
  let aborted = false;
  const stalled: typeof fetch = async (_url, options) => new Promise<Response>((_resolve, reject) => { options!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('Aborted')); }, { once: true }); });
  await assert.rejects(pingDashboardImages({ env, fetcher: stalled, timeoutMs: 5 }));
  assert.equal(aborted, true);
  const oversized: typeof fetch = async () => new Response('a'.repeat(2048));
  await assert.rejects(pingDashboardImages({ env, fetcher: oversized }));
});

test('dashboard service states expose only safe aggregates and distinguish email setup from delivery', async () => {
  const now = new Date('2026-10-31T12:00:00Z');
  const result = await checkDashboardServices({
    env: { CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'private-key', CLOUDINARY_API_SECRET: 'private-secret' },
    database: async () => true, images: async () => ({ status: 'ok', apiSecret: 'private-secret' }), email: async () => true, now: () => now,
  });
  assert.deepEqual(result.map(service => service.status), ['connected', 'connected', 'configured']);
  assert.match(result[2].detail, /Delivery is not verified/);
  assert.ok(result.every(service => service.checkedAt === now.toISOString()));
  assert.doesNotMatch(JSON.stringify(result), /private-key|private-secret|apiSecret/);
});

test('unconfigured services are explicit and image requests are skipped without credentials', async () => {
  let imageChecks = 0;
  const result = await checkDashboardServices({ env: {}, database: async () => true, images: async () => { imageChecks++; return { status: 'ok' }; }, email: async () => false });
  assert.deepEqual(result.map(service => service.status), ['connected', 'needs_setup', 'needs_setup']);
  assert.equal(imageChecks, 0);
});

test('service failures remain safe and unknown email setup is not reported as zero or configured', async () => {
  const fail = async () => { throw new Error('mongodb://private-password@host/private-address@example.test'); };
  const result = await checkDashboardServices({ env: { CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' }, database: fail, images: fail, email: fail });
  assert.deepEqual(result.map(service => service.status), ['unavailable', 'unavailable', 'unknown']);
  assert.doesNotMatch(JSON.stringify(result), /private-password|private-address|mongodb:/);
});
