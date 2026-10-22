import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { ClientSession, Db } from 'mongodb';
import { saveContentInTransaction } from '../src/server/content';
import { HttpError } from '../src/server/http';
import { saveSchema } from '../src/server/validation';
import type { ContentDocument, MediaDocument } from '../src/server/db';
import type { ContentRecord } from '../src/lib/cms-types';

const owner = 'test-admin';
const imageUrl = 'https://res.cloudinary.com/test/image/upload/test-image.webp';
const session = {} as ClientSession;
const page = (deletedAt?: string): ContentDocument => ({ _id: 'Page:custom', id: 'custom', type: 'Page', title: 'Page', titleTh: 'หน้า', description: 'Page summary', descriptionTh: 'สรุป', category: 'Page', image: imageUrl, status: 'Draft', revision: 1, ...(deletedAt ? { deletedAt } : {}) });
const section = (parentId = 'custom') => ({ id: 'section-one', type: 'Section', parentId, title: 'Section', titleTh: 'ส่วน', description: '', descriptionTh: '', category: 'Section', image: '', status: 'Draft' });

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
