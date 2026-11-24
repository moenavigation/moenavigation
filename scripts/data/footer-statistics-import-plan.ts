import assert from 'node:assert/strict';
import type { ContentRecord } from '../../src/lib/cms-types';
import { countPublicVessels, defaultFooterStatistics } from '../../src/lib/footer-statistics';

const previouslyImportedStatistics = [
  { label: 'Our Fleet', labelTh: 'กองเรือของเรา', value: '8' },
  { label: 'Annual Carried Volume', labelTh: 'ปริมาณการขนส่งต่อปี', value: '' },
  { label: 'Skilled Crew', labelTh: 'ลูกเรือผู้ชำนาญ', value: '' },
  { label: 'Annual Voyages', labelTh: 'เที่ยวเรือต่อปี', value: '' },
];

export function buildFooterStatisticsPlan(records: ContentRecord[]) {
  const matches = records.filter(record => record.type === 'Section' && record.id === 'footer' && record.parentId === 'shared' && !record.deletedAt);
  assert.equal(matches.length, 1, 'Expected one current shared footer record.');
  const footer = matches[0];
  // Repair only the exact previous import. Preserve any independent CMS edits,
  // including intentionally empty arrays and partially changed figures/labels.
  if (footer.footerStats !== undefined && JSON.stringify(footer.footerStats) !== JSON.stringify(previouslyImportedStatistics)) return [];
  const fleetCount = countPublicVessels(records);
  assert(fleetCount > 0, 'Verify the current fleet before importing statistics.');
  return [{ id: footer.id, expectedRevision: footer.revision, patch: {
    footerStats: defaultFooterStatistics.map((item, index) => ({ ...item, value: index === 0 ? String(fleetCount) : item.value })),
    ...(!footer.caption ? { caption: 'At a glance' } : {}),
    ...(!footer.captionTh ? { captionTh: 'ข้อมูลโดยสรุป' } : {}),
  } }];
}
