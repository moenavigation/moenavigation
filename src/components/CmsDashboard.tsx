'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Database, Images, Inbox, Layers, Mail, RefreshCw, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import type { CmsContentSummary, ContentRecord, Enquiry } from '@/lib/cms-types';
import type { DashboardData, DashboardServiceStatus } from '@/lib/cms-dashboard';
import { cmsPathForView, type CmsSection } from '@/lib/cms-routes';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import CmsActivityLog from './CmsActivityLog';
import CmsAttentionDialog from './CmsAttentionDialog';
import styles from './CmsDashboard.module.css';

const collections = [
  ['Page', 'Pages'], ['Vessel', 'Fleet'], ['Route', 'Routes'],
  ['Service', 'Services'], ['Project', 'Projects'], ['News', 'News'],
] as const;
const serviceIcons = { database: Database, images: Images, email: Mail };
const serviceLabels = { database: 'Database', images: 'Image storage', email: 'Enquiry email' };
const statusLabels = { connected: 'Connected', configured: 'Configured', needs_setup: 'Needs setup', unavailable: 'Unavailable', unknown: 'Unknown' };

export default function CmsDashboard({ summary, newEnquiries, revision, onNavigate, onOpenEnquiry, onEdit, disabled }: {
  summary: CmsContentSummary; newEnquiries: number | null; revision: number;
  onNavigate: (section: CmsSection, type?: string) => void;
  onOpenEnquiry: (enquiry: Enquiry) => void; onEdit: (record: ContentRecord) => void; disabled: boolean;
}) {
  const { t, locale } = useCmsLocale();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attentionOpen, setAttentionOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try {
      const result = await cmsRequest<DashboardData>('/api/cms/dashboard', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
      if (request.current === controller && !controller.signal.aborted) setData(result);
    } catch (cause) { if (request.current === controller && !controller.signal.aborted) setError(cmsErrorText(cause)); }
    finally { if (request.current === controller) setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => { clearTimeout(timer); request.current?.abort(); };
  }, [load, revision]);
  const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB');
  const date = (value: string) => new Date(value).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const metrics = [
    { label: 'New enquiries', value: number(newEnquiries), icon: Inbox, section: 'inbox' },
    { label: 'Trash', value: number(summary.trashCount), icon: Trash2, section: 'trash' },
    { label: 'Web settings', value: null, icon: Settings, section: 'setting' },
  ] as const;
  return <div className={styles.dashboard}>
    <div className={styles.metrics} data-dashboard-metrics>
      {metrics.map(({ label, value, icon: Icon, section }) => <Link key={label} href={cmsPathForView(section)} className={styles.metric} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} onClick={event => { if (disabled) event.preventDefault(); }} onNavigate={event => { event.preventDefault(); if (!disabled) onNavigate(section); }}><span className={styles.metricLabel}><Icon size={21} aria-hidden="true" />{t(label)}</span>{value !== null && <strong>{value}</strong>}</Link>)}
      <button type="button" className={`${styles.metric} ${styles.attentionMetric}`} disabled={disabled} aria-haspopup="dialog" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setAttentionOpen(true); }}><span className={styles.metricLabel}><CircleAlert size={21} aria-hidden="true" />{t('Attention')}</span><strong>{number(data?.attentionCount)}</strong></button>
    </div>
    {error && <div className={styles.error} role="alert"><span>{t('Dashboard details could not be loaded.')}</span><button type="button" className="button secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" />{t('Try again')}</button></div>}
    <div className={styles.columns}>
      <div className={styles.column}>
        <section className={styles.panel} aria-labelledby="dashboard-enquiries">
          <div className={styles.heading}><span className={styles.icon}><Inbox size={21} aria-hidden="true" /></span><div><h2 id="dashboard-enquiries">{t('Enquiries needing a reply')}</h2><p>{t('New and in-progress conversations.')}</p></div>{data && <span className={styles.count}>{number(data.enquiriesTotal)}</span>}</div>
          {!data ? <p className={styles.empty} role="status">{t(loading ? 'Loading enquiries…' : 'Enquiry details unavailable.')}</p> : data.enquiries.length ? <ul className={styles.enquiries}>{data.enquiries.map(enquiry => <li key={enquiry.id}><button type="button" disabled={disabled} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onOpenEnquiry(enquiry); }}><span className={styles.enquiryTop}><strong>{enquiry.subject}</strong><span className={`${styles.enquiryStatus} ${enquiry.status === 'New' ? styles.newStatus : ''}`}>{t(enquiry.status)}</span></span><span className={styles.muted}>{enquiry.company || enquiry.name}{enquiry.company && <> · {enquiry.name}</>}</span><time className={styles.date} dateTime={enquiry.createdAt}>{date(enquiry.createdAt)}</time></button></li>)}</ul> : <div className={styles.empty}><CheckCircle2 size={26} aria-hidden="true" /><p>{t('No enquiries awaiting a reply.')}</p></div>}
          <Link href="/cms/enquiries" className={styles.textLink} onNavigate={event => { event.preventDefault(); if (!disabled) onNavigate('inbox'); }}>{t('View all enquiries')}</Link>
        </section>
        <section className={styles.panel} aria-labelledby="dashboard-content"><div className={styles.heading}><span className={styles.icon}><Layers size={21} aria-hidden="true" /></span><div><h2 id="dashboard-content">{t('Content at a glance')}</h2><p>{t('Manage each area of your website.')}</p></div></div><div className={styles.collections}>{collections.map(([type, label]) => <button key={type} type="button" onClick={() => onNavigate('content', type)} disabled={disabled}><span>{t(label)}</span><strong>{number(summary.counts[type].total)}</strong></button>)}</div></section>
      </div>
      <div className={styles.column}>
        <div className={styles.panel}><CmsActivityLog compact revision={revision} /></div>
        <section className={styles.panel} aria-labelledby="dashboard-services"><div className={styles.heading}><span className={styles.icon}><ShieldCheck size={21} aria-hidden="true" /></span><div><h2 id="dashboard-services">{t('Service status')}</h2><p>{t('Connections and notification setup.')}</p></div></div>
          <ul className={styles.services}>{(['database', 'images', 'email'] as const).map(id => {
            const service = data?.services.find(item => item.id === id);
            const status: DashboardServiceStatus['status'] = service?.status ?? 'unknown'; const Icon = serviceIcons[id];
            return <li key={id}><div className={styles.serviceTop}><strong><Icon size={18} aria-hidden="true" />{t(serviceLabels[id])}</strong><span className={`${styles.serviceBadge} ${styles[status]}`}>{t(!service && loading ? 'Checking…' : statusLabels[status])}</span></div><p>{t(service?.detail ?? (loading ? 'Checking service status…' : 'Service status unavailable.'))}</p>{service && <time dateTime={service.checkedAt}>{t('Checked {date}', { date: date(service.checkedAt) })}</time>}</li>;
          })}</ul>
        </section>
      </div>
    </div>
    <CmsAttentionDialog open={attentionOpen} onClose={() => setAttentionOpen(false)} onEdit={onEdit} revision={revision} />
  </div>;
}
