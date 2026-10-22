import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { changeEditorContentType, createEditorDraftExport, mapRecordImages, parseRouteCoordinates, recordImageUrls, refreshWebsiteDetailsDraft } from '../src/lib/cms-client';
import { clearVerifiedLegacy, getLegacySubmission, hasLegacyArchive, legacyRecordMatches, readLegacySnapshot, rememberLegacyMedia, rememberLegacyRecord, restoreLegacyArchive, saveLegacySubmission } from '../src/lib/cms-legacy';
import type { ContentRecord, MediaItem, SiteSettings } from '../src/lib/cms-types';
import { recordSchema } from '../src/lib/validation';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }, configurable: true });
const local: ContentRecord = { id: 'test-story', type: 'News', title: 'Story', titleTh: 'ข่าว', description: 'Summary', descriptionTh: 'สรุป', image: '/images/hero.webp', category: 'News', status: 'Draft', revision: 1 };
const media: MediaItem = { id: 'media-1', title: 'Hero', url: 'https://res.cloudinary.com/test/image/upload/hero.webp', state: 'committed', createdAt: '2026-10-23T00:00:00Z', sourcePath: '/images/hero.webp' };
beforeEach(() => values.clear());

test('route coordinates reject incomplete or out of range input', () => {
  assert.deepEqual(parseRouteCoordinates('13.08, 100.88\n1.2, 103.8'), [[13.08, 100.88], [1.2, 103.8]]);
  assert.throws(() => parseRouteCoordinates('13, '), /line 1/);
  assert.throws(() => parseRouteCoordinates('91, 100'), /valid range/);
  assert.throws(() => parseRouteCoordinates('13, 100, 20'), /latitude, longitude/);
});
test('image projection covers mobile and every gallery item and deduplicates uploads', () => {
  const source = { image: 'one', mobileImage: 'two', gallery: [{ url: 'one', alt: 'A', altTh: 'ก' }, { url: 'three', alt: '', altTh: '' }] };
  assert.deepEqual(recordImageUrls(source), ['one', 'two', 'three']);
  assert.deepEqual(mapRecordImages(source, url => `saved:${url}`).gallery.map(item => item.url), ['saved:one', 'saved:three']);
  assert.equal(source.image, 'one');
});

test('workspace refresh updates pristine details but preserves dirty values and their revision', () => {
  const saved: SiteSettings = { companyName: 'MOE', companyNameTh: 'โมอี', officeAddress: '', officeAddressTh: '', phone: '', email: '', mapUrl: '', revision: 1 };
  const latest = { ...saved, phone: '+66 12345678', revision: 2 };
  assert.deepEqual(refreshWebsiteDetailsDraft(null, latest), { saved: latest, draft: latest });
  assert.deepEqual(refreshWebsiteDetailsDraft({ saved, draft: { ...saved } }, latest), { saved: latest, draft: latest });
  const dirty = { saved, draft: { ...saved, email: 'draft@example.com' } };
  assert.equal(refreshWebsiteDetailsDraft(dirty, latest), dirty);
  assert.equal(dirty.saved.revision, 1, 'Keep the conflict check against the original saved revision.');
  assert.equal(dirty.draft.email, 'draft@example.com');
});

test('draft downloads retain changed route points and incomplete raw coordinate text', () => {
  const route: ContentRecord = { ...local, type: 'Route', waypoints: [[13, 100], [14, 101]] };
  const valid = createEditorDraftExport(route, '13.08, 100.88\n1.2, 103.8');
  assert.deepEqual(valid.record.waypoints, [[13.08, 100.88], [1.2, 103.8]]);
  assert.deepEqual(route.waypoints, [[13, 100], [14, 101]], 'Exporting must not change the open editor.');
  const unfinished = createEditorDraftExport(route, '13.08, 100.88\n1.2, ');
  assert.equal(unfinished.routeCoordinatesText, '13.08, 100.88\n1.2, ');
  assert.deepEqual(unfinished.record.waypoints, route.waypoints);
  assert.equal(createEditorDraftExport(local, 'ignored').routeCoordinatesText, undefined);
  assert.match(valid.note, /image files are not included/);
});

test('changing a new content type identifies incompatible fields before clearing them', () => {
  const vessel: ContentRecord = { ...local, type: 'Vessel', vesselSpecs: { lengthM: 120, capacityTeu: 0 }, gallery: [{ url: media.url, alt: 'Ship', altTh: 'เรือ' }] };
  const article = changeEditorContentType(vessel, 'News', '');
  assert.deepEqual(article.discardedFields, ['vessel specifications']);
  assert.equal(article.record.vesselSpecs, undefined);
  assert.deepEqual(article.record.gallery, vessel.gallery);
  assert.equal(article.record.title, vessel.title);
  assert.equal(recordSchema.safeParse(article.record).success, true);
  assert.deepEqual(vessel.vesselSpecs, { lengthM: 120, capacityTeu: 0 }, 'Cancelling keeps the original draft intact.');
  const route: ContentRecord = { ...local, type: 'Route', origin: { name: 'Partly entered port', nameTh: '', country: '', countryTh: '' } };
  const service = changeEditorContentType(route, 'Service', '13, ');
  assert.deepEqual(service.discardedFields, ['route ports and coordinates']);
  assert.equal(service.record.origin, undefined);
  assert.equal(service.record.waypoints, undefined);
  assert.equal(recordSchema.safeParse(service.record).success, true);
  assert.equal(route.origin?.name, 'Partly entered port');
});
test('verified clearing archives exact browser data and restoration refuses newer data', async () => {
  const raw = JSON.stringify([local]); values.set('moe-content-v1', raw);
  await clearVerifiedLegacy(readLegacySnapshot(), [{ ...local, image: media.url, body: 'New independent server field' }], [media]);
  assert.equal(values.has('moe-content-v1'), false); assert.equal(hasLegacyArchive(), true);
  restoreLegacyArchive(); assert.equal(values.get('moe-content-v1'), raw);
  assert.throws(restoreLegacyArchive, /newer local data/);
});
test('changed local content cannot be cleared without reviewed save receipt', async () => {
  values.set('moe-content-v1', JSON.stringify([local])); const changed = { ...local, title: 'Reviewed version', image: media.url };
  await assert.rejects(clearVerifiedLegacy(readLegacySnapshot(), [changed], [media]), /not been verified/);
  assert.equal(values.has('moe-content-v1'), true);
  await rememberLegacyRecord(local, changed);
  assert.equal(await legacyRecordMatches(local, changed, [media], readLegacySnapshot()), true);
  assert.equal(await legacyRecordMatches(local, { ...changed, title: 'Later edit' }, [media], readLegacySnapshot()), false);
});
test('clear blocks browser changes after preview and unverified standalone images', async () => {
  values.set('moe-content-v1', JSON.stringify([local])); const snapshot = readLegacySnapshot(); values.set('moe-content-v1', JSON.stringify([{ ...local, title: 'New browser edit' }]));
  await assert.rejects(clearVerifiedLegacy(snapshot, [{ ...local, image: media.url }], [media]), /changed during verification/);
  values.clear(); values.set('moe-media-v1', JSON.stringify([{ id: 'local', title: 'Local photo', image: 'data:image/webp;base64,AA==' }]));
  await assert.rejects(clearVerifiedLegacy(readLegacySnapshot(), [], [media]), /not been verified/);
  await rememberLegacyMedia('data:image/webp;base64,AA==', media.url); await clearVerifiedLegacy(readLegacySnapshot(), [], [media]); assert.equal(values.has('moe-media-v1'), false);
});
test('local Trash remains reviewable and cannot be silently replaced by an active draft', async () => {
  const trashed = { ...local, deletedAt: new Date().toISOString() }; values.set('moe-content-v1', JSON.stringify([trashed]));
  assert.equal(readLegacySnapshot().records.length, 1);
  await assert.rejects(clearVerifiedLegacy(readLegacySnapshot(), [local], [media]), /not been verified/);
  await rememberLegacyRecord(trashed, local); await clearVerifiedLegacy(readLegacySnapshot(), [local], [media]); assert.equal(hasLegacyArchive(), true);
});
test('migration submissions persist across reloads until their save receipt is stored', async () => {
  const first = await getLegacySubmission('image:data'); await saveLegacySubmission('image:data', { ...first, attempts: 2 });
  assert.deepEqual(await getLegacySubmission('image:data'), { ...first, attempts: 2 });
  await saveLegacySubmission('image:data', null); assert.notEqual((await getLegacySubmission('image:data')).id, first.id);
});
