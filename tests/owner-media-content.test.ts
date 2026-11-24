import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOwnerMedia } from '../scripts/data/owner-media-content';
import { defaultHomeSlides, fleetPhotoSlides } from '../src/lib/home-slides';
import { fleetPhotos, originalFleetPhotos } from '../src/lib/fleet-photos';
import { clientFleetRecords } from '../scripts/data/client-fleet';
import type { ContentRecord } from '../src/lib/cms-types';

test('owner import replaces a reviewed fleet cover while preserving additional CMS photographs and captions', () => {
  const original = clientFleetRecords.find(record => record.id === 'moe-line-4')!;
  const [cover, alternate] = originalFleetPhotos['moe-line-4'];
  const custom = {url: 'https://example.com/custom.webp', alt: 'A saved custom photograph', altTh: 'ภาพเพิ่มเติม'};
  const saved: ContentRecord = { ...original, image: 'https://example.com/registered-cover.webp', gallery: [custom, { ...alternate, alt: 'Reviewed caption' }] };
  const result = applyOwnerMedia(saved, url => url === saved.image ? cover.url : url);
  assert.equal(result.image, fleetPhotos['moe-line-4'][0].url);
  assert.deepEqual(result.gallery![0], custom);
  assert.equal(result.gallery!.find(item => item.url === alternate.url)?.alt, 'Reviewed caption');
  assert.deepEqual(applyOwnerMedia(result), result);
  assert.deepEqual(applyOwnerMedia({ ...saved, image: custom.url }).gallery, saved.gallery);
  assert.equal(applyOwnerMedia({ ...saved, status: 'Draft' }).image, saved.image);
});

test('the new carousel replaces its previous crop once, preserves custom slides and respects later removals', () => {
  const base = { id:'home', type:'Page', image:'', heroSlides:[fleetPhotoSlides[0]] };
  assert.deepEqual(applyOwnerMedia(base).heroSlides, defaultHomeSlides);
  const custom = { url:'https://example.com/mine.webp', alt:'My slide', altTh:'ภาพของฉัน' };
  const full = { ...base, heroSlides: Array.from({length:12}, (_, index) => ({...custom, url:custom.url + index})) };
  assert.deepEqual(applyOwnerMedia(full).heroSlides, full.heroSlides);
  const edited = { ...base, heroSlides: [defaultHomeSlides[2], custom] };
  assert.deepEqual(applyOwnerMedia(edited).heroSlides, edited.heroSlides);
});
