import assert from 'node:assert/strict';
import test from 'node:test';
import { clientFleetRecords, clientFleetPageCopy } from '../scripts/data/client-fleet';
import { websiteContentRecords } from '../scripts/data/website-content';

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

test('fresh migration and browser fixtures share confirmed fleet without invented media or specs', () => {
  assert.deepEqual(websiteContentRecords.filter(record => record.type === 'Vessel'), clientFleetRecords);
  for (const record of clientFleetRecords) {
    assert.equal(record.image, '');
    assert.equal(record.mobileImage, '');
    assert.deepEqual(record.gallery, []);
    assert.equal(record.vesselSpecs, undefined);
  }
  const fleet = websiteContentRecords.find(record => record.type === 'Page' && record.id === 'fleet');
  assert.equal(fleet?.description, clientFleetPageCopy.description);
  assert.equal(fleet?.descriptionTh, clientFleetPageCopy.descriptionTh);
});
