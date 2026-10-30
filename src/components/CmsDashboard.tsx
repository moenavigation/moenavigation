'use client';

import { ArrowRight, FileText, Globe2, Inbox, Layers, Trash2 } from 'lucide-react';
import type { CmsContentSummary, ContentRecord } from '@/lib/cms-types';
import type { CmsSection } from '@/lib/cms-routes';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsDashboard.module.css';

const collections = [
  ['Page', 'Pages'], ['Vessel', 'Fleet'], ['Route', 'Routes'],
  ['Service', 'Services'], ['Project', 'Projects'], ['News', 'News'],
] as const;

export default function CmsDashboard({ summary, newEnquiries, onNavigate, onEdit, disabled }: {
  summary: CmsContentSummary; newEnquiries: number | null;
  onNavigate: (section: CmsSection, type?: string) => void;
  onEdit: (record: ContentRecord) => void; disabled: boolean;
}) {
  const { t, locale } = useCmsLocale();
  const saved = Object.values(summary.counts).reduce((total, count) => total + count.total, 0);
  const trashed = summary.trashCount;
  const recent = summary.recent;
  const metrics = [
    { label: 'Saved content', value: saved, hint: 'All content in your workspace', icon: FileText, action: null },
    { label: 'Pages', value: summary.counts.Page.total, hint: 'Existing website pages', icon: Globe2, action: () => onNavigate('content', 'Page') },
    { label: 'New enquiries', value: newEnquiries ?? '—', hint: newEnquiries === null ? 'Enquiry count unavailable' : 'Waiting for your response', icon: Inbox, action: () => onNavigate('inbox') },
    { label: 'Trash', value: trashed, hint: 'Open Trash to manage all removed items', icon: Trash2, action: () => onNavigate('trash') },
  ];
  return <div className={styles.dashboard}>
    <div className={styles.metrics}>{metrics.map(({ label, value, hint, icon: Icon, action }) => <div key={label} className={styles.metric}><span className={styles.metricLabel}><Icon size={20} aria-hidden="true" />{t(label)}</span><strong>{typeof value === 'number' ? value.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB') : value}</strong><span className={styles.hint}>{t(hint)}</span>{action && <button type="button" className={styles.metricAction} aria-label={t(label)} onClick={action} disabled={disabled}>{t('Open')}<ArrowRight size={16} aria-hidden="true" /></button>}</div>)}</div>
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="dashboard-content"><div className={styles.heading}><span className={styles.icon}><Layers size={21} aria-hidden="true" /></span><div><h2 id="dashboard-content">{t('Content at a glance')}</h2><p>{t('Manage each area of your website.')}</p></div></div><div className={styles.collections}>{collections.map(([type, label]) => {
        const count = summary.counts[type];
        return <button key={type} type="button" onClick={() => onNavigate('content', type)} disabled={disabled}><span className={styles.collectionLabel}><span>{t(label)}</span><strong>{count.total}</strong></span><ArrowRight size={18} aria-hidden="true" /></button>;
      })}</div></section>
      <section className={styles.panel} aria-labelledby="dashboard-recent"><div className={styles.heading}><span className={styles.icon}><FileText size={21} aria-hidden="true" /></span><div><h2 id="dashboard-recent">{t('Recently updated')}</h2><p>{t('Continue working on your latest content.')}</p></div></div>{recent.length ? <ul className={styles.recent}>{recent.map(record => <li key={`${record.type}:${record.id}`}><button type="button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); onEdit(record); }} disabled={disabled}><span><strong>{locale === 'th' ? record.titleTh || record.title : record.title || record.titleTh}</strong><span className={styles.hint}>{t(record.type)} · {new Date(record.updatedAt!).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB')}</span></span><ArrowRight size={18} aria-hidden="true" /></button></li>)}</ul> : <p className={styles.empty}>{t('Updated content will appear here after you save changes.')}</p>}<div className={styles.shortcuts}><h3>{t('Quick actions')}</h3><button type="button" onClick={() => onNavigate('inbox')} disabled={disabled}>{t('Open enquiries')}<ArrowRight size={18} aria-hidden="true" /></button><button type="button" onClick={() => onNavigate('media')} disabled={disabled}>{t('Manage media')}<ArrowRight size={18} aria-hidden="true" /></button><button type="button" onClick={() => onNavigate('setting')} disabled={disabled}>{t('Website settings')}<ArrowRight size={18} aria-hidden="true" /></button></div></section>
    </div>
  </div>;
}
