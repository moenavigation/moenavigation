import type { ContentRecord, FooterStatistic } from './cms-types';

export const defaultFooterStatistics: FooterStatistic[] = [
  { label: 'Fleet', labelTh: 'กองเรือ', value: '8' },
  { label: 'Annual Carried Volume', labelTh: 'ปริมาณการขนส่งต่อปี', value: '15,559' },
  { label: 'Skilled Crew', labelTh: 'ลูกเรือผู้ชำนาญ', value: '89' },
  { label: 'Annual Voyages', labelTh: 'เที่ยวเรือต่อปี', value: '1,119' },
];

export function visibleFooterStatistics(record?: Pick<ContentRecord, 'footerStats'>): FooterStatistic[] {
  return (record?.footerStats || []).filter(item => item.value.trim() && item.label.trim() && item.labelTh.trim()).slice(0, 4);
}
