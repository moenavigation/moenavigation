import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentRecord, VesselSpecs } from '../src/lib/cms-types';
import { buildCurrentPdfVesselPlan, currentPdfFleetIds, type CurrentPdfVesselParticular } from '../scripts/data/current-pdf-vessel-plan';
import { currentPdfVesselParticulars } from '../scripts/data/current-pdf-vessel-particulars';
import { clientFleetRecords } from '../scripts/data/client-fleet';
import { technicalSections, technicalTextLimit } from '../src/lib/vessel-technical-sections';
import { vesselSpecsSchema } from '../src/lib/validation';
import { translateCmsError } from '../src/lib/cms-messages-th';

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

test('fresh ship particulars follow the four sheets, their different load measures and the country-qualified build years', () => {
  const [crane, ml5, ml6, tanker] = currentPdfVesselParticulars.map(source => source.specs);
  assert.equal(crane.craneSwlT, 200);
  assert.equal(crane.imo, undefined);
  assert.match(crane.designType!, /non-self-propelled/i);
  assert.match(crane.cargoHandling!, /Sumitomo SG1500 HDS/);
  assert.match(crane.machinery!, /Mitsubishi S6A2 MPTA, 470 PS/);
  assert.match(crane.mooringSafety!, /Four anchor points and four winches/);
  for (const ship of [ml5, ml6]) {
    assert.equal(ship.reeferPlugs, 4);
    assert.match(ship.machinery!, /2 × Cummins KTA 19M, 500 hp each/);
    assert.match(ship.performance!, /65 L\/h at 1,100 rpm/);
  }
  assert.equal(ml5.yearBuilt, 2009);
  assert.match(ml5.tankCapacities!, /50\.378 m³/);
  assert.equal(ml6.yearBuilt, 2006);
  assert.match(ml6.tankCapacities!, /26\.224 m³/);
  assert.match(ml6.construction!, /IMDG Code/);
  assert.equal(tanker.deadweightT, 3526);
  assert.equal(tanker.cargoVolumeM3, 3330);
  assert.match(tanker.loadLines!, /3,526\.32 tonnes/);
  assert.match(tanker.performance!, /10 knots loaded and 10\.5 knots in ballast/);
  assert.match(tanker.tankCapacities!, /1,500\.98 m³ across 10 tanks/);
  assert.match(tanker.cargoHandling!, /10 × 150 m³\/h/);
  for (const { id, specs } of currentPdfVesselParticulars) {
    assert.deepEqual(clientFleetRecords.find(record => record.id === id)?.vesselSpecs, specs);
    assert.deepEqual(vesselSpecsSchema.parse(specs), specs);
    assert.doesNotMatch(JSON.stringify(specs), /@|whatsapp|insurance|inmarsat|telex/i);
    for (const section of technicalSections) {
      assert.equal(Boolean(specs[section.key]), Boolean(specs[section.keyTh]), section.key);
      if (specs[section.key]) assert.match(specs[section.keyTh]!, /[ก-๙]/);
    }
  }
});

test('import corrects stale values while preserving an unrelated editable specification', () => {
  const stale = clientFleetRecords.map(record => record.id === 'moe-line-5' ? {
    ...record, vesselSpecs: { ...record.vesselSpecs, yearBuilt: 2008, reeferPlugs: 3, performance: 'Superseded entry', availability: 'By request', availabilityTh: 'สอบถาม' },
  } : record);
  const { changes } = buildCurrentPdfVesselPlan(stale, currentPdfVesselParticulars);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].replacedFields, ['performance', 'reeferPlugs', 'yearBuilt']);
  assert.equal(changes[0].afterSpecs.availability, 'By request');
  assert.deepEqual(buildCurrentPdfVesselPlan(clientFleetRecords, currentPdfVesselParticulars).changes, []);
});

test('technical fields are bounded, bilingual and editable without requiring absent sections', () => {
  assert.equal(vesselSpecsSchema.safeParse({ construction: 'TG' }).success, false);
  assert.equal(vesselSpecsSchema.safeParse({ machinery: 'e'.repeat(technicalTextLimit + 1), machineryTh: 'เครื่องยนต์' }).success, false);
  assert.deepEqual(vesselSpecsSchema.parse({ performance: '7 knots', performanceTh: '7 นอต' }), { performance: '7 knots', performanceTh: '7 นอต' });
  assert.ok(translateCmsError('Machinery · Thai: Provide both English and Thai text, or leave both blank.')?.includes('เครื่องจักร · ภาษาไทย'));
});
