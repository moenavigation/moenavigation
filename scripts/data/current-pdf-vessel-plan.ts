import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import type { ContentRecord, VesselSpecs } from '../../src/lib/cms-types';
import { normalizeFleetNames } from '../../src/lib/fleet-names';
import { vesselSpecsSchema } from '../../src/lib/validation';

export const currentPdfFleetIds = ['moe-line-4', 'moe-line-5', 'moe-line-6', 'dumai-moe'] as const;
export type CurrentPdfVesselParticular = {
  id: string; expectedTitle: string; expectedCategory: string; sourceFile: string; sourceSha256: string; specs: Readonly<VesselSpecs>;
};

/** Only fields explicitly supplied by a reviewed PDF participate in a change. */
export function buildCurrentPdfVesselPlan(records: readonly ContentRecord[], sources: readonly CurrentPdfVesselParticular[]) {
  assert.deepEqual(sources.map(item => item.id).sort(), [...currentPdfFleetIds].sort(), 'The PDF import requires the four reviewed source documents.');
  const changes = [];
  const unchanged: string[] = [];
  for (const id of currentPdfFleetIds) {
    const source = sources.find(item => item.id === id)!;
    assert(source.sourceFile && /^[a-f0-9]{64}$/.test(source.sourceSha256), `Missing PDF provenance for ${id}.`);
    const matches = records.filter(record => record.type === 'Vessel' && record.id === id && !record.deletedAt);
    assert.equal(matches.length, 1, `Expected exactly one active record for ${id}.`);
    const record = matches[0];
    assert(!('_id' in record) || record._id === `Vessel:${id}`, `Unexpected stored identity for ${id}.`);
    assert.equal(normalizeFleetNames(record).title, source.expectedTitle, `Vessel name differs from the reviewed PDF mapping for ${id}.`);
    assert.equal(record.category, source.expectedCategory, `Vessel type differs from the reviewed PDF mapping for ${id}.`);
    const fields = Object.keys(source.specs).sort() as (keyof VesselSpecs)[];
    assert(fields.length > 0, `No particulars were supplied for ${id}.`);
    const beforeSpecs = record.vesselSpecs ?? {};
    const afterSpecs = { ...beforeSpecs, ...source.specs };
    const validated = vesselSpecsSchema.parse(afterSpecs);
    for (const field of fields) {
      assert(source.specs[field] !== undefined && isDeepStrictEqual(source.specs[field], validated[field]), `Invalid PDF value for ${id}: ${field}.`);
    }
    const fieldDifferences = fields.filter(field => !isDeepStrictEqual(beforeSpecs[field], afterSpecs[field]))
      .map(field => ({ field, before: beforeSpecs[field] ?? null, after: afterSpecs[field] }));
    if (!fieldDifferences.length) { unchanged.push(id); continue; }
    changes.push({
      id, expectedRevision: record.revision, sourceFile: source.sourceFile, sourceSha256: source.sourceSha256,
      beforeSpecs: record.vesselSpecs ?? null, afterSpecs, fieldDifferences,
      addedFields: fieldDifferences.filter(change => change.before === null).map(change => change.field),
      replacedFields: fieldDifferences.filter(change => change.before !== null).map(change => change.field),
      removedFields: [],
    });
  }
  return { changes, unchanged, unmatched: [], conflicts: [] };
}
