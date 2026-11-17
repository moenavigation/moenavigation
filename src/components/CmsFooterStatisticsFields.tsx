'use client';

import { ChartNoAxesColumn } from 'lucide-react';
import type { ContentRecord, FooterStatistic } from '@/lib/cms-types';
import { defaultFooterStatistics } from '@/lib/footer-statistics';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsPageFields.module.css';

export default function CmsFooterStatisticsFields({ record, onChange }: { record: ContentRecord; onChange: (patch: Partial<ContentRecord>) => void }) {
  const { locale, t } = useCmsLocale();
  const items = defaultFooterStatistics.map((fallback, index) => record.footerStats?.[index] || { ...fallback, value: '' });
  function change(index: number, patch: Partial<FooterStatistic>) {
    onChange({ footerStats: items.map((item, position) => position === index ? { ...item, ...patch } : item) });
  }
  return <section className={styles.statisticsFields} aria-labelledby="footer-statistics-title">
    <div className={styles.pictureHeading}><ChartNoAxesColumn size={21} aria-hidden="true" /><h3 id="footer-statistics-title">{t('Footer statistics')}</h3></div>
    <p className={styles.hint}>{t('Fleet is counted automatically. Enter verified figures for the other statistics; leave a value blank to hide it.')}</p>
    {items.map((item, index) => <fieldset className={styles.statisticCard} key={index}>
      <legend>{t('Statistic {number}', { number: index + 1 })}</legend>
      {index === 0 ? <p className={styles.hint}>{t('Automatically counts vessels shown on the website. Adding, removing or restoring a vessel updates this number.')}</p> : <label className={styles.field}>{t('Displayed value')}<input placeholder={locale === 'th' ? 'เช่น 89' : 'e.g. 89'} maxLength={30} value={item.value} onChange={event => change(index, { value: event.target.value })} /></label>}
      <div className={styles.imageDescriptions}>{([locale, locale === 'th' ? 'en' : 'th'] as const).map(language => <label className={styles.field} key={language}>{t(`Label · ${language === 'th' ? 'Thai' : 'English'}`)}<input lang={language} placeholder={language === 'th' ? 'ชื่อสถิติ' : 'Statistic label'} required={index === 0 || Boolean(item.value.trim())} maxLength={100} value={language === 'th' ? item.labelTh : item.label} onChange={event => change(index, { [language === 'th' ? 'labelTh' : 'label']: event.target.value })} /></label>)}</div>
    </fieldset>)}
  </section>;
}
