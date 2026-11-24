import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentRecord } from '../src/lib/cms-types';
import { recordSchema } from '../src/lib/validation';
import { companyPhotos } from '../src/lib/company-photo-replacements';
import { buildLegacyRouteImportPlan, legacyRouteSampleBaselines, legacyRoutesPageBaseline, legacyRoutesPageCopy, type LegacyRouteImportPlan } from '../scripts/data/legacy-route-import-plan';
import { legacyTradingRouteRecords } from '../scripts/data/legacy-trading-routes';

function fixture(): ContentRecord[] {
  const page: ContentRecord = {
    id: 'routes', type: 'Page', ...legacyRoutesPageBaseline, status: 'Published', revision: 4, order: 45,
    image: 'https://res.cloudinary.com/example/image/upload/v1/page.webp', category: 'Website pages',
    body: 'Keep this independently edited page body.', bodyTh: 'เก็บเนื้อหาที่แก้ไขไว้',
  };
  const unrelated: ContentRecord = { ...structuredClone(legacyRouteSampleBaselines[0]), id: 'client-authored-route', title: 'Client authored route', revision: 9, body: 'Keep this route exactly.', status: 'Published' };
  return [page, ...structuredClone(legacyRouteSampleBaselines), unrelated];
}
function applyPlan(records: ContentRecord[], plan: LegacyRouteImportPlan): ContentRecord[] {
  assert.deepEqual(plan.conflicts, []);
  return [...records.map(record => {
    const change = plan.updates.find(item => item.type === record.type && item.id === record.id);
    return change ? { ...record, ...change.patch, revision: record.revision + 1, updatedAt: '2026-11-17T09:00:00.000Z' } : record;
  }), ...structuredClone(plan.inserts)];
}

test('the import plans five reviewed routes with the documented company terminal photo and only four narrow updates', () => {
  const records = fixture();
  const before = structuredClone(records);
  const plan = buildLegacyRouteImportPlan(records);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.inserts.map(record => record.id), ['bkk-lcb', 'bkk-lcb-suratthani', 'bkk-lcb-songkhla', 'ranong-yangon', 'lcb-sihanoukville']);
  for (const [index, record] of plan.inserts.entries()) {
    assert.equal(record.image, companyPhotos.containerTerminal.url);
    assert.equal(record.imageAlt, companyPhotos.containerTerminal.alt);
    assert.equal(record.imageAltTh, companyPhotos.containerTerminal.altTh);
    assert.notEqual(record.image, '/images/port.webp');
    assert.deepEqual(record.origin, legacyTradingRouteRecords[index].origin);
    assert.deepEqual(record.destination, legacyTradingRouteRecords[index].destination);
    assert.deepEqual(record.waypoints, legacyTradingRouteRecords[index].waypoints);
    assert.deepEqual(record.routeSpecs, legacyTradingRouteRecords[index].routeSpecs);
    assert.equal(recordSchema.safeParse(record).success, true);
  }
  assert.equal(plan.updates.length, 4);
  const sampleUpdates = plan.updates.filter(change => change.type === 'Route');
  assert.equal(sampleUpdates.length, 3);
  for (const change of sampleUpdates) {
    assert.equal(change.expectedRevision, 4);
    assert.deepEqual(change.patch, { status: 'Draft' });
  }
  const pageUpdate = plan.updates.find(change => change.type === 'Page')!;
  assert.equal(pageUpdate.id, 'routes');
  assert.deepEqual(pageUpdate.patch, legacyRoutesPageCopy);
  assert.deepEqual(Object.keys(pageUpdate.patch).sort(), ['description', 'descriptionTh', 'eyebrow', 'eyebrowTh', 'title', 'titleTh']);
  assert.deepEqual(records, before, 'Pure planning must not mutate cached or stored records');
});

test('applying the narrow patches preserves sample bodies, pictures, geometry and unrelated records', () => {
  const records = fixture();
  const plan = buildLegacyRouteImportPlan(records);
  const applied = applyPlan(records, plan);
  for (const previous of records.filter(record => record.type === 'Route' && record.id !== 'client-authored-route')) {
    const after = applied.find(record => record.type === previous.type && record.id === previous.id)!;
    assert.deepEqual(after, { ...previous, status: 'Draft', revision: previous.revision + 1, updatedAt: '2026-11-17T09:00:00.000Z' });
  }
  assert.equal(applied.find(record => record.id === 'client-authored-route'), records.find(record => record.id === 'client-authored-route'));
  const page = records.find(record => record.type === 'Page')!;
  const afterPage = applied.find(record => record.type === 'Page')!;
  assert.equal(afterPage.image, page.image);
  assert.equal(afterPage.body, page.body);
  assert.equal(afterPage.bodyTh, page.bodyTh);
  assert.equal(afterPage.order, page.order);
  assert.equal(afterPage.status, 'Published');
});

test('replaying an identical import is a no-op and record order does not change the plan', () => {
  const records = fixture();
  const plan = buildLegacyRouteImportPlan(records);
  assert.deepEqual(plan, buildLegacyRouteImportPlan([...records].reverse()));
  const applied = applyPlan(records, plan);
  assert.deepEqual(buildLegacyRouteImportPlan(applied), { inserts: [], updates: [], conflicts: [] });
  const withDatabaseDefaults = applied.map(record => ({ ...recordSchema.parse(record), revision: record.revision, updatedAt: record.updatedAt, _id: `${record.type}:${record.id}` }));
  assert.deepEqual(buildLegacyRouteImportPlan(withDatabaseDefaults), { inserts: [], updates: [], conflicts: [] });
});

test('a source-route ID collision is reported without replacing or republishing the existing record', () => {
  const records = fixture();
  const collision = { ...structuredClone(legacyTradingRouteRecords[0]), title: 'Client content at this address', revision: 7 };
  const plan = buildLegacyRouteImportPlan([...records, collision]);
  assert.ok(plan.conflicts.some(message => message.includes('Route:bkk-lcb already exists with different content')));
  assert.equal(plan.inserts.some(record => record.id === 'bkk-lcb'), false);
  assert.equal(plan.updates.some(record => record.id === 'bkk-lcb'), false);
  const identical = applyPlan(records, buildLegacyRouteImportPlan(records)).find(record => record.id === 'bkk-lcb')!;
  assert.ok(buildLegacyRouteImportPlan([...records, { ...identical, status: 'Draft' }]).conflicts.some(message => message.includes('Route:bkk-lcb already exists')));
  assert.ok(buildLegacyRouteImportPlan([...records, { ...identical, deletedAt: '2026-11-17' }]).conflicts.some(message => message.includes('Route:bkk-lcb already exists')));
});

test('reviewed sample content changes, bad identities and missing records block retirement', () => {
  for (const patch of [
    { title: 'A later client title' }, { body: 'Later client body' }, { category: 'A new service' },
    { routeSpecs: { distanceNm: 99 } }, { waypoints: [[1, 2], [3, 4]] as [number, number][] },
    { _id: 'Route:another-record' }, { revision: 0 }, { deletedAt: '2026-11-17' },
  ]) {
    const records = fixture().map(record => record.id === 'laem-chabang-singapore' ? { ...record, ...patch } : record);
    const plan = buildLegacyRouteImportPlan(records);
    assert.ok(plan.conflicts.some(message => message.includes('laem-chabang-singapore')), JSON.stringify(patch));
    assert.equal(plan.updates.some(change => change.id === 'laem-chabang-singapore'), false);
  }
  const missing = buildLegacyRouteImportPlan(fixture().filter(record => record.id !== 'laem-chabang-singapore'));
  assert.ok(missing.conflicts.some(message => message.includes('laem-chabang-singapore must have exactly one')));
  const duplicate = buildLegacyRouteImportPlan([...fixture(), structuredClone(legacyRouteSampleBaselines[0])]);
  assert.ok(duplicate.conflicts.some(message => message.includes('laem-chabang-singapore must have exactly one')));
});

test('a missing, changed or local Port Klang image prevents insertion instead of leaking provisional paths', () => {
  for (const image of ['', '/images/port.webp', 'https://example.com/image.webp']) {
    const records = fixture().map(record => record.id === 'laem-chabang-port-klang' ? { ...record, image } : record);
    const plan = buildLegacyRouteImportPlan(records);
    assert.equal(plan.inserts.length, 0);
    assert.ok(plan.conflicts.length > 0);
  }
  const plan = buildLegacyRouteImportPlan(fixture().filter(record => record.id !== 'laem-chabang-port-klang'));
  assert.equal(plan.inserts.length, 0);
  assert.ok(plan.conflicts.some(message => message.includes('Port Klang image')));
});

test('later page edits are preserved for review and the fixed Routes page is never created or unpublished', () => {
  for (const patch of [{ title: 'A client-written route title' }, { descriptionTh: 'คำอธิบายที่แก้ไขภายหลัง' }, { status: 'Draft' as const }]) {
    const records = fixture().map(record => record.type === 'Page' ? { ...record, ...patch } : record);
    const plan = buildLegacyRouteImportPlan(records);
    assert.ok(plan.conflicts.some(message => message.includes('Page:routes')));
    assert.equal(plan.updates.some(change => change.type === 'Page'), false);
  }
  const missing = buildLegacyRouteImportPlan(fixture().filter(record => record.type !== 'Page'));
  assert.ok(missing.conflicts.some(message => message.includes('Page:routes must have exactly one')));
  assert.equal(missing.inserts.some(record => record.type === 'Page'), false);
});
