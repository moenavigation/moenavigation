import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyLegacyVesselSpecs, buildLegacyVesselParticularsPlan, legacyVesselParticulars } from '../scripts/data/legacy-vessel-particulars';
import { clientFleetRecords } from '../scripts/data/client-fleet';
import type { ContentRecord, VesselSpecs } from '../src/lib/cms-types';
import { recordSchema } from '../src/lib/validation';

type ArchivedVessel = {
  sourceUrls: { en: string; th: string };
  particularsPdfUrl: string;
  identity: { imo: string | null; builtYear: number; flag: string };
  dimensionsMetres: { loa: string; breadth: string; depth: string; draft: string | null };
  containerCapacity: { nominalTeu: number; reeferPlugs: number } | null;
  tonnageAsPublished: { grt: number; nrt: number | null; dwt: number | null; dwcc: number | null };
};

function emptyFleet() {
  return structuredClone(clientFleetRecords).map(record => { delete record.vesselSpecs; return record; });
}

function websiteFleet() {
  return emptyFleet().map(record => {
    const website = legacyVesselParticulars.find(source => source.id === record.id);
    return website ? { ...record, vesselSpecs: { ...website.specs } } : record;
  });
}

test('all imported particulars use the reviewed website tables as the primary source', () => {
  const archive = JSON.parse(readFileSync(new URL('../docs/research/legacy-moe-line-2026-11-16/fleet/fleet-data.json', import.meta.url), 'utf8')) as { vessels: ArchivedVessel[] };
  assert.equal(legacyVesselParticulars.length, 7);
  assert.equal(legacyVesselParticulars.reduce((count, item) => count + Object.keys(item.specs).length, 0), 91);
  for (const plan of legacyVesselParticulars) {
    const source = archive.vessels.find(item => item.sourceUrls.en === plan.sourceUrls.en);
    assert.ok(source, plan.id);
    assert.equal(plan.primarySource, 'website');
    assert.equal(plan.sourceUrls.th, source.sourceUrls.th);
    assert.equal(plan.sourceUrls.pdf, source.particularsPdfUrl);
    assert.equal(source.identity.flag, 'THAI');
    const expected: VesselSpecs = {
      yearBuilt: source.identity.builtYear, flag: 'Thailand', flagTh: 'ไทย',
      lengthM: Number(source.dimensionsMetres.loa), beamM: Number(source.dimensionsMetres.breadth), depthM: Number(source.dimensionsMetres.depth),
      grossTonnage: source.tonnageAsPublished.grt,
      ...(source.identity.imo ? { imo: source.identity.imo } : {}),
      ...(source.dimensionsMetres.draft ? { draftM: Number(source.dimensionsMetres.draft) } : {}),
      ...(source.tonnageAsPublished.nrt !== null ? { netTonnage: source.tonnageAsPublished.nrt } : {}),
      ...(source.tonnageAsPublished.dwt !== null ? { deadweightT: source.tonnageAsPublished.dwt } : {}),
      ...(source.tonnageAsPublished.dwcc !== null ? { cargoCapacityT: source.tonnageAsPublished.dwcc } : {}),
      ...(source.containerCapacity ? {
        capacityTeu: source.containerCapacity.nominalTeu,
        reeferPlugs: source.containerCapacity.reeferPlugs,
      } : {}),
    };
    assert.deepEqual(plan.specs, expected, plan.id);
    for (const field of Object.keys(plan.blankReasons)) assert.equal(Object.hasOwn(plan.specs, field), false, `${plan.id}: ${field}`);
    const record = emptyFleet().find(item => item.id === plan.id)!;
    const result = applyLegacyVesselSpecs(record);
    assert.deepEqual(recordSchema.parse(result.record).vesselSpecs, expected, plan.id);
  }
});

test('Website capacity values take precedence while missing crane particulars remain absent', () => {
  const ranong = legacyVesselParticulars.find(item => item.id === 'ranong-moe')!;
  assert.equal(ranong.specs.capacityTeu, 96);
  for (const source of legacyVesselParticulars.filter(item => item.expectedCategory === 'Container')) {
    assert.equal(source.specs.reeferPlugs, 3);
    assert.deepEqual(source.blankReasons, {});
  }
  const crane = legacyVesselParticulars.find(item => item.id === 'moe-line-4')!;
  assert.deepEqual(Object.keys(crane.blankReasons).sort(), ['capacityTeu', 'cargoCapacityT', 'deadweightT', 'draftM', 'imo', 'netTonnage', 'reeferPlugs']);
  assert.equal(Object.hasOwn(crane.specs, 'imo'), false);
  assert.equal(Object.hasOwn(crane.specs, 'capacityTeu'), false);
});

test('adding particulars preserves client identity, bilingual text, media, availability, status and revision', () => {
  const record = emptyFleet().find(item => item.id === 'moe-line-2')!;
  record.body = 'Later client content';
  record.status = 'Draft';
  record.revision = 8;
  record.updatedAt = '2026-11-17T08:00:00.000Z';
  record.vesselSpecs = { availability: 'Existing availability', availabilityTh: 'สถานะเดิม' };
  const before = structuredClone(record);
  const result = applyLegacyVesselSpecs(record);
  assert.deepEqual(record, before, 'The planner must not mutate its input');
  const actualWithoutSpecs = { ...result.record }; delete actualWithoutSpecs.vesselSpecs;
  const originalWithoutSpecs = { ...record }; delete originalWithoutSpecs.vesselSpecs;
  assert.deepEqual(actualWithoutSpecs, originalWithoutSpecs);
  assert.equal(result.record.vesselSpecs!.availability, record.vesselSpecs.availability);
  assert.equal(result.record.vesselSpecs!.availabilityTh, record.vesselSpecs.availabilityTh);
  assert.deepEqual(result.preservedFields, ['availability', 'availabilityTh']);
  assert.deepEqual(result.conflicts, []);
});

test('existing CMS disagreements require review instead of silently overriding values with website data', () => {
  const ranong = emptyFleet().find(item => item.id === 'ranong-moe')!;
  ranong.vesselSpecs = { capacityTeu: 72, reeferPlugs: 5, availability: 'Call us', availabilityTh: 'ติดต่อเรา' };
  const result = applyLegacyVesselSpecs(ranong);
  assert.deepEqual(result.removedFields, []);
  assert.deepEqual(result.conflicts, [
    { id: 'ranong-moe', field: 'capacityTeu', existingValue: 72, sourceValue: 96 },
    { id: 'ranong-moe', field: 'reeferPlugs', existingValue: 5, sourceValue: 3 },
  ]);
  assert.equal(result.record.vesselSpecs!.capacityTeu, 72);
  assert.equal(result.record.vesselSpecs!.reeferPlugs, 5);
  assert.equal(result.record.vesselSpecs!.availability, 'Call us');
});

test('missing crane keys are explicitly cleared, while DUMAI data is untouched', () => {
  const crane = emptyFleet().find(item => item.id === 'moe-line-4')!;
  crane.vesselSpecs = { imo: '4800-00377', draftM: 2, capacityTeu: 0, reeferPlugs: 0, netTonnage: 10, deadweightT: 100, cargoCapacityT: 90 };
  const clearedCrane = applyLegacyVesselSpecs(crane);
  assert.equal(clearedCrane.removedFields.length, 7);
  assert.deepEqual(clearedCrane.record.vesselSpecs, legacyVesselParticulars.find(item => item.id === 'moe-line-4')!.specs);
  const dumai = emptyFleet().find(item => item.id === 'dumai-moe')!;
  dumai.vesselSpecs = { lengthM: 80.25, capacityTeu: 0 };
  const unmatched = applyLegacyVesselSpecs(dumai);
  assert.equal(unmatched.record, dumai);
  assert.deepEqual(unmatched.fieldDifferences, []);
  assert.deepEqual(unmatched.record.vesselSpecs, { lengthM: 80.25, capacityTeu: 0 });
});

test('explicit website policy replaces only previously imported PDF capacities and is idempotent', () => {
  const records = websiteFleet();
  for (const record of records.filter(item => item.category === 'Container')) {
    record.vesselSpecs!.reeferPlugs = 5;
    if (record.id === 'ranong-moe') record.vesselSpecs!.capacityTeu = 72;
  }
  const before = structuredClone(records);
  const plan = buildLegacyVesselParticularsPlan(records, { replaceReviewedPdfValues: true });
  assert.equal(plan.changes.length, 6);
  assert.equal(plan.changes.reduce((total, change) => total + change.replacedFields.length, 0), 7);
  assert.deepEqual(plan.conflicts, []);
  const after = records.map(record => applyLegacyVesselSpecs(record, { replaceReviewedPdfValues: true }).record);
  assert.deepEqual(records, before);
  assert.deepEqual(after, websiteFleet());
  assert.deepEqual(buildLegacyVesselParticularsPlan(after, { replaceReviewedPdfValues: true }).changes, []);
  const different = structuredClone(records);
  different.find(item => item.id === 'ranong-moe')!.vesselSpecs!.capacityTeu = 100;
  different.find(item => item.id === 'moe-line-2')!.vesselSpecs!.reeferPlugs = 7;
  assert.equal(buildLegacyVesselParticularsPlan(different, { replaceReviewedPdfValues: true }).conflicts.length, 2);
});

test('identity mismatches, conflicting IMO numbers and an unexpected fleet set stop the plan', () => {
  const record = emptyFleet().find(item => item.id === 'moe-line-2')!;
  const legacy = applyLegacyVesselSpecs({ ...record, title: 'MOE 2' });
  assert.equal(legacy.record.title, 'MOE 2');
  assert.deepEqual(legacy.record.vesselSpecs, applyLegacyVesselSpecs(record).record.vesselSpecs);
  for (const patch of [{ title: 'MOE LINE 3' }, { title: 'MOE 3' }, { category: 'Tanker' }, { type: 'Route' }, { deletedAt: '2026-11-17' }, { _id: 'Vessel:moe-line-3' }]) {
    assert.throws(() => applyLegacyVesselSpecs({ ...record, ...patch } as ContentRecord), /identity does not match/);
  }
  assert.throws(() => applyLegacyVesselSpecs({ ...record, vesselSpecs: { imo: '8359172' } }), /IMO does not match/);
  assert.throws(() => applyLegacyVesselSpecs({ ...record, id: 'unknown-vessel' }), /No reviewed legacy mapping/);
  assert.throws(() => buildLegacyVesselParticularsPlan(emptyFleet().slice(1)), /exactly the eight/);
  assert.throws(() => buildLegacyVesselParticularsPlan([...emptyFleet(), record]), /exactly the eight/);
});

test('website policy update preserves trashed and unmatched vessels without recreating removed records', () => {
  const records = websiteFleet().filter(record => record.id !== 'moe-line-3');
  const trashed = records.find(record => record.id === 'moe-line-2')!;
  trashed.deletedAt = '2026-11-17T10:00:00.000Z';
  trashed.vesselSpecs!.reeferPlugs = 5;
  const added = { ...records[0], id: 'another-vessel', title: 'Another vessel', vesselSpecs: { capacityTeu: 10 } };
  records.push(added);
  const before = structuredClone(records);
  const plan = buildLegacyVesselParticularsPlan(records, { allowCurrentFleet: true, replaceReviewedPdfValues: true });
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.unmatched.map(item => item.id), ['dumai-moe', 'another-vessel']);
  assert.deepEqual(records, before);
});

test('existing disagreements are surfaced even if no other fields need adding, for the caller to abort', () => {
  const records = websiteFleet();
  const vessel = records.find(item => item.id === 'moe-line-2')!;
  vessel.vesselSpecs!.lengthM = 51;
  const before = structuredClone(records);
  const plan = buildLegacyVesselParticularsPlan(records);
  assert.deepEqual(plan.conflicts, [{ id: 'moe-line-2', field: 'lengthM', existingValue: 51, sourceValue: 49.98 }]);
  assert.equal(plan.changes.length, 1);
  assert.deepEqual(plan.changes[0].conflicts, plan.conflicts);
  assert.deepEqual(plan.changes[0].fieldDifferences, []);
  assert.equal(plan.changes[0].afterSpecs!.lengthM, 51, 'Never silently overwrite a client value');
  assert.deepEqual(records, before);
});

test('plans are deterministic, have seven scoped updates and become a no-op after application', () => {
  const records = emptyFleet();
  const plan = buildLegacyVesselParticularsPlan(records);
  assert.equal(plan.changes.length, 7);
  assert.equal(plan.changes.reduce((count, change) => count + change.addedFields.length, 0), 91);
  assert.ok(plan.changes.every(change => change.primarySource === 'website'));
  assert.deepEqual(plan, buildLegacyVesselParticularsPlan([...records].reverse()));
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.unmatched.map(item => item.id), ['dumai-moe']);
  const updated = records.map(record => applyLegacyVesselSpecs(record).record);
  const next = buildLegacyVesselParticularsPlan(updated);
  assert.deepEqual(next.changes, []);
  assert.deepEqual(next.unchanged, legacyVesselParticulars.map(item => item.id));
  assert.deepEqual(next.conflicts, []);
  assert.equal(applyLegacyVesselSpecs(updated[0]).record, updated[0]);
  const dumai = updated.find(item => item.id === 'dumai-moe')!;
  assert.equal(dumai.vesselSpecs, undefined);
});
