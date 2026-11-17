import type { ContentRecord, VesselSpecs } from '../../src/lib/cms-types';

export type VesselParticularField = keyof VesselSpecs;
export type LegacyVesselParticular = {
  id: string;
  expectedTitle: string;
  expectedCategory: string;
  primarySource: 'pdf';
  sourceUrls: { en: string; th: string; pdf: string };
  specs: Readonly<VesselSpecs>;
  blankReasons: Readonly<Partial<Record<VesselParticularField, string>>>;
};
export type VesselParticularConflict = {
  id: string;
  field: VesselParticularField;
  existingValue: string | number;
  sourceValue: string | number;
};
export type VesselParticularDifference = {
  field: VesselParticularField;
  before: string | number | null;
  after: string | number | null;
};
export type LegacyVesselSpecApplication = {
  record: ContentRecord;
  addedFields: VesselParticularField[];
  removedFields: VesselParticularField[];
  preservedFields: VesselParticularField[];
  fieldDifferences: VesselParticularDifference[];
  conflicts: VesselParticularConflict[];
};
export type LegacyVesselParticularChange = Omit<LegacyVesselSpecApplication, 'record'> & {
  id: string;
  expectedRevision: number;
  primarySource: LegacyVesselParticular['primarySource'];
  sourceUrls: LegacyVesselParticular['sourceUrls'];
  beforeSpecs: VesselSpecs | null;
  afterSpecs: VesselSpecs | null;
  blankReasons: LegacyVesselParticular['blankReasons'];
};

const sources = (id: string, documentNumber: number) => ({
  en: `https://www.moe-line.com/fleet-list/${id}/`,
  th: `https://www.moe-line.com/th/fleet-list/${id}/`,
  pdf: `https://www.moe-line.com/wp-content/uploads/2025/01/MOE-LINE-${documentNumber}-PARTICULAR.pdf`,
});

// Reviewed 17 November 2026 against the archived English/Thai HTML and PDFs:
// docs/research/legacy-moe-line-2026-11-16/fleet/{fleet-data,pdf-particulars}.json.
// The user selected the ship-particulars PDFs as the primary source. Their
// 72 TEU for RANONG MOE and 5 reefer plugs for each container vessel take
// precedence over the differing HTML values. They do not establish live
// availability or cargo acceptance. Preserve current client names/types/URLs.
// Missing PDF particulars remain blank; never infer them from vessel type.
export const legacyVesselParticulars: readonly LegacyVesselParticular[] = [
  {
    id: 'ranong-moe', expectedTitle: 'RANONG MOE', expectedCategory: 'Container', primarySource: 'pdf', sourceUrls: sources('ranong-moe', 1),
    specs: { imo: '1091434', yearBuilt: 2010, flag: 'Thailand', flagTh: 'ไทย', lengthM: 63, beamM: 13.6, depthM: 5.3, draftM: 3.59, capacityTeu: 72, reeferPlugs: 5, grossTonnage: 1419, netTonnage: 741, deadweightT: 2088, cargoCapacityT: 1800 },
    blankReasons: {},
  },
  {
    id: 'moe-line-2', expectedTitle: 'MOE 2', expectedCategory: 'Container', primarySource: 'pdf', sourceUrls: sources('moe-line-2', 2),
    specs: { imo: '8359184', yearBuilt: 2008, flag: 'Thailand', flagTh: 'ไทย', lengthM: 49.98, beamM: 12.8, depthM: 4.5, draftM: 3.85, capacityTeu: 72, reeferPlugs: 5, grossTonnage: 835, netTonnage: 505, deadweightT: 1590, cargoCapacityT: 1550 },
    blankReasons: {},
  },
  {
    id: 'moe-line-3', expectedTitle: 'MOE 3', expectedCategory: 'Container', primarySource: 'pdf', sourceUrls: sources('moe-line-3', 3),
    specs: { imo: '8359172', yearBuilt: 2011, flag: 'Thailand', flagTh: 'ไทย', lengthM: 49.98, beamM: 12.8, depthM: 4.2, draftM: 3.2, capacityTeu: 72, reeferPlugs: 5, grossTonnage: 760, netTonnage: 464, deadweightT: 1290, cargoCapacityT: 1250 },
    blankReasons: {},
  },
  {
    id: 'moe-line-4', expectedTitle: 'MOE 4', expectedCategory: 'Crane', primarySource: 'pdf', sourceUrls: sources('moe-line-4', 4),
    specs: { yearBuilt: 1988, flag: 'Thailand', flagTh: 'ไทย', lengthM: 55, beamM: 19, depthM: 4, grossTonnage: 1329 },
    blankReasons: {
      imo: 'No IMO was supplied. Official registration 4800-00377 is not an IMO number.',
      draftM: 'No draft was supplied in either source.',
      capacityTeu: 'No nominal container capacity was supplied for this crane barge.',
      reeferPlugs: 'No reefer plug count was supplied for this crane barge.',
      netTonnage: 'No NRT was supplied in either source.',
      deadweightT: 'No DWT was supplied in either source.',
      cargoCapacityT: 'No DWCC was supplied in either source.',
    },
  },
  {
    id: 'moe-line-5', expectedTitle: 'MOE 5', expectedCategory: 'Container', primarySource: 'pdf', sourceUrls: sources('moe-line-5', 5),
    specs: { imo: '1042457', yearBuilt: 2009, flag: 'Thailand', flagTh: 'ไทย', lengthM: 49.98, beamM: 14.8, depthM: 4.92, draftM: 3.52, capacityTeu: 120, reeferPlugs: 5, grossTonnage: 1163, netTonnage: 651, deadweightT: 1800, cargoCapacityT: 1750 },
    blankReasons: {},
  },
  {
    id: 'moe-line-6', expectedTitle: 'MOE 6', expectedCategory: 'Container', primarySource: 'pdf', sourceUrls: sources('moe-line-6', 6),
    specs: { imo: '1042469', yearBuilt: 2006, flag: 'Thailand', flagTh: 'ไทย', lengthM: 49.98, beamM: 14.8, depthM: 4.62, draftM: 3.35, capacityTeu: 120, reeferPlugs: 5, grossTonnage: 1047, netTonnage: 592, deadweightT: 1800, cargoCapacityT: 1750 },
    blankReasons: {},
  },
  {
    id: 'moe-line-7', expectedTitle: 'MOE 7', expectedCategory: 'Container', primarySource: 'pdf', sourceUrls: sources('moe-line-7', 7),
    specs: { imo: '1065837', yearBuilt: 2003, flag: 'Thailand', flagTh: 'ไทย', lengthM: 49.98, beamM: 15.6, depthM: 5.4, draftM: 3.9, capacityTeu: 120, reeferPlugs: 5, grossTonnage: 1266, netTonnage: 687, deadweightT: 2100, cargoCapacityT: 2050 },
    blankReasons: {},
  },
];

const unmatchedVessel = { id: 'dumai-moe', expectedTitle: 'DUMAI MOE', expectedCategory: 'Tanker', reason: 'No matching vessel exists in the reviewed legacy fleet or particulars PDFs. Preserve the current record without inferred specifications.' } as const;
const blank = (value: unknown) => value === undefined || value === null || typeof value === 'string' && !value.trim();
const fieldKeys = (specs: Partial<VesselSpecs>) => Object.keys(specs).sort() as VesselParticularField[];

function assertIdentity(record: ContentRecord, expected: Pick<LegacyVesselParticular, 'id' | 'expectedTitle' | 'expectedCategory'>) {
  if (record.type !== 'Vessel' || record.id !== expected.id || record.title !== expected.expectedTitle || record.category !== expected.expectedCategory || record.deletedAt
    || '_id' in record && record._id !== `Vessel:${expected.id}`) {
    throw new Error(`Legacy vessel identity does not match the current record: ${expected.id}.`);
  }
}

/** Plan only: conflicts must be reviewed before the caller writes any returned record. */
export function applyLegacyVesselSpecs(record: ContentRecord): LegacyVesselSpecApplication {
  const source = legacyVesselParticulars.find(item => item.id === record.id);
  if (!source) {
    if (record.id !== unmatchedVessel.id) throw new Error(`No reviewed legacy mapping exists for vessel ${record.id}.`);
    assertIdentity(record, unmatchedVessel);
    return { record, addedFields: [], removedFields: [], preservedFields: fieldKeys(record.vesselSpecs || {}), fieldDifferences: [], conflicts: [] };
  }
  assertIdentity(record, source);
  const previous = record.vesselSpecs || {};
  if (source.specs.imo && !blank(previous.imo) && previous.imo !== source.specs.imo) {
    throw new Error(`Legacy IMO does not match the current record: ${record.id}.`);
  }
  const next: VesselSpecs = { ...previous };
  const addedFields: VesselParticularField[] = [];
  const removedFields: VesselParticularField[] = [];
  const conflicts: VesselParticularConflict[] = [];
  for (const field of fieldKeys(source.specs)) {
    const value = source.specs[field]!;
    if (blank(previous[field])) {
      Object.assign(next, { [field]: value });
      addedFields.push(field);
    } else if (previous[field] !== value) {
      conflicts.push({ id: record.id, field, existingValue: previous[field]!, sourceValue: value });
    }
  }
  for (const field of Object.keys(source.blankReasons).sort() as VesselParticularField[]) {
    if (Object.hasOwn(next, field)) {
      delete next[field];
      removedFields.push(field);
    }
  }
  const changedFields = [...addedFields, ...removedFields].sort();
  const fieldDifferences = changedFields.map(field => ({ field, before: previous[field] ?? null, after: next[field] ?? null }));
  const preservedFields = fieldKeys(previous).filter(field => !changedFields.includes(field));
  return { record: changedFields.length ? { ...record, vesselSpecs: next } : record, addedFields, removedFields, preservedFields, fieldDifferences, conflicts };
}

/** Require the reviewed eight-vessel identity set; ignore other content types. */
export function buildLegacyVesselParticularsPlan(records: readonly ContentRecord[]) {
  const vessels = records.filter(record => record.type === 'Vessel');
  const expectedIds = [...legacyVesselParticulars.map(item => item.id), unmatchedVessel.id].sort();
  const actualIds = vessels.map(record => record.id).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error('The current fleet must contain exactly the eight reviewed vessel identities.');
  const changes: LegacyVesselParticularChange[] = [];
  const unchanged: string[] = [];
  const conflicts: VesselParticularConflict[] = [];
  for (const source of legacyVesselParticulars) {
    const record = vessels.find(item => item.id === source.id)!;
    const result = applyLegacyVesselSpecs(record);
    conflicts.push(...result.conflicts);
    if (!result.fieldDifferences.length && !result.conflicts.length) { unchanged.push(record.id); continue; }
    changes.push({ id: record.id, expectedRevision: record.revision, primarySource: source.primarySource, sourceUrls: source.sourceUrls, beforeSpecs: record.vesselSpecs || null, afterSpecs: result.record.vesselSpecs || null,
      addedFields: result.addedFields, removedFields: result.removedFields, preservedFields: result.preservedFields, fieldDifferences: result.fieldDifferences, conflicts: result.conflicts, blankReasons: source.blankReasons });
  }
  applyLegacyVesselSpecs(vessels.find(record => record.id === unmatchedVessel.id)!);
  return { changes, unchanged, unmatched: [{ id: unmatchedVessel.id, reason: unmatchedVessel.reason }], conflicts };
}
