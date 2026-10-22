import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordSchema, vesselSpecsSchema } from '../src/lib/validation';
import { contentBelongsToPage, publishedContentUrl } from '../src/lib/cms-navigation';
import { projectPublicContent } from '../src/lib/public-content';
import type { ContentRecord } from '../src/lib/cms-types';

const vessel: ContentRecord = { id: 'verified-vessel', type: 'Vessel', title: 'Vessel', titleTh: 'เรือ', description: 'Summary', descriptionTh: 'สรุป', image: 'https://res.cloudinary.com/example/image/upload/vessel.webp', category: 'Cargo', status: 'Published', revision: 1 };
const home: ContentRecord = { ...vessel, id: 'home', type: 'Page' };

test('vessel details remain optional without adding fabricated defaults', () => {
  const parsed = recordSchema.parse(vessel);
  assert.equal(parsed.vesselSpecs, undefined);
  assert.deepEqual(vesselSpecsSchema.parse({}), {});
  const details = vesselSpecsSchema.parse({ capacityTeu: 0, flag: '', flagTh: '' });
  assert.equal(details.capacityTeu, 0);
  assert.equal(details.flag, undefined);
  assert.equal(details.lengthM, undefined);
});

test('vessel identity and measurements reject mistyped or impossible values', () => {
  assert.equal(vesselSpecsSchema.safeParse({ imo: '7654329' }).success, true);
  for (const imo of ['7654321', '765432', 'IMO7654329', '0000000']) assert.equal(vesselSpecsSchema.safeParse({ imo }).success, false);
  for (const specs of [{ lengthM: -1 }, { lengthM: Number.POSITIVE_INFINITY }, { capacityTeu: 1.5 }, { draftM: 0 }, { lengthM: 80, beamM: 90 }, { yearBuilt: new Date().getUTCFullYear() + 1 }]) assert.equal(vesselSpecsSchema.safeParse(specs).success, false);
});

test('bilingual vessel statements require both languages and stay scoped to vessels', () => {
  assert.equal(vesselSpecsSchema.safeParse({ flag: 'Thailand' }).success, false);
  assert.equal(vesselSpecsSchema.safeParse({ availabilityTh: 'ติดต่อสอบถาม' }).success, false);
  const specs = { flag: 'Thailand', flagTh: 'ไทย', availability: 'Contact for availability', availabilityTh: 'ติดต่อสอบถามความพร้อม' };
  assert.equal(vesselSpecsSchema.safeParse(specs).success, true);
  assert.equal(recordSchema.safeParse({ ...vessel, type: 'News', vesselSpecs: specs }).success, false);
});

test('public projection exposes supplied vessel details only for published active records', () => {
  const specs = { lengthM: 110, beamM: 22, imo: '7654329' };
  const published = { ...vessel, vesselSpecs: specs };
  const result = projectPublicContent([published, { ...published, id: 'draft', status: 'Draft' }, { ...published, id: 'trash', deletedAt: new Date().toISOString() }]);
  assert.equal(result.vessels.length, 1);
  assert.deepEqual(result.vessels[0].specs, specs);
  assert.equal('capacityTeu' in result.vessels[0].specs, false);
});

test('page filters include the page and its sections without unrelated content', () => {
  const section: ContentRecord = { ...vessel, id: 'home-intro', type: 'Section', parentId: 'home' };
  assert.equal(contentBelongsToPage(home, 'home'), true);
  assert.equal(contentBelongsToPage(section, 'home'), true);
  assert.equal(contentBelongsToPage({ ...section, parentId: 'about' }, 'home'), false);
  assert.equal(contentBelongsToPage(vessel, 'home'), false);
  assert.equal(contentBelongsToPage(vessel, 'All'), true);
});

test('published preview links respect locale, draft state and section parent visibility', () => {
  const section: ContentRecord = { ...vessel, id: 'home-intro', type: 'Section', parentId: 'home' };
  assert.equal(publishedContentUrl(vessel, [], 'en'), '/en/fleet/verified-vessel');
  assert.equal(publishedContentUrl(home, [home], 'en'), '/en');
  assert.equal(publishedContentUrl(section, [home], 'th'), '/');
  assert.equal(publishedContentUrl(section, [], 'th'), null);
  assert.equal(publishedContentUrl({ ...vessel, status: 'Draft' }, [], 'en'), null);
  assert.equal(publishedContentUrl({ ...vessel, deletedAt: new Date().toISOString() }, [], 'th'), null);
});
