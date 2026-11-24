import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentRecord, VesselSpecs } from '../src/lib/cms-types';
import { buildCurrentPdfVesselPlan, currentPdfFleetIds, type CurrentPdfVesselParticular } from '../scripts/data/current-pdf-vessel-plan';

function fixture() {
  const sources = currentPdfFleetIds.map((id, index): CurrentPdfVesselParticular => ({
    id, expectedTitle: id === 'dumai-moe' ? 'DUMAI MOE' : `MOE LINE ${id.slice(-1)}`,
    expectedCategory: ['Crane', 'Container', 'Container', 'Tanker'][index],
    sourceFile: `${id}.pdf`, sourceSha256: 'a'.repeat(64), specs: { lengthM: 70 + index },
  }));
  const records = sources.map(({ id, expectedTitle, expectedCategory }): ContentRecord => ({
    type: 'Vessel', id, title: expectedTitle.replace('MOE LINE', 'MOE'), titleTh: 'เรือ',
    category: expectedCategory, image: '', description: 'Saved summary', descriptionTh: 'ข้อมูลเรือ',
    status: 'Draft', revision: 7, vesselSpecs: { lengthM: 60, beamM: 10, availability: 'Custom', availabilityTh: 'ระบุเอง' },
  }));
  return { sources, records };
}

test('PDF plans change only source fields on the four selected active vessels and can be rerun', () => {
  const { sources, records } = fixture();
  const original = structuredClone(records);
  const unrelated = { ...records[0], id: 'moe-line-7' };
  const plan = buildCurrentPdfVesselPlan([...records, unrelated], sources);
  assert.deepEqual(plan.changes.map(change => change.id), currentPdfFleetIds);
  for (const change of plan.changes) {
    const source = sources.find(item => item.id === change.id)!;
    assert.deepEqual(change.replacedFields, ['lengthM']);
    assert.deepEqual(change.removedFields, []);
    assert.equal(change.sourceSha256, source.sourceSha256);
    assert.equal(change.sourceFile, source.sourceFile);
    assert.equal(change.expectedRevision, 7);
    assert.deepEqual(change.afterSpecs, { ...records[0].vesselSpecs, ...source.specs });
  }
  assert.deepEqual(records, original);
  const updated = records.map(record => ({ ...record, vesselSpecs: plan.changes.find(change => change.id === record.id)!.afterSpecs }));
  assert.deepEqual(buildCurrentPdfVesselPlan(updated, sources).changes, []);
});

test('PDF imports reject incomplete, ambiguous, deleted or incorrectly mapped targets', () => {
  const { sources, records } = fixture();
  assert.throws(() => buildCurrentPdfVesselPlan(records, sources.slice(1)), /four reviewed/);
  assert.throws(() => buildCurrentPdfVesselPlan(records, [sources[1], ...sources.slice(1)]), /four reviewed/);
  assert.throws(() => buildCurrentPdfVesselPlan(records.slice(1), sources), /active record/);
  assert.throws(() => buildCurrentPdfVesselPlan([...records, records[0]], sources), /active record/);
  for (const [patch, message] of [
    [{ deletedAt: new Date().toISOString() }, /active record/],
    [{ title: 'MOE LINE 7' }, /name differs/],
    [{ category: 'Tanker' }, /type differs/],
    [{ _id: 'Vessel:another-ship' }, /stored identity/],
  ] as const) {
    assert.throws(() => buildCurrentPdfVesselPlan([{ ...records[0], ...patch }, ...records.slice(1)], sources), message);
  }
  assert.throws(() => buildCurrentPdfVesselPlan(records, [{ ...sources[0], sourceSha256: '' }, ...sources.slice(1)]), /provenance/);
  assert.throws(() => buildCurrentPdfVesselPlan(records, [{ ...sources[0], specs: { unknown: 1 } as VesselSpecs }, ...sources.slice(1)]), /Invalid PDF value/);
});
