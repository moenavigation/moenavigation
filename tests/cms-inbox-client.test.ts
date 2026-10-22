import assert from 'node:assert/strict';
import test from 'node:test';
import { createInboxRequestScope, inboxRequestUrl, mergeInboxPages } from '../src/lib/cms-inbox-client';
import type { Enquiry } from '../src/lib/cms-types';

test('inbox pagination keeps literal bilingual queries and status on every request', () => {
  const query = '  เรือ [fleet].* & +  ';
  const first = new URL(inboxRequestUrl(query, 'In progress'), 'https://example.test');
  const later = new URL(inboxRequestUrl(query, 'In progress', 'cursor+/='), 'https://example.test');
  assert.equal(first.searchParams.get('q'), 'เรือ [fleet].* & +');
  assert.equal(later.searchParams.get('q'), first.searchParams.get('q'));
  assert.equal(later.searchParams.get('status'), 'In progress');
  assert.equal(later.searchParams.get('cursor'), 'cursor+/=');
  assert.equal(first.searchParams.has('cursor'), false);
});

test('a later inbox search or refresh invalidates stale responses even if abort is ignored', async () => {
  const scope = createInboxRequestScope();
  const older = scope.begin();
  const latest = scope.begin();
  let displayed = '';
  await Promise.resolve().then(() => { if (latest.isCurrent()) displayed = 'latest'; });
  await Promise.resolve().then(() => { if (older.isCurrent()) displayed = 'older'; });
  assert.equal(displayed, 'latest');
  assert.equal(older.signal.aborted, true);
  assert.equal(latest.isCurrent(), true);
  scope.invalidate();
  assert.equal(latest.signal.aborted, true);
  assert.equal(latest.isCurrent(), false);
  const refreshed = scope.begin();
  assert.equal(refreshed.isCurrent(), true);
  assert.equal(latest.isCurrent(), false);
  scope.invalidate();
});

test('overlapping inbox pages keep row order without duplicates and use the latest returned row', () => {
  const row = (id: string, revision: number): Enquiry => ({ id, revision, name: id, email: 'visitor@example.com', company: '', subject: id, message: 'Enquiry', status: 'New', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', locale: 'en' });
  const first = [row('a', 1), row('b', 1)];
  const result = mergeInboxPages(first, [row('b', 2), row('c', 1)]);
  assert.deepEqual(result.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(result[1].revision, 2);
  assert.equal(first[1].revision, 1);
});
