import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clientFleetRecords, clientFleetPageCopy } from '../scripts/data/client-fleet';
import { websiteContentRecords } from '../scripts/data/website-content';
import { legacyVesselParticulars } from '../scripts/data/legacy-vessel-particulars';

test('fleet preserves client names, corrected types, order and existing URLs', () => {
  assert.deepEqual(clientFleetRecords.map(({ id, titleTh, category, order }) => [id, titleTh, category, order]), [
    ['ranong-moe', 'ระนองโม', 'Container', 1],
    ['moe-line-2', 'โม2', 'Container', 2],
    ['moe-line-3', 'โม3', 'Container', 3],
    ['moe-line-4', 'โม4', 'Crane', 4],
    ['moe-line-5', 'โม5', 'Container', 5],
    ['moe-line-6', 'โม6', 'Container', 6],
    ['moe-line-7', 'โม7', 'Container', 7],
    ['dumai-moe', 'Dumai Moe', 'Tanker', 8],
  ]);
  assert.equal(new Set(clientFleetRecords.map(record => record.id)).size, 8);
});

test('fresh migration and browser fixtures share corrected vessel photos, Dumai illustration and reviewed particulars', () => {
  assert.deepEqual(websiteContentRecords.filter(record => record.type === 'Vessel'), clientFleetRecords);
  for (const record of clientFleetRecords) {
    assert.match(record.image, /^\/images\/.+\.webp$/);
    const dumai = record.id === 'dumai-moe';
    assert.match(record.imageAlt!, dumai ? /illustrative.+not a photograph of this vessel/ : /AI-enhanced vessel photograph/);
    assert.match(record.imageAltTh!, dumai ? /ภาพประกอบ.+ไม่ใช่ภาพถ่ายของเรือลำนี้/ : /ภาพถ่ายเรือที่ปรับปรุงด้วย AI/);
    assert.equal(record.mobileImage, '');
    assert.ok(record.gallery?.length);
    for (const image of record.gallery!) {
      assert.match(image.alt, dumai ? /illustrative.+not a photograph of this vessel/ : /AI-enhanced vessel photograph/);
      assert.match(image.altTh, dumai ? /ภาพประกอบ.+ไม่ใช่ภาพถ่ายของเรือลำนี้/ : /ภาพถ่ายเรือที่ปรับปรุงด้วย AI/);
    }
    const source = legacyVesselParticulars.find(item => item.id === record.id);
    assert.deepEqual(record.vesselSpecs, source?.specs);
    assert.equal(record.vesselSpecs?.reeferPlugs, record.category === 'Container' ? 5 : undefined);
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
  const added = manifest.filter(asset => /^\/images\/(fleet|fleet-enhanced)\//.test(asset.sourcePath));
  assert.equal(added.length, 19);
  for (const asset of added) {
    const bytes = readFileSync(new URL(`../public${asset.sourcePath}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }
});
