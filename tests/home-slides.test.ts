import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { ClientSession, Db } from 'mongodb';
import type { ContentRecord } from '../src/lib/cms-types';
import { defaultHomeSlides, getHomeSlides, getHomeSlideInterval } from '../src/lib/home-slides';
import { saveHomeSlidesSchema, saveSchema } from '../src/lib/validation';
import { mapRecordImages, recordImageUrls } from '../src/lib/cms-client';
import { saveContentInTransaction } from '../src/server/content';
import { saveHomeSlidesInTransaction } from '../src/server/home-slides';
import { contentMediaUrls, contentMediaReferenceFilter } from '../src/server/media-references';
import { HttpError } from '../src/server/http';
import type { AuditDocument, ContentDocument, MediaDocument, UserDocument } from '../src/server/db';

const session = {} as ClientSession;
const actor: UserDocument = { _id: 'slider-operator', username: 'operator', role: 'Operator', passwordHash: 'unused', passwordVersion: 1, createdAt: new Date() };
const storedImage = 'https://res.cloudinary.com/test/image/upload/home.webp';
const uploadedImage = 'https://res.cloudinary.com/test/image/upload/new-slide.webp';
const home = (): ContentDocument => ({ _id: 'Page:home', id: 'home', type: 'Page', title: 'Original home', titleTh: 'หน้าแรก', description: 'Original summary', descriptionTh: 'ข้อความเดิม', category: 'Page', image: storedImage, status: 'Published', revision: 4, body: 'Keep this body', order: 0 });

function harness(submissionId = randomUUID()) {
  const content = new Map<string, ContentDocument>([['Page:home', home()]]);
  const media = new Map<string, MediaDocument>([
    ['original', { _id: 'original', id: 'original', title: 'Original', url: storedImage, state: 'committed', owner: actor._id, submissionId, pinned: false, touchedAt: new Date(), createdAt: new Date().toISOString() }],
    ['uploaded', { _id: 'uploaded', id: 'uploaded', title: 'New slide', url: uploadedImage, state: 'staged', owner: actor._id, submissionId, pinned: false, touchedAt: new Date(), createdAt: new Date().toISOString() }],
  ]);
  const operations = new Map<string, { fingerprint: string; result: ContentRecord }>();
  const events: AuditDocument[] = [];
  const writes: { name: string; options: unknown }[] = [];
  const db = { collection: (name: string) => {
    if (name === 'moe_content') return {
      findOne: async (filter: { _id: string }) => content.get(filter._id) || null,
      replaceOne: async (filter: { _id: string }, record: ContentRecord, options: unknown) => { content.set(filter._id, { ...record, _id: filter._id }); writes.push({ name, options }); },
    };
    if (name === 'moe_media') return {
      findOne: async (filter: { url: string }) => { const found = [...media.values()].find(item => item.url === filter.url); return found ? { ...found } : null; },
      updateOne: async (filter: { _id: string }, update: { $set: Partial<MediaDocument> }, options: unknown) => { Object.assign(media.get(filter._id)!, update.$set); writes.push({ name, options }); },
    };
    if (name === 'moe_operations') return {
      findOne: async (filter: { _id: string }) => operations.get(filter._id) || null,
      insertOne: async (operation: { _id: string; fingerprint: string; result: ContentRecord }, options: unknown) => { operations.set(operation._id, operation); writes.push({ name, options }); },
    };
    if (name === 'moe_state') return { findOneAndUpdate: async () => ({ value: 'open' }) };
    if (name === 'moe_logs') return { insertOne: async (event: AuditDocument, options: unknown) => { events.push(event); writes.push({ name, options }); } };
    return {};
  } } as unknown as Db;
  return { db, content, media, operations, events, writes, submissionId };
}

test('legacy home records receive five independent defaults and a safe three-second interval', () => {
  assert.equal(getHomeSlides(home()).length, 5);
  assert.equal(getHomeSlideInterval(home()), 3);
  const copy = getHomeSlides();
  copy[0].alt = 'Changed local preview';
  assert.notEqual(getHomeSlides()[0].alt, copy[0].alt);
  for (const heroSlideInterval of [0, 1, 16, 2.5, NaN]) assert.equal(getHomeSlideInterval({ heroSlideInterval }), 3);
  assert.equal(getHomeSlideInterval({ heroSlideInterval: 8 }), 8);
});

test('slider validation bounds interval, count, duplicate URLs and home-only fields', () => {
  const valid = { slides: getHomeSlides(), intervalSeconds: 3, expectedRevision: 4, submissionId: randomUUID() };
  assert.equal(saveHomeSlidesSchema.safeParse(valid).success, true);
  for (const change of [{ slides: [] }, { slides: Array(13).fill(defaultHomeSlides[0]) }, { slides: [defaultHomeSlides[0], defaultHomeSlides[0]] }, { intervalSeconds: 1 }, { intervalSeconds: 16 }, { intervalSeconds: 2.5 }, { expectedRevision: 0 }, { submissionId: '' }, { record: home() }]) {
    assert.equal(saveHomeSlidesSchema.safeParse({ ...valid, ...change }).success, false);
  }
  assert.equal(saveSchema.safeParse({ record: { ...home(), id: 'about', heroSlides: getHomeSlides() }, expectedRevision: 4, submissionId: randomUUID() }).success, false);
});

test('saving order and timing preserves page content and commits uploads with an audit in one session', async () => {
  const state = harness();
  const slides = [{ url: uploadedImage, alt: 'Uploaded', altTh: 'ภาพใหม่' }, ...getHomeSlides().reverse()];
  const input = saveHomeSlidesSchema.parse({ slides, intervalSeconds: 7, expectedRevision: 4, submissionId: state.submissionId });
  const saved = await saveHomeSlidesInTransaction(input, actor, state.db, session);
  assert.deepEqual(saved.heroSlides, slides);
  assert.equal(saved.heroSlideInterval, 7);
  assert.equal(saved.title, home().title);
  assert.equal(saved.body, home().body);
  assert.equal(saved.image, home().image);
  assert.equal(saved.revision, 5);
  assert.equal(state.media.get('uploaded')?.state, 'committed');
  assert.deepEqual(state.events.map(event => event.action), ['media.uploaded', 'content.updated']);
  assert.ok(state.writes.length > 0);
  for (const write of state.writes) assert.deepEqual(write.options, { session });
});

test('uncertain slider saves retry idempotently even after a later copy edit', async () => {
  const state = harness();
  const input = saveHomeSlidesSchema.parse({ slides: getHomeSlides(), intervalSeconds: 3, expectedRevision: 4, submissionId: state.submissionId });
  const saved = await saveHomeSlidesInTransaction(input, actor, state.db, session);
  const current = state.content.get('Page:home')!;
  current.title = 'Later copy edit'; current.revision++;
  const writeCount = state.writes.length;
  assert.deepEqual(await saveHomeSlidesInTransaction(input, actor, state.db, session), saved);
  assert.equal(state.writes.length, writeCount);
  assert.equal(state.content.get('Page:home')?.title, 'Later copy edit');
  await assert.rejects(saveHomeSlidesInTransaction({ ...input, intervalSeconds: 4 }, actor, state.db, session), error => error instanceof HttpError && error.status === 409);
});

test('revision conflicts, unregistered images and foreign submissions are rejected', async () => {
  for (const change of [
    { expectedRevision: 3 },
    { slides: [{ url: 'https://example.test/unregistered.webp', alt: '', altTh: '' }] },
    { slides: [{ url: uploadedImage, alt: '', altTh: '' }], submissionId: randomUUID() },
    { slides: [{ url: '/images/hero/unapproved.webp', alt: '', altTh: '' }] },
  ]) {
    const state = harness();
    const input = saveHomeSlidesSchema.parse({ slides: getHomeSlides(), intervalSeconds: 3, expectedRevision: 4, submissionId: state.submissionId, ...change });
    await assert.rejects(saveHomeSlidesInTransaction(input, actor, state.db, session), error => error instanceof HttpError && [400, 403, 409].includes(error.status));
    assert.equal(state.content.get('Page:home')?.revision, 4);
    assert.equal(state.media.get('uploaded')?.state, 'staged');
    assert.equal(state.operations.size, 0);
    assert.equal(state.events.length, 0);
  }
});

test('ordinary home edits preserve omitted slider fields', async () => {
  const state = harness();
  const existing = state.content.get('Page:home')!;
  existing.heroSlides = getHomeSlides(); existing.heroSlideInterval = 9;
  const input = saveSchema.parse({ record: { ...home(), title: 'Updated heading' }, expectedRevision: 4, submissionId: state.submissionId });
  const saved = await saveContentInTransaction(input, actor._id, state.db, session, 'cms', actor);
  assert.equal(saved.title, 'Updated heading');
  assert.deepEqual(saved.heroSlides, existing.heroSlides);
  assert.equal(saved.heroSlideInterval, 9);
});

test('slide media participates in cleanup protection, usage queries and client reconciliation', () => {
  const record = { ...home(), heroSlides: [{ url: uploadedImage, alt: 'New', altTh: 'ใหม่' }] };
  assert.deepEqual(contentMediaUrls(record), [storedImage, uploadedImage]);
  assert.deepEqual(recordImageUrls(record), [storedImage, uploadedImage]);
  assert.ok(contentMediaReferenceFilter(uploadedImage).$or?.some(filter => filter['heroSlides.url'] === uploadedImage));
  const mapped = mapRecordImages(record, url => url === uploadedImage ? '/mapped.webp' : url);
  assert.equal(mapped.heroSlides[0].url, '/mapped.webp');
  assert.equal(record.heroSlides[0].url, uploadedImage);
});
