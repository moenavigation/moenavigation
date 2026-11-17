import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentRecord, RouteSpecs } from '../src/lib/cms-types';
import { recordSchema, routeSpecsSchema, saveSchema } from '../src/lib/validation';
import { selectPublicPageRecords } from '../src/lib/public-page-content';
import { projectPublicContent } from '../src/lib/public-content';
import { changeEditorContentType, createEditorDraftExport } from '../src/lib/cms-client';
import { translateCmsError } from '../src/lib/cms-messages-th';

const route: ContentRecord = {
  id: 'laem-chabang-bangkok', type: 'Route', title: 'Laem Chabang — Bangkok', titleTh: 'แหลมฉบัง — กรุงเทพฯ',
  description: 'Route information for enquiries.', descriptionTh: 'ข้อมูลเส้นทางสำหรับสอบถาม', image: '/images/port.webp',
  category: 'Domestic', categoryTh: 'ภายในประเทศ', status: 'Published', revision: 4,
  origin: { name: 'Laem Chabang', nameTh: 'แหลมฉบัง', country: 'Thailand', countryTh: 'ไทย' },
  destination: { name: 'Bangkok', nameTh: 'กรุงเทพฯ', country: 'Thailand', countryTh: 'ไทย' },
  waypoints: [[13.0833, 100.8833], [13.5, 100.6], [13.706, 100.58]],
};
const specs: RouteSpecs = { distanceNm: 58, capacityMinTeu: 72, capacityMaxTeu: 120, sailingMinHours: 8, sailingMaxHours: 10 };

test('route details are optional and never invent zero values for older saved records', () => {
  assert.deepEqual(routeSpecsSchema.parse({}), {});
  const older = recordSchema.parse(route);
  assert.equal(older.routeSpecs, undefined);
  assert.equal(Object.hasOwn(older, 'routeSpecs'), false);
  const distanceOnly = recordSchema.parse({ ...route, routeSpecs: { distanceNm: 58.125 } });
  assert.deepEqual(distanceOnly.routeSpecs, { distanceNm: 58.125 });
  assert.equal(Object.hasOwn(distanceOnly.routeSpecs!, 'capacityMinTeu'), false);
  assert.equal(Object.hasOwn(distanceOnly.routeSpecs!, 'sailingMinHours'), false);
});

test('the save contract retains supplied route figures, bilingual ports and ordered coordinate precision', () => {
  const input = { ...route, routeSpecs: { ...specs, sailingMinHours: 8.125, sailingMaxHours: 10.25 } };
  const before = structuredClone(input);
  const saved = saveSchema.parse({ record: input, expectedRevision: 4, submissionId: '12345678-1234-4321-8321-123456789abc' });
  assert.deepEqual(saved.record.routeSpecs, input.routeSpecs);
  assert.deepEqual(saved.record.origin, route.origin);
  assert.deepEqual(saved.record.destination, route.destination);
  assert.deepEqual(saved.record.waypoints, route.waypoints);
  assert.equal(saved.expectedRevision, 4);
  assert.deepEqual(input, before);
});

test('route figures reject nonnumeric, nonfinite and nonpositive values at their own field paths', () => {
  for (const field of Object.keys(specs) as (keyof RouteSpecs)[]) {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', '', null]) {
      const result = recordSchema.safeParse({ ...route, routeSpecs: { ...specs, [field]: value } });
      assert.equal(result.success, false, `${field}: ${String(value)}`);
      if (!result.success) assert.ok(result.error.issues.some(issue => issue.path.join('.') === `routeSpecs.${field}`), field);
    }
  }
  assert.equal(routeSpecsSchema.safeParse({ capacityMinTeu: 1.5, capacityMaxTeu: 2 }).success, false);
  assert.equal(routeSpecsSchema.safeParse({ capacityMinTeu: 1, capacityMaxTeu: 2.5 }).success, false);
  assert.equal(routeSpecsSchema.safeParse({ capacityMinTeu: 1, capacityMaxTeu: 100001 }).success, false);
});

test('range pairs must be complete and ordered, and equal endpoints retain an exact published value', () => {
  for (const [minimum, maximum] of [['capacityMinTeu', 'capacityMaxTeu'], ['sailingMinHours', 'sailingMaxHours']] as const) {
    for (const [present, missing] of [[minimum, maximum], [maximum, minimum]]) {
      const incomplete = recordSchema.safeParse({ ...route, routeSpecs: { [present]: 65 } });
      assert.equal(incomplete.success, false);
      if (!incomplete.success) assert.ok(incomplete.error.issues.some(issue => issue.path.join('.') === `routeSpecs.${missing}`));
    }
    const reversed = recordSchema.safeParse({ ...route, routeSpecs: { [minimum]: 66, [maximum]: 65 } });
    assert.equal(reversed.success, false);
    if (!reversed.success) assert.ok(reversed.error.issues.some(issue => issue.path.join('.') === `routeSpecs.${maximum}`));
    assert.deepEqual(routeSpecsSchema.parse({ [minimum]: 65, [maximum]: 65 }), { [minimum]: 65, [maximum]: 65 });
  }
});

test('route details cannot be attached to unrelated content types', () => {
  for (const type of ['Vessel', 'Project', 'News', 'Service', 'Page', 'Section'] as const) {
    const result = recordSchema.safeParse({ ...route, type, parentId: type === 'Section' ? 'home' : '', routeSpecs: specs });
    assert.equal(result.success, false, type);
    if (!result.success) assert.ok(result.error.issues.some(issue => issue.path.join('.') === 'routeSpecs'), type);
  }
});

test('homepage and Routes expose identical saved details without adding them to older routes', () => {
  const current = { ...route, routeSpecs: specs, body: 'Long source notes omitted from the homepage summary.' };
  const older = { ...route, id: 'older-route' };
  const home = { ...route, id: 'home', type: 'Page' as const };
  const section = { ...route, id: 'home-connections', type: 'Section' as const, parentId: 'home' };
  const records = [home, section, current, older];
  const before = structuredClone(records);
  const homepage = projectPublicContent(selectPublicPageRecords(records, 'home')).routes;
  const routePage = projectPublicContent(selectPublicPageRecords(records, 'routes')).routes;
  assert.deepEqual(homepage[0].routeSpecs, specs);
  assert.deepEqual(routePage[0].routeSpecs, specs);
  assert.equal(homepage[0].body, undefined);
  assert.deepEqual(homepage[0].waypoints, route.waypoints);
  assert.equal(Object.hasOwn(homepage[1], 'routeSpecs'), false);
  assert.equal(Object.hasOwn(routePage[1], 'routeSpecs'), false);
  assert.deepEqual(records, before);
});

test('draft downloads retain route details while an explicit type change reports and removes them', () => {
  const current = { ...route, routeSpecs: specs };
  const draft = createEditorDraftExport(current, '13.0833, 100.8833\n13.706, 100.58');
  assert.deepEqual(draft.record.routeSpecs, specs);
  const changed = changeEditorContentType(current, 'Service', '');
  assert.ok(changed.discardedFields.includes('route details'));
  assert.equal(changed.record.routeSpecs, undefined);
  assert.equal(recordSchema.safeParse(changed.record).success, true);
  assert.deepEqual(current.routeSpecs, specs);
});

test('paired-range validation feedback includes a translated field and actionable Thai explanation', () => {
  assert.equal(translateCmsError('Maximum capacity: Maximum capacity cannot be less than minimum capacity.'), 'ความจุสูงสุด: ความจุสูงสุดต้องไม่น้อยกว่าความจุต่ำสุด');
  assert.equal(translateCmsError('Maximum sailing time: Enter both sailing-time limits, or leave both blank.'), 'เวลาเดินเรือสูงสุด: กรอกเวลาเดินเรือต่ำสุดและสูงสุดให้ครบทั้งคู่ หรือเว้นว่างทั้งคู่');
});
