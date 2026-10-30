import assert from 'node:assert/strict';
import test from 'node:test';
import { cmsTrashKinds, emptyCmsTrashCounts, parseCmsTrashQuery } from '../src/lib/cms-trash';

test('Trash queries default to every kind and trim literal multilingual search', () => {
  assert.deepEqual(parseCmsTrashQuery(new URLSearchParams()), { kind: 'All', q: '', item: null, cursor: null });
  assert.deepEqual(parseCmsTrashQuery(new URLSearchParams({ kind: 'Image', q: '  เรือ [MOE].*  ' })), { kind: 'Image', q: 'เรือ [MOE].*', item: null, cursor: null });
  for (const kind of cmsTrashKinds) assert.equal(parseCmsTrashQuery(new URLSearchParams({ kind })).kind, kind);
});

test('Trash queries reject ambiguous, unknown and oversized query parameters', () => {
  for (const query of ['kind=Image&kind=User', 'q=one&q=two', 'item=News:one&item=News:two', 'cursor=a&cursor=b', 'limit=200', 'kind=Admin', 'cursor=', 'cursor=a+b']) {
    assert.throws(() => parseCmsTrashQuery(new URLSearchParams(query)), query);
  }
  assert.throws(() => parseCmsTrashQuery(new URLSearchParams({ q: 'x'.repeat(161) })));
  assert.throws(() => parseCmsTrashQuery(new URLSearchParams({ q: 'bad\0search' })));
});

test('Trash item links override other filters and validate each identifier type', () => {
  assert.deepEqual(parseCmsTrashQuery(new URLSearchParams({ kind: 'Image', q: 'ignored', item: 'News:harbour-update' })), { kind: 'All', q: '', item: 'News:harbour-update', cursor: null });
  for (const item of ['Section:shared-footer', 'News:' + 'x'.repeat(100), 'Image:upload_ID-2026', 'User:123e4567-e89b-42d3-a456-426614174000']) assert.equal(parseCmsTrashQuery(new URLSearchParams({ item })).item, item);
  for (const item of ['News:', 'News:Bad_ID', 'News:one:two', 'User:not-a-uuid', 'Admin:one', 'Image:../file', 'Page:' + 'x'.repeat(101)]) assert.throws(() => parseCmsTrashQuery(new URLSearchParams({ item })), item);
});

test('Trash counts expose stable zero values for every supported kind', () => {
  const counts = emptyCmsTrashCounts();
  assert.equal(counts.All, 0);
  assert.equal(Object.keys(counts).length, cmsTrashKinds.length + 1);
  for (const kind of cmsTrashKinds) assert.equal(counts[kind], 0);
});
