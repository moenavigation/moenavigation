import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clientFleetRecords, clientFleetPageCopy } from '../scripts/data/client-fleet';
import { websiteContentRecords } from '../scripts/data/website-content';
import { legacyVesselParticulars } from '../scripts/data/legacy-vessel-particulars';
import { currentPdfVesselParticulars } from '../scripts/data/current-pdf-vessel-particulars';
import { normalizeFleetNames } from '../src/lib/fleet-names';
import { fleetPhotos } from '../src/lib/fleet-photos';
import { replaceLegacyFleetPhotos } from '../src/server/fleet-photo-replacements';
import previousPhotos from '../src/server/legacy-fleet-photo-urls.json';

test('fleet preserves client names, corrected types, order and existing URLs', () => {
  assert.deepEqual(clientFleetRecords.map(({ id, titleTh, category, order }) => [id, titleTh, category, order]), [
    ['ranong-moe', 'ระนองโม', 'Container', 1],
    ['moe-line-2', 'โมไลน์ 2', 'Container', 2],
    ['moe-line-3', 'โมไลน์ 3', 'Container', 3],
    ['moe-line-4', 'โมไลน์ 4', 'Crane', 4],
    ['moe-line-5', 'โมไลน์ 5', 'Container', 5],
    ['moe-line-6', 'โมไลน์ 6', 'Container', 6],
    ['moe-line-7', 'โมไลน์ 7', 'Container', 7],
    ['dumai-moe', 'Dumai Moe', 'Tanker', 8],
  ]);
  assert.equal(new Set(clientFleetRecords.map(record => record.id)).size, 8);
  assert.deepEqual(clientFleetRecords.map(record => record.title), ['RANONG MOE', 'MOE LINE 2', 'MOE LINE 3', 'MOE LINE 4', 'MOE LINE 5', 'MOE LINE 6', 'MOE LINE 7', 'DUMAI MOE']);
});

test('saved fleet name corrections preserve independent language edits, stable IDs and adjacent numbers', () => {
  const vessel = clientFleetRecords.find(record => record.id === 'moe-line-2')!;
  const photo = { url: '/reviewed-photo.webp', alt: 'MOE 2 departing with MOE 20', altTh: 'โม2 ออกเดินทางกับโม20' };
  const legacy = { ...vessel, title: 'Harbor Star', titleTh: 'โม2', gallery: [photo], body: 'Historical log mentioning MOE 2.' };
  const expected = { ...legacy, titleTh: 'โมไลน์ 2', gallery: [{ ...photo, alt: 'MOE LINE 2 departing with MOE 20', altTh: 'โมไลน์ 2 ออกเดินทางกับโม20' }] };
  const normalized = normalizeFleetNames(legacy);
  assert.deepEqual(normalized, expected);
  assert.deepEqual(normalizeFleetNames(normalized), expected);
  assert.equal(legacy.titleTh, 'โม2');
  assert.equal(legacy.gallery[0].alt, photo.alt);
  for (const id of ['ranong-moe', 'dumai-moe', 'moe-line-1', 'moe-line-8', 'other-vessel']) {
    const other = { ...legacy, id, title: 'MOE 2' };
    assert.deepEqual(normalizeFleetNames(other), other);
  }
});

test('fresh migration and browser fixtures share actual company vessel photographs and reviewed particulars', () => {
  assert.deepEqual(websiteContentRecords.filter(record => record.type === 'Vessel'), clientFleetRecords);
  for (const record of clientFleetRecords) {
    assert.match(record.image, /^\/images\/.+\.webp$/);
    const [main, ...gallery] = fleetPhotos[record.id as keyof typeof fleetPhotos];
    assert.equal(record.image, main.url);
    assert.equal(record.imageAlt, main.alt);
    assert.equal(record.imageAltTh, main.altTh);
    assert.equal(record.mobileImage, '');
    assert.deepEqual(record.gallery, gallery);
    const website = legacyVesselParticulars.find(item => item.id === record.id);
    const pdf = currentPdfVesselParticulars.find(item => item.id === record.id);
    assert.deepEqual(record.vesselSpecs, { ...website?.specs, ...pdf?.specs });
    if (record.category === 'Container') assert.equal(record.vesselSpecs?.reeferPlugs, pdf ? 4 : 3);
  }
  const fleet = websiteContentRecords.find(record => record.type === 'Page' && record.id === 'fleet');
  assert.equal(fleet?.description, clientFleetPageCopy.description);
  assert.equal(fleet?.descriptionTh, clientFleetPageCopy.descriptionTh);
});

test('all fleet seed assets are tracked and optimized image checksums match their files', () => {
  const manifest: { sourcePath: string; sha256: string; bytes: number }[] = JSON.parse(readFileSync(new URL('../scripts/data/media-manifest.json', import.meta.url), 'utf8'));
  const paths = new Set(manifest.map(asset => asset.sourcePath));
  assert.equal(paths.size, manifest.length, 'No duplicate migration assets');
  for (const record of clientFleetRecords) {
    for (const path of [record.image, ...record.gallery!.map(image => image.url)]) assert.ok(paths.has(path), `Untracked fleet image: ${path}`);
    if (record.category === 'Container') {
      assert.doesNotMatch([record.image, ...record.gallery!.map(image => image.url)].join(' '), /tanker|crane|bunkering/);
    }
  }
  const added = manifest.filter(asset => asset.sourcePath.startsWith('/images/fleet-originals/'));
  assert.equal(added.length, Object.values(fleetPhotos).flat().length);
  for (const asset of added) {
    const bytes = readFileSync(new URL(`../public${asset.sourcePath}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }
});

test('fleet display replaces only known prior artwork and retains client gallery order', () => {
  const record = clientFleetRecords.find(item => item.id === 'moe-line-5')!;
  const custom = { url: 'https://example.com/client-photo.webp', alt: 'Deck', altTh: 'ดาดฟ้า' };
  const old = previousPhotos['moe-line-5'];
  const legacy = { ...record, image: old.at(-1)!, gallery: [custom, { ...custom, url: old[0] }] };
  const updated = replaceLegacyFleetPhotos(legacy);
  assert.equal(updated.image, record.image);
  assert.deepEqual(updated.gallery, [custom, ...record.gallery!]);
  assert.deepEqual(replaceLegacyFleetPhotos({ ...legacy, gallery: [] }).gallery, record.gallery);
  assert.equal(replaceLegacyFleetPhotos({ ...legacy, image: custom.url }).image, custom.url);
  assert.equal(replaceLegacyFleetPhotos(updated), updated);
});
