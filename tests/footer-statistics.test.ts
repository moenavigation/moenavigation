import assert from 'node:assert/strict';
import test from 'node:test';
import { countPublicVessels, defaultFooterStatistics, visibleFooterStatistics } from '../src/lib/footer-statistics';
import { recordSchema } from '../src/lib/validation';
import { buildFooterStatisticsPlan } from '../scripts/data/footer-statistics-import-plan';
import { websiteContentRecords } from '../scripts/data/website-content';
import type { ContentRecord } from '../src/lib/cms-types';
import { translateCmsError } from '../src/lib/cms-messages-th';

const seededRecords = websiteContentRecords as ContentRecord[];
const footer = seededRecords.find(record => record.type === 'Section' && record.id === 'footer')!;

test('footer statistics use current fleet count and the three user-approved source figures', () => {
  const records = seededRecords.map(record => record.id === 'footer' ? { ...record, footerStats: undefined, caption: '', captionTh: '' } : record);
  const before = structuredClone(records), plan = buildFooterStatisticsPlan(records);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, 'footer');
  assert.deepEqual(plan[0].patch.footerStats.map(item => item.value), ['8', '15,559', '89', '1,119']);
  assert.equal(plan[0].patch.footerStats[0].label, 'Fleet');
  assert.deepEqual(Object.keys(plan[0].patch).sort(), ['caption', 'captionTh', 'footerStats']);
  assert.deepEqual(records, before);
  assert.equal(recordSchema.safeParse({ ...footer, ...plan[0].patch }).success, true);
  assert.deepEqual(buildFooterStatisticsPlan(seededRecords), []);
});

test('footer plan preserves later edits including intentionally blank statistics', () => {
  for (const statistics of [[], [{ label: 'Current', labelTh: 'ปัจจุบัน', value: '12' }]]) {
    assert.deepEqual(buildFooterStatisticsPlan(seededRecords.map(record => record.id === 'footer' ? { ...record, footerStats: statistics } : record)), []);
  }
  assert.throws(() => buildFooterStatisticsPlan(seededRecords.filter(record => record.id !== 'footer')));
});

test('footer repair fills only the exact previous imported defaults and is idempotent', () => {
  const previous = [
    { label: 'Our Fleet', labelTh: 'กองเรือของเรา', value: '8' },
    { label: 'Annual Carried Volume', labelTh: 'ปริมาณการขนส่งต่อปี', value: '' },
    { label: 'Skilled Crew', labelTh: 'ลูกเรือผู้ชำนาญ', value: '' },
    { label: 'Annual Voyages', labelTh: 'เที่ยวเรือต่อปี', value: '' },
  ];
  const records = seededRecords.map(record => record.id === 'footer' ? { ...record, footerStats: previous } : record);
  const plan = buildFooterStatisticsPlan(records);
  assert.deepEqual(plan[0].patch.footerStats, defaultFooterStatistics);
  assert.deepEqual(buildFooterStatisticsPlan(records.map(record => record.id === 'footer' ? { ...record, ...plan[0].patch } : record)), []);
  for (const patch of [{ value: '123' }, { label: 'Client label' }, { labelTh: 'ชื่อที่แก้ไข' }]) {
    const changed = records.map(record => record.id === 'footer' ? { ...record, footerStats: previous.map((item, index) => index === 1 ? { ...item, ...patch } : item) } : record);
    assert.deepEqual(buildFooterStatisticsPlan(changed), [], 'Independent statistics must not be overwritten.');
  }
});

test('public statistics hide incomplete or blank values without showing misleading zeros', () => {
  assert.deepEqual(visibleFooterStatistics(undefined, 8), []);
  assert.equal(visibleFooterStatistics({ footerStats: defaultFooterStatistics }, 8).length, 4);
  assert.deepEqual(visibleFooterStatistics({ footerStats: [{ label: 'Missing Thai', labelTh: '', value: '3' }, { label: 'Blank', labelTh: 'ว่าง', value: ' ' }] }, 8), []);
  assert.equal(visibleFooterStatistics({ footerStats: defaultFooterStatistics }, 0)[0].value, '0');
});

test('Fleet always uses the visible vessel count, while other values and icon positions are preserved', () => {
  const before = structuredClone(defaultFooterStatistics);
  const vessels = seededRecords.filter(record => record.type === 'Vessel');
  const records = [...vessels, { ...vessels[0], id: 'draft-copy', status: 'Draft' as const }, { ...vessels[0], id: 'trashed-copy', deletedAt: '2026-11-17' }, footer];
  assert.equal(countPublicVessels(records), vessels.length);
  const stats = defaultFooterStatistics.map((item, index) => ({ ...item, value: index === 0 ? '999' : index === 1 ? '' : item.value }));
  const visible = visibleFooterStatistics({ footerStats: stats }, countPublicVessels(records));
  assert.deepEqual(visible.map(item => [item.sourceIndex, item.value]), [[0, String(vessels.length)], [2, '89'], [3, '1,119']]);
  stats[0].value = '';
  assert.equal(visibleFooterStatistics({ footerStats: stats }, 0)[0].value, '0');
  assert.deepEqual(defaultFooterStatistics, before);
});

test('statistics validate ownership, bilingual labels and bounded values at the API boundary', () => {
  assert.equal(recordSchema.safeParse(footer).success, true);
  for (const record of [
    { ...footer, id: 'other' },
    { ...footer, parentId: 'about' },
    { ...footer, footerStats: [{ label: 'Missing Thai', labelTh: '', value: '8' }] },
    { ...footer, footerStats: [...defaultFooterStatistics, defaultFooterStatistics[0]] },
    { ...footer, footerStats: [{ label: 'Value', labelTh: 'ค่า', value: '8'.repeat(31) }] },
  ]) assert.equal(recordSchema.safeParse(record).success, false);
  assert.equal(recordSchema.safeParse({ ...footer, footerStats: [] }).success, true);
});

test('footer validation errors include a specific translated field and Thai recovery guidance', () => {
  const invalid = recordSchema.safeParse({ ...footer, footerStats: [{ label: ' ', labelTh: 'กองเรือ', value: '8' }] });
  assert.equal(invalid.success, false);
  if (invalid.success) return;
  const issue = invalid.error.issues.find(item => item.path[0] === 'footerStats');
  assert.equal(issue?.message, 'Provide both English and Thai labels for a visible statistic.');
  assert.equal(translateCmsError(`Footer statistics: ${issue!.message}`), 'สถิติส่วนท้ายเว็บไซต์: กรอกชื่อสถิติทั้งภาษาอังกฤษและภาษาไทยสำหรับสถิติที่แสดง');
  assert.equal(translateCmsError('Footer statistics: Footer statistics belong to the shared footer only.'), 'สถิติส่วนท้ายเว็บไซต์: สถิติส่วนท้ายเว็บไซต์ใช้ได้เฉพาะส่วนท้ายเว็บไซต์ที่ใช้ร่วมกันเท่านั้น');
});
