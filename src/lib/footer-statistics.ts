import type { ContentRecord, FooterStatistic } from './cms-types';

export const defaultFooterStatistics: FooterStatistic[] = [
  { label: 'Fleet', labelTh: 'กองเรือ', value: '8' },
  { label: 'Annual Carried Volume', labelTh: 'ปริมาณการขนส่งต่อปี', value: '15,559' },
  { label: 'Skilled Crew', labelTh: 'ลูกเรือผู้ชำนาญ', value: '89' },
  { label: 'Annual Voyages', labelTh: 'เที่ยวเรือต่อปี', value: '1,119' },
];

export function countPublicVessels(records: readonly ContentRecord[]): number {
  return records.filter(record => record.type === 'Vessel' && record.status === 'Published' && !record.deletedAt).length;
}

export function visibleFooterStatistics(record: Pick<ContentRecord, 'footerStats'> | undefined, fleetCount: number): (FooterStatistic & { sourceIndex: number })[] {
  return (record?.footerStats || []).slice(0, 4)
    .map((item, sourceIndex) => ({ ...item, sourceIndex, value: sourceIndex === 0 ? String(fleetCount) : item.value }))
    .filter(item => item.value.trim() && item.label.trim() && item.labelTh.trim());
}
