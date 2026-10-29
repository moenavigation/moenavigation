import assert from 'node:assert/strict';
import test from 'node:test';
import { recordSchema } from '../src/lib/validation';

const vessel = {
  id: 'moe-4', type: 'Vessel', title: 'MOE 4', titleTh: 'โม4',
  description: 'Crane vessel in the fleet of Moe Navigation Co.,Ltd.',
  descriptionTh: 'เรือเครนในกองเรือของบริษัท โม เนวิเกชั่น จำกัด',
  category: 'Crane', categoryTh: 'เรือเครน', image: '', status: 'Published',
};

test('a confirmed vessel can be published before photos and specifications are supplied', () => {
  const saved = recordSchema.parse(vessel);
  assert.equal(saved.image, '');
  assert.deepEqual(saved.gallery, []);
  assert.equal(saved.vesselSpecs, undefined);
  assert.equal(saved.status, 'Published');
});

test('optional vessel photos do not make service and other required images optional', () => {
  for (const type of ['Service', 'Project', 'News', 'Route', 'Page'] as const) {
    const result = recordSchema.safeParse({ ...vessel, type });
    assert.equal(result.success, false, type);
    if (!result.success) assert.ok(result.error.issues.some(issue => issue.path[0] === 'image'), type);
  }
});

test('vessel galleries still reject empty image entries', () => {
  const result = recordSchema.safeParse({ ...vessel, gallery: [{ url: '', alt: '', altTh: '' }] });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some(issue => issue.path.join('.') === 'gallery.0.url'));
});
