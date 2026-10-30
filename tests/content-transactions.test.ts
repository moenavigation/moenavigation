import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { ClientSession, Db } from 'mongodb';
import { contentActionInTransaction, saveContentInTransaction } from '../src/server/content';
import { HttpError } from '../src/server/http';
import { saveSchema } from '../src/server/validation';
import type { ContentDocument, MediaDocument } from '../src/server/db';
import type { ContentRecord } from '../src/lib/cms-types';

const owner = 'test-admin';
const imageUrl = 'https://res.cloudinary.com/test/image/upload/test-image.webp';
const session = {} as ClientSession;
const page = (deletedAt?: string): ContentDocument => ({ _id: 'Page:custom', id: 'custom', type: 'Page', title: 'Page', titleTh: 'หน้า', description: 'Page summary', descriptionTh: 'สรุป', category: 'Page', image: imageUrl, status: 'Draft', revision: 1, ...(deletedAt ? { deletedAt } : {}) });
const section = (parentId = 'custom'): Omit<ContentRecord, 'revision'> => ({ id: 'section-one', type: 'Section', parentId, title: 'Section', titleTh: 'ส่วน', description: '', descriptionTh: '', category: 'Section', image: '', status: 'Draft' });

function harness(parent?: ContentDocument, submissionId = randomUUID()) {
  const content = new Map<string, ContentDocument>(parent ? [[parent._id, parent]] : []);
  const media = new Map<string, MediaDocument>([['test-image', { _id: 'test-image', id: 'test-image', title: 'Image', url: imageUrl, state: 'staged', owner, submissionId, pinned: false, touchedAt: new Date(), createdAt: new Date().toISOString() }]]);
  const operations = new Map<string, { fingerprint: string; result: ContentRecord }>();
  let mediaCommits = 0;
  const db = { collection: (name: string) => {
    if (name === 'moe_content') return {
      findOne: async (filter: { _id: string }) => content.get(filter._id) || null,
      insertOne: async (record: ContentDocument) => { content.set(record._id, record); },
      replaceOne: async (filter: { _id: string }, record: ContentRecord) => { content.set(filter._id, { ...record, _id: filter._id }); },
    };
    if (name === 'moe_media') return {
      findOne: async (filter: { url: string }) => [...media.values()].find(item => item.url === filter.url) || null,
      updateOne: async (filter: { _id: string }, update: { $set: Partial<MediaDocument> }) => { mediaCommits++; Object.assign(media.get(filter._id)!, update.$set); },
    };
    if (name === 'moe_operations') return {
      findOne: async (filter: { _id: string }) => operations.get(filter._id) || null,
      insertOne: async (operation: { _id: string; fingerprint: string; result: ContentRecord }) => { operations.set(operation._id, operation); },
    };
    if (name === 'moe_state') return { findOneAndUpdate: async () => ({ value: 'open' }) };
    // collections() also constructs unused handles; any unexpected operation on
    // one of these will fail instead of reaching a database.
    return {};
  } } as unknown as Db;
  return { content, media, operations, db, submissionId, mediaCommits: () => mediaCommits };
}

test('missing or trashed section parents fail before any staged image commits', async () => {
  for (const parent of [undefined, page(new Date().toISOString())]) {
    const state = harness(parent);
    const input = saveSchema.parse({ record: { ...section(), image: imageUrl }, expectedRevision: null, submissionId: state.submissionId });
    await assert.rejects(saveContentInTransaction(input, owner, state.db, session), error => error instanceof HttpError && error.status === 400 && error.message.includes('existing page'));
    assert.equal(state.mediaCommits(), 0); assert.equal(state.media.get('test-image')?.state, 'staged');
    assert.equal(state.content.has('Section:section-one'), false); assert.equal(state.operations.size, 0);
  }
});

test('section restoration waits for an available parent and preserves rejected records', async () => {
  for (const parent of [undefined, page(new Date().toISOString()), { ...page(), purgeAt: new Date(0) }]) {
    const state = harness(parent);
    const trashed: ContentDocument = { ...section(), _id: 'Section:section-one', revision: 2, deletedAt: new Date().toISOString(), purgeAt: new Date(Date.now() + 86400000) };
    state.content.set(trashed._id, trashed);
    await assert.rejects(contentActionInTransaction({ id: trashed.id, type: 'Section', expectedRevision: 2, action: 'restore' }, state.db, session, 'cms'), error => error instanceof HttpError && error.status === 409);
    assert.equal(state.content.get(trashed._id)?.revision, 2);
    assert.ok(state.content.get(trashed._id)?.deletedAt);
  }
  for (const parentId of ['custom', 'shared']) {
    const state = harness(parentId === 'shared' ? undefined : page());
    const trashed: ContentDocument = { ...section(parentId), _id: 'Section:section-one', revision: 2, deletedAt: new Date().toISOString(), purgeAt: new Date(Date.now() + 86400000) };
    state.content.set(trashed._id, trashed);
    const restored = await contentActionInTransaction({ id: trashed.id, type: 'Section', expectedRevision: 2, action: 'restore' }, state.db, session, 'cms');
    assert.equal(restored.deletedAt, undefined);
    assert.equal(restored.revision, 3);
  }
});

test('draft parent pages and shared sections remain valid authoring destinations', async () => {
  for (const parentId of ['custom', 'shared']) {
    const state = harness(parentId === 'shared' ? undefined : page());
    const record = { ...section(parentId), image: imageUrl, mobileImage: imageUrl, gallery: [{ url: imageUrl, alt: '', altTh: '' }] };
    const input = saveSchema.parse({ record, expectedRevision: null, submissionId: state.submissionId });
    const saved = await saveContentInTransaction(input, owner, state.db, session);
    assert.equal(saved.revision, 1); assert.equal(state.mediaCommits(), 1); assert.equal(state.media.get('test-image')?.state, 'committed'); assert.equal(state.operations.size, 1);
  }
});

test('idempotent retries preserve the authoritative result when the parent changes later', async () => {
  const state = harness(page());
  const input = saveSchema.parse({ record: section(), expectedRevision: null, submissionId: state.submissionId });
  const saved = await saveContentInTransaction(input, owner, state.db, session);
  state.content.delete('Page:custom');
  assert.deepEqual(await saveContentInTransaction(input, owner, state.db, session), saved);
  await assert.rejects(saveContentInTransaction({ ...input, record: { ...input.record, title: 'Different input' } }, owner, state.db, session), error => error instanceof HttpError && error.status === 409);
  assert.equal(state.operations.size, 1);
});

test('revision conflicts and another submission’s staged media remain protected', async () => {
  const state = harness(page());
  const input = saveSchema.parse({ record: section(), expectedRevision: null, submissionId: state.submissionId });
  await saveContentInTransaction(input, owner, state.db, session);
  await assert.rejects(saveContentInTransaction({ ...input, submissionId: randomUUID() }, owner, state.db, session), error => error instanceof HttpError && error.status === 409);
  const other = harness(page());
  const imageInput = saveSchema.parse({ record: { ...section(), image: imageUrl }, expectedRevision: null, submissionId: randomUUID() });
  await assert.rejects(saveContentInTransaction(imageInput, owner, other.db, session), error => error instanceof HttpError && error.status === 403);
  assert.equal(other.mediaCommits(), 0);
});

test('CMS creation and renamed identities cannot add pages or page sections, including shared sections', async () => {
  for (const record of [{ ...page(), id: 'new-page' }, section(), section('shared')]) {
    const state = harness(page());
    const input = saveSchema.parse({ record: { ...record, image: imageUrl }, expectedRevision: null, submissionId: state.submissionId });
    await assert.rejects(saveContentInTransaction(input, owner, state.db, session, 'cms'), error => error instanceof HttpError && error.status === 403 && error.message.includes('cannot be added'));
    assert.equal(state.content.size, 1);
    assert.equal(state.content.get('Page:custom')?.revision, 1);
    assert.equal(state.mediaCommits(), 0);
    assert.equal(state.operations.size, 0);
  }
});

test('CMS page and section edits cannot change their placement, layout, or icon', async () => {
  const storedSection: ContentDocument = { ...page(), ...section('shared'), type: 'Section', _id: 'Section:section-one', revision: 1, order: 2, icon: 'Ship', categoryTh: 'ส่วน' };
  for (const existing of [page(), storedSection]) {
    for (const change of [{ parentId: 'other-page' }, { order: 4 }, { icon: 'Anchor' }, { category: 'Different' }, { categoryTh: 'เปลี่ยน' }]) {
      const state = harness(existing);
      const input = saveSchema.parse({ record: { ...existing, ...change, image: imageUrl }, expectedRevision: existing.revision, submissionId: state.submissionId });
      await assert.rejects(saveContentInTransaction(input, owner, state.db, session, 'cms'), error => error instanceof HttpError && error.status === 403 && error.message.includes('layout is fixed'));
      assert.deepEqual(state.content.get(existing._id), existing);
      assert.equal(state.mediaCommits(), 0);
      assert.equal(state.operations.size, 0);
    }
  }
});

test('CMS copy and image updates publish existing page content and retry idempotently', async () => {
  const storedSection: ContentDocument = { ...page(), ...section(), type: 'Section', _id: 'Section:section-one', revision: 1, order: 2, icon: 'Ship' };
  for (const existing of [page(), storedSection]) {
    const state = harness(page());
    state.content.set(existing._id, existing);
    const input = saveSchema.parse({
      record: { ...existing, title: 'Updated copy', titleTh: 'ข้อความใหม่', body: 'New details', bodyTh: 'รายละเอียดใหม่', image: imageUrl, mobileImage: imageUrl, gallery: [{ url: imageUrl, alt: 'New image', altTh: 'รูปใหม่' }], status: 'Published' },
      expectedRevision: 1,
      submissionId: state.submissionId,
    });
    const saved = await saveContentInTransaction(input, owner, state.db, session, 'cms');
    assert.equal(saved.title, 'Updated copy');
    assert.equal(saved.status, 'Published');
    assert.equal(saved.revision, 2);
    assert.equal(saved.parentId, existing.parentId ?? '');
    assert.equal(saved.order, existing.order ?? 0);
    assert.equal(saved.icon, existing.icon ?? '');
    assert.equal(state.mediaCommits(), 1);
    assert.deepEqual(await saveContentInTransaction(input, owner, state.db, session, 'cms'), saved);
    await assert.rejects(saveContentInTransaction({ ...input, submissionId: randomUUID() }, owner, state.db, session, 'cms'), error => error instanceof HttpError && error.status === 409);
  }
});

test('CMS page and section Trash is blocked while historical Trash can still be restored', async () => {
  const fixedRecords: ContentDocument[] = [page(), { ...page(), id: 'home', _id: 'Page:home', status: 'Published' }, { ...page(), ...section('shared'), type: 'Section', _id: 'Section:section-one', revision: 1 }];
  for (const existing of fixedRecords) {
    const state = harness(existing);
    await assert.rejects(contentActionInTransaction({ type: existing.type, id: existing.id, expectedRevision: 1, action: 'trash' }, state.db, session, 'cms'), error => error instanceof HttpError && error.status === 403);
    assert.equal(existing.deletedAt, undefined);
    assert.equal(existing.revision, 1);
    existing.deletedAt = new Date().toISOString();
    existing.purgeAt = new Date(Date.now() + 86400000);
    const restored = await contentActionInTransaction({ type: existing.type, id: existing.id, expectedRevision: 1, action: 'restore' }, state.db, session, 'cms');
    assert.equal(restored.deletedAt, undefined);
    assert.equal(state.content.get(existing._id)?.purgeAt, undefined);
    assert.equal(restored.revision, 2);
  }
});

test('CMS collection records still support creation and recoverable deletion', async () => {
  for (const type of ['Vessel', 'Project', 'News', 'Service', 'Route'] as const) {
    const state = harness();
    const input = saveSchema.parse({ record: { ...page(), type, id: 'collection-item' }, expectedRevision: null, submissionId: state.submissionId });
    const saved = await saveContentInTransaction(input, owner, state.db, session, 'cms');
    assert.equal(saved.revision, 1);
    assert.equal(saved.status, 'Published', 'A CMS Save makes the item available even when a client sends a legacy status.');
    const trashed = await contentActionInTransaction({ type, id: saved.id, expectedRevision: saved.revision, action: 'trash' }, state.db, session, 'cms');
    assert.ok(trashed.deletedAt);
    assert.equal(trashed.revision, 2);
  }
});

test('historical content stays unchanged until explicitly saved through the CMS', async () => {
  const legacy = page();
  const state = harness(legacy);
  const collectionInput = saveSchema.parse({
    record: { ...legacy, type: 'Vessel', id: 'new-vessel' },
    expectedRevision: null, submissionId: state.submissionId,
  });
  const vessel = await saveContentInTransaction(collectionInput, owner, state.db, session, 'cms');
  assert.equal(vessel.status, 'Published');
  assert.equal(state.content.get(legacy._id)?.status, 'Draft');
  assert.equal(state.content.get(legacy._id)?.revision, 1);

  const input = saveSchema.parse({
    record: { ...legacy, title: 'Explicitly saved page' },
    expectedRevision: 1, submissionId: randomUUID(),
  });
  const saved = await saveContentInTransaction(input, owner, state.db, session, 'cms');
  assert.equal(saved.status, 'Published');
  assert.equal(saved.revision, 2);
  assert.equal(state.content.get(legacy._id)?.status, 'Published');
  assert.equal(input.record.status, 'Draft', 'Normalization must not mutate caller data.');
  assert.deepEqual(await saveContentInTransaction(input, owner, state.db, session, 'cms'), saved);
  assert.deepEqual(await saveContentInTransaction({ ...input, record: { ...input.record, status: 'Published' } }, owner, state.db, session, 'cms'), saved);
  await assert.rejects(saveContentInTransaction({ ...input, record: { ...input.record, title: 'Changed retry' } }, owner, state.db, session, 'cms'), error => error instanceof HttpError && error.status === 409);
  assert.equal(state.content.get(legacy._id)?.revision, 2);
});

test('trusted maintenance retains historical status and idempotent retries', async () => {
  const state = harness(page());
  const input = saveSchema.parse({ record: { ...section(), image: imageUrl }, expectedRevision: null, submissionId: state.submissionId });
  const saved = await saveContentInTransaction(input, owner, state.db, session);
  assert.equal(saved.status, 'Draft');
  assert.equal(state.content.get('Page:custom')?.status, 'Draft');
  assert.deepEqual(await saveContentInTransaction(input, owner, state.db, session), saved);
  assert.equal(state.mediaCommits(), 1);
  assert.equal(state.operations.size, 1);
});
