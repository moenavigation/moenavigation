import assert from 'node:assert/strict';
import test from 'node:test';
import { recordSchema, vesselSpecsSchema } from '../src/lib/validation';
import type { VesselSpecs } from '../src/lib/cms-types';

const vessel = {
  id: 'moe-line-4', type: 'Vessel', title: 'MOE LINE 4', titleTh: 'โมไลน์ 4',
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

test('optional vessel particulars keep unknown measurements absent and explicit zero counts intact', () => {
  assert.deepEqual(vesselSpecsSchema.parse({}), {});
  const saved = recordSchema.parse({ ...vessel, vesselSpecs: { capacityTeu: 0, reeferPlugs: 0 } });
  assert.deepEqual(saved.vesselSpecs, { capacityTeu: 0, reeferPlugs: 0 });
  for (const key of ['depthM', 'cargoCapacityT', 'grossTonnage', 'netTonnage'] as const) {
    assert.equal(Object.hasOwn(saved.vesselSpecs!, key), false, key);
  }
});

test('record validation retains supplied decimal dimensions and tonnage without rounding or dropping new fields', () => {
  const specs: VesselSpecs = {
    lengthM: 82.125, beamM: 15.375, depthM: 6.275, draftM: 4.125,
    deadweightT: 2300.5, cargoCapacityT: 2100.125, grossTonnage: 1530.75, netTonnage: 900.25,
    capacityTeu: 123, reeferPlugs: 4,
  };
  assert.deepEqual(recordSchema.parse({ ...vessel, vesselSpecs: specs }).vesselSpecs, specs);
});

test('new physical particulars reject zero, negative, nonfinite and nonnumeric inputs at their field paths', () => {
  for (const key of ['depthM', 'cargoCapacityT', 'grossTonnage', 'netTonnage'] as const) {
    for (const value of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', '', null]) {
      const result = recordSchema.safeParse({ ...vessel, vesselSpecs: { [key]: value } });
      assert.equal(result.success, false, `${key}: ${String(value)}`);
      if (!result.success) assert.ok(result.error.issues.some(issue => issue.path.join('.') === `vesselSpecs.${key}`), key);
    }
  }
});

test('container and reefer capacities accept whole counts only without coercing missing or invalid input to zero', () => {
  for (const key of ['capacityTeu', 'reeferPlugs'] as const) {
    assert.deepEqual(vesselSpecsSchema.parse({ [key]: 0 }), { [key]: 0 });
    assert.deepEqual(vesselSpecsSchema.parse({ [key]: 1 }), { [key]: 1 });
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '0', '', null]) {
      assert.equal(vesselSpecsSchema.safeParse({ [key]: value }).success, false, `${key}: ${String(value)}`);
    }
  }
});

test('new particulars retain the existing bounded measurement conventions', () => {
  const limits = { depthM: 100, cargoCapacityT: 2000000, grossTonnage: 2000000, netTonnage: 2000000, reeferPlugs: 100000 } satisfies VesselSpecs;
  assert.deepEqual(vesselSpecsSchema.parse(limits), limits);
  for (const [key, value] of Object.entries(limits)) {
    assert.equal(vesselSpecsSchema.safeParse({ [key]: value + 1 }).success, false, key);
  }
});

test('adding particulars preserves existing vessel identity and bilingual availability metadata', () => {
  const legacy: VesselSpecs = {
    imo: '7654329', yearBuilt: 2020, lengthM: 80, beamM: 15, draftM: 4, deadweightT: 2200, capacityTeu: 0,
    flag: 'Thailand', flagTh: 'ไทย', availability: 'Ask about availability', availabilityTh: 'สอบถามความพร้อมให้บริการ',
  };
  assert.deepEqual(recordSchema.parse({ ...vessel, vesselSpecs: legacy }).vesselSpecs, legacy);
  assert.deepEqual(recordSchema.parse({ ...vessel, vesselSpecs: { ...legacy, depthM: 5.5, reeferPlugs: 0 } }).vesselSpecs, { ...legacy, depthM: 5.5, reeferPlugs: 0 });
});

test('new particulars remain restricted to vessel records even when the only supplied count is zero', () => {
  for (const specs of [{ reeferPlugs: 0 }, { depthM: 5.5 }, { cargoCapacityT: 1500 }, { grossTonnage: 1000 }, { netTonnage: 700 }]) {
    const result = recordSchema.safeParse({ ...vessel, type: 'News', image: '/images/test.webp', vesselSpecs: specs });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some(issue => issue.path.join('.') === 'vesselSpecs'));
  }
});
