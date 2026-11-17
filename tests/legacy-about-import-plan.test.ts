import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentRecord } from '../src/lib/cms-types';
import { recordSchema } from '../src/lib/validation';
import { legacyAboutCopy, legacyAboutImages } from '../scripts/data/legacy-about';
import { buildLegacyAboutImportPlan, legacyAboutBaselines, type LegacyAboutImageUrls, type LegacyAboutImportPlan } from '../scripts/data/legacy-about-import-plan';

const images = Object.fromEntries(legacyAboutImages.map(image => [image.key, `https://res.cloudinary.com/example/image/upload/v1/about/${image.key}.webp`])) as LegacyAboutImageUrls;
function fixture(): ContentRecord[] {
  return [...legacyAboutBaselines.map((baseline, index): ContentRecord => ({
    id: baseline.id, type: baseline.type, parentId: baseline.parentId || '', title: baseline.id, titleTh: baseline.id,
    description: '', descriptionTh: '', body: '', bodyTh: '', image: '', category: 'Website sections', status: 'Published', order: index, revision: index + 1,
    ...baseline.patch,
  })), { id: 'about-values', type: 'Section', parentId: 'about', title: 'Client values', titleTh: 'คุณค่าของเรา', description: 'Preserve this independently edited content.', descriptionTh: 'คงเนื้อหาที่แก้ไขไว้', body: 'Client body', image: '', category: 'Website sections', status: 'Published', revision: 8 }];
}
function apply(records: ContentRecord[], plan: LegacyAboutImportPlan) {
  assert.deepEqual(plan.conflicts, []);
  return [...records.map(record => {
    const change = plan.updates.find(item => item.type === record.type && item.id === record.id);
    return change ? { ...record, ...change.patch, revision: record.revision + 1 } : record;
  }), ...structuredClone(plan.inserts)];
}

test('the About preview changes only four reviewed records and adds the four fixed operating themes', () => {
  const records = fixture(), before = structuredClone(records);
  const plan = buildLegacyAboutImportPlan(records, images);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.updates.map(item => item.id), ['about', 'about-intro', 'about-mission', 'about-vision']);
  assert.deepEqual(plan.inserts.map(item => item.id), ['about-safety', 'about-maintenance', 'about-crew', 'about-office']);
  for (const insert of plan.inserts) assert.equal(recordSchema.safeParse(insert).success, true, insert.id);
  for (const change of plan.updates) {
    const previous = records.find(record => record.id === change.id)!;
    assert.equal(change.expectedRevision, previous.revision);
    assert.equal(recordSchema.safeParse({ ...previous, ...change.patch }).success, true, change.id);
    for (const field of ['id', 'type', 'parentId', 'status', 'order', 'revision', 'deletedAt']) assert.equal(Object.hasOwn(change.patch, field), false, field);
  }
  assert.deepEqual(records, before, 'Planning must not mutate saved records.');
});

test('applying the reviewed fields preserves independent content and an identical replay is a no-op', () => {
  const records = fixture();
  records[0].body = 'Keep the existing page body.';
  records[2].gallery = [{ url: 'https://example.com/client-picture.webp', alt: 'Client picture', altTh: 'ภาพของลูกค้า' }];
  records[2].title = 'Client mission heading';
  const saved = apply(records, buildLegacyAboutImportPlan(records, images));
  assert.equal(saved[0].body, records[0].body);
  assert.deepEqual(saved[2].gallery, records[2].gallery);
  assert.equal(saved[2].title, records[2].title);
  assert.equal(saved[4], records[4]);
  assert.deepEqual(buildLegacyAboutImportPlan(saved, images), { inserts: [], updates: [], conflicts: [] });
  const normalized = saved.map(record => ({ ...recordSchema.parse(record), revision: record.revision, _id: `${record.type}:${record.id}` }));
  assert.deepEqual(buildLegacyAboutImportPlan(normalized, images), { inserts: [], updates: [], conflicts: [] });
});

test('later edits to targeted copy or images require review instead of being overwritten', () => {
  for (const patch of [{ description: 'Later client copy' }, { image: 'https://example.com/later.webp' }, { bodyTh: 'เนื้อหาที่แก้ไขภายหลัง' }]) {
    const records = fixture();
    records[1] = { ...records[1], ...patch };
    const plan = buildLegacyAboutImportPlan(records, images);
    assert.ok(plan.conflicts.some(message => message.includes('about-intro has later edits')));
    assert.equal(plan.updates.some(change => change.id === 'about-intro'), false);
  }
  const records = apply(fixture(), buildLegacyAboutImportPlan(fixture(), images));
  records.find(record => record.id === 'about-safety')!.body = 'Later client safety details';
  assert.ok(buildLegacyAboutImportPlan(records, images).conflicts.some(message => message.includes('about-safety already exists')));
});

test('missing or unsafe records and unavailable image mappings block the import', () => {
  for (const patch of [{ deletedAt: '2026-11-17' }, { status: 'Draft' as const }, { parentId: 'another-page' }, { revision: 0 }, { _id: 'Section:another-record' }]) {
    const records = fixture(); records[1] = { ...records[1], ...patch };
    assert.ok(buildLegacyAboutImportPlan(records, images).conflicts.some(message => message.includes('about-intro')));
  }
  assert.ok(buildLegacyAboutImportPlan(fixture().slice(1), images).conflicts.some(message => message.includes('Page:about')));
  assert.ok(buildLegacyAboutImportPlan([...fixture(), fixture()[0]], images).conflicts.some(message => message.includes('Page:about')));
  const invalid = buildLegacyAboutImportPlan(fixture(), { ...images, hero: '/images/about/port-operations.webp' });
  assert.equal(invalid.updates.length + invalid.inserts.length, 0);
  assert.ok(invalid.conflicts.some(message => message.includes('hero')));
});

test('the draft keeps current identity and modest source-based themes without legacy legal claims', () => {
  assert.equal(legacyAboutCopy.intro.title, 'Moe Navigation Co.,Ltd.');
  assert.equal(legacyAboutCopy.intro.titleTh, 'Moe Navigation Co.,Ltd.');
  const copy = Object.values(legacyAboutCopy).flatMap(item => ['description', 'body'].flatMap(field => field in item ? [item[field as keyof typeof item]] : [])).join(' ');
  assert.equal(copy.split(/\s+/).length, 189);
  assert.doesNotMatch(JSON.stringify(legacyAboutCopy), /2022|10,000,000|SSOT|Kasikorn|Eddie|certif|zero damage|zero breakdown|Moe Container Line/i);
  assert.equal(legacyAboutImages.length, 6);
  assert.equal(new Set(legacyAboutImages.map(image => image.sha256)).size, 6);
  assert.equal(legacyAboutImages.some(image => /8884|compliance/i.test(image.sourceUrl)), false);
});
