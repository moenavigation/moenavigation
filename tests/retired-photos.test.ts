import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import test from 'node:test';
import identities from '../src/server/retired-photo-identities.json';
import { isRetiredMedia, replaceRetiredContentPhotos, retiredPhotoSource, selectableMediaFilter } from '../src/server/retired-photos';
import { companyPhotoReplacements } from '../src/lib/company-photo-replacements';
import { defaultHomeSlides } from '../src/lib/home-slides';
import type { ContentRecord, HomeSlide } from '../src/lib/cms-types';

const page: ContentRecord = { id: 'home', type: 'Page', title: 'Home', titleTh: '', description: '', descriptionTh: '', status: 'Published', category: '', image: '', revision: 5 };
const identity = identities.find(item => item.source === '/images/bridge.webp')!;
const photo = companyPhotoReplacements[identity.source];
const legacy = { url: identity.url!, alt: 'Old scene', altTh: '' };
const custom = { url: 'https://example.org/company-upload.webp', alt: 'Independent upload', altTh: '' };
const video: HomeSlide = { ...custom, url: 'https://example.org/company-video.webm', kind: 'video' };

test('retired public files are absent and every known source resolves to an existing verified photograph', () => {
  for (const item of identities) {
    if (item.source.startsWith('/')) assert.equal(existsSync('public' + item.source), false, item.source);
    for (const url of [item.source, item.url].filter((value): value is string => Boolean(value))) {
      const updated = replaceRetiredContentPhotos({ ...page, image: url });
      assert.notEqual(updated.image, url, url);
      assert(existsSync('public' + updated.image), updated.image);
      assert(updated.imageAlt && updated.imageAltTh, url);
    }
    assert(isRetiredMedia({ url: '', sourceSha256: item.sha256 }));
    assert(selectableMediaFilter.sourceSha256.$nin.includes(item.sha256));
    if (item.id) assert(selectableMediaFilter._id.$nin.includes(item.id));
  }
  assert.equal(isRetiredMedia({ ...custom, id: 'a-client-upload', sourcePath: '/images/about/ship-maintenance.webp' }), false);
});

test('historical main, mobile, gallery and slides adopt the actual photo while preserving user-selected images, alt text, video and business copy', () => {
  const edited = { ...photo, alt: 'Edited photograph description' };
  const input = { ...page, image: legacy.url, mobileImage: legacy.url, caption: 'Established in 2022', imageAlt: legacy.alt,
    gallery: [legacy, custom, edited], heroSlides: [video, { ...legacy, url: '/images/hero/01-open-water.webp' }, custom] };
  const updated = replaceRetiredContentPhotos(input);
  assert.equal(updated.image, photo.url);
  assert.equal(updated.imageAlt, photo.alt);
  assert.equal(updated.mobileImage, photo.url);
  assert.equal(updated.caption, input.caption);
  assert.deepEqual(updated.gallery, [custom, edited]);
  assert.deepEqual(updated.heroSlides, [video, defaultHomeSlides[0], custom]);
  assert.equal(replaceRetiredContentPhotos(updated), updated);
  assert.equal(input.image, legacy.url);
});

test('isolated restore delivery URLs retain retirement by original media ID and bytes', () => {
  const idDigest = createHash('sha256').update(identity.id!).digest('hex').slice(0,20);
  const url = `https://res.cloudinary.com/restore/image/upload/v99/moe-navigation/recovery/managed-restore/${idDigest}-${identity.sha256.slice(0,16)}.webp`;
  assert.equal(retiredPhotoSource(url), identity.source);
  assert.equal(replaceRetiredContentPhotos({ ...page, image: url }).image, photo.url);
  assert(isRetiredMedia({ url, id: identity.id }));
  assert.equal(retiredPhotoSource(url.replace('/recovery/', '/owned/')), undefined);
  assert.equal(retiredPhotoSource(url.replace(idDigest, '0'.repeat(20))), undefined);
});
