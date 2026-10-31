'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, Database, History, Inbox, Layers, LockKeyhole, Search, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import { cmsLogGroups, type CmsLogCategoryFilter, type CmsLogItem, type CmsLogPage } from '@/lib/cms-logs';
import Dialog from './Dialog';
import styles from './CmsActivityLog.module.css';

const categories: { value: CmsLogCategoryFilter; label: string }[] = [
  ...cmsLogGroups, { value: 'auth', label: 'Sign-in and security' },
  { value: 'content', label: 'Content' }, { value: 'user', label: 'Users' },
  { value: 'settings', label: 'Settings' }, { value: 'enquiry', label: 'Enquiries' }, { value: 'media', label: 'Images' },
];

export default function CmsActivityLog({ revision, compact = false }: { revision: number; compact?: boolean }) {
  const routeParams = useSearchParams();
  const routeSearch = (routeParams.get('q') || '').slice(0, 160);
  const routeCategory = categories.find(option => option.value === routeParams.get('category'))?.value || 'All';
  return <ActivityLogContent key={compact ? 'compact' : JSON.stringify([routeSearch, routeCategory])} revision={revision} compact={compact} initialSearch={compact ? '' : routeSearch} initialCategory={compact ? 'All' : routeCategory} />;
}

function ActivityLogContent({ revision, compact, initialSearch, initialCategory }: { revision: number; compact: boolean; initialSearch: string; initialCategory: CmsLogCategoryFilter }) {
  const { t, locale } = useCmsLocale();
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState<CmsLogCategoryFilter>(initialCategory);
  const [filterOpen, setFilterOpen] = useState(false);
  const [data, setData] = useState<(CmsLogPage & { key: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const selectId = useId();
  const params = new URLSearchParams();
  if (search.trim()) params.set('q', search.trim());
  if (category !== 'All') params.set('category', category);
  const queryKey = params.toString();
  const error = failure?.key === queryKey ? failure.message : '';
  const activeFilters = Number(Boolean(search.trim())) + Number(category !== 'All');
  const current = data?.key === queryKey ? data : null;
  const loadingInitial = loading && !current || !current && !error;
  const formatDate = (value: string) => new Date(value).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const actorLabel = (item: CmsLogItem) => 'system' in item.actor ? t(item.action === 'auth.login' && item.outcome === 'denied' ? 'Unidentified user' : 'System') : item.actor.username;
  const targetLabel = (item: CmsLogItem) => item.target.label || (item.target.type === 'Session' ? t('CMS sign-in') : item.target.type === 'Settings' ? t('Website details') : item.target.type === 'MediaLibrary' ? t('Media library') : item.target.id);

  const load = useCallback(async (cursor: string | null = null) => {
    if (cursor && request.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const query = new URLSearchParams(queryKey);
    if (cursor) query.set('cursor', cursor);
    setLoading(true); setFailure(null);
    try {
      const result = await cmsRequest<CmsLogPage>(`/api/cms/logs?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(previous => ({ ...result, key: queryKey, items: cursor && previous?.key === queryKey ? [...previous.items, ...result.items.filter(item => !previous.items.some(existing => existing.id === item.id))] : result.items }));
    } catch (cause) { if (!controller.signal.aborted) setFailure({ key: queryKey, message: cmsErrorText(cause) }); }
    finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }, [queryKey]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), search.trim() ? 250 : 0);
    return () => { clearTimeout(timer); request.current?.abort(); request.current = null; };
  }, [load, revision, search]);
  function clear() { setSearch(''); setCategory('All'); searchRef.current?.focus({ preventScroll: true }); }
  function chooseGroup(value: CmsLogCategoryFilter) { setSearch(''); setCategory(value); setFilterOpen(false); }

  if (compact) return <section className={styles.compact} aria-labelledby="dashboard-activity">
    <div className={styles.compactHeader}><div className={styles.heading}><span className={styles.icon}><History size={21} aria-hidden="true" /></span><div><h2 id="dashboard-activity">{t('Recent activity')}</h2><p>{t('Latest entries from Logs.')}</p></div></div><button ref={filterTrigger} type="button" className={styles.filterButton} aria-label={t('Filter activity')} aria-haspopup="dialog" aria-expanded={filterOpen} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setFilterOpen(true); }}><SlidersHorizontal size={18} aria-hidden="true" /><span>{t('Filter')}</span>{activeFilters > 0 && <span className={styles.filterCount} aria-hidden="true">{activeFilters}</span>}</button></div>
    {activeFilters > 0 && <div className={styles.filterChips}>{search.trim() && <span><Search size={15} aria-hidden="true" />{search.trim()}</span>}{category !== 'All' && <span>{t(categories.find(option => option.value === category)!.label)}</span>}<button type="button" className={styles.textButton} onClick={clear}>{t('Clear filters')}</button></div>}
    {loadingInitial && <p className={styles.results} role="status">{t('Loading logs…')}</p>}
    {error && <div className={styles.error} role="alert">{t(error)}<button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>{t('Try again')}</button></div>}
    {!loadingInitial && !error && !current?.items.length && <p className={styles.previewEmpty}>{t(activeFilters ? 'No matching activity' : 'No activity yet')}</p>}
    {Boolean(current?.items.length) && <ul className={styles.previewList}>{current!.items.slice(0, 5).map(item => <li key={item.id} data-log-id={item.id}>
      <div className={styles.previewSummary}><strong>{t(item.summary)}</strong><span className={`${styles.outcome} ${styles[item.outcome]}`}>{t(item.outcome === 'success' ? 'Completed' : item.outcome === 'denied' ? 'Denied' : 'Failed')}</span></div>
      <span className={styles.previewTarget}>{targetLabel(item)}</span><div className={styles.previewMeta}><span>{actorLabel(item)}</span><time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time></div>
    </li>)}</ul>}
    <Link href={`/cms/logs${queryKey ? `?${queryKey}` : ''}`} className={styles.textButton}>{t('View all logs')}<History size={17} aria-hidden="true" /></Link>
    <Dialog open={filterOpen} onClose={() => setFilterOpen(false)} triggerRef={filterTrigger} className={styles.choiceDialog} title={t('Filter activity')} closeLabel={t('Close filters')}>
      <div className={styles.groupOptions}>{cmsLogGroups.map(group => {
        const Icon = group.value === 'data_changes' ? Database : group.value === 'user_activity' ? UserRound : group.value === 'enquiry_activity' ? Inbox : Layers;
        return <button key={group.value} type="button" aria-pressed={category === group.value} onClick={() => chooseGroup(group.value)}><span className={styles.groupIcon}><Icon size={21} aria-hidden="true" /></span><span className={styles.groupCopy}><strong>{t(group.label)}</strong><span>{t(group.description)}</span></span><Check className={styles.groupCheck} size={19} aria-hidden="true" /></button>;
      })}</div>
    </Dialog>
  </section>;

  return <section className={styles.panel} aria-labelledby="activity-log-heading">
    <div className={styles.heading}><span className={styles.icon}><History size={23} aria-hidden="true" /></span><div><h2 id="activity-log-heading">{t('Activity log')}</h2><p>{t('See who changed your website and when.')}</p></div></div>
    <p className={styles.retention}><LockKeyhole size={18} aria-hidden="true" /><span>{t('Logs are read-only for every role, including Dev. Each entry expires permanently after one year.')}</span></p>
    <div className={styles.filters}><label className={styles.search}><Search size={20} aria-hidden="true" /><input ref={searchRef} type="search" maxLength={160} aria-label={t('Search logs')} placeholder={t('Search users or item names…')} value={search} onChange={event => setSearch(event.target.value)} /></label><div className={styles.category}><label htmlFor={selectId}>{t('Activity type')}</label><select id={selectId} value={category} onChange={event => setCategory(event.target.value as typeof category)}>{categories.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></div></div>
    <div className={styles.results}><span role="status">{loadingInitial ? t('Loading logs…') : t('Showing {count} of {total} log entries', { count: current?.items.length ?? 0, total: current?.total ?? 0 })}</span>{(search || category !== 'All') && <button type="button" className={styles.textButton} onClick={clear}><X size={16} aria-hidden="true" />{t('Clear filters')}</button>}</div>
    {error && <div className={styles.error} role="alert">{t(error)}<button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>{t('Try again')}</button></div>}
    {!loadingInitial && !error && !current?.items.length && <div className={styles.empty}><History size={34} aria-hidden="true" /><h3>{t(search || category !== 'All' ? 'No matching activity' : 'No activity yet')}</h3><p>{t(search || category !== 'All' ? 'Try another search or clear your filters.' : 'New CMS activity will appear here automatically.')}</p></div>}
    {Boolean(current?.items.length) && <table className={styles.table}><thead><tr><th scope="col">{t('When')}</th><th scope="col">{t('User')}</th><th scope="col">{t('Activity')}</th><th scope="col">{t('Item')}</th></tr></thead><tbody>{current!.items.map(item => <tr key={item.id} data-log-id={item.id}>
      <td className={styles.date}><time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time><small>{t('Expires {date}', { date: formatDate(item.expiresAt) })}</small></td>
      <td className={styles.actor}><strong>{actorLabel(item)}</strong>{'role' in item.actor && <small>{item.actor.role}</small>}</td>
      <td className={styles.activity}><strong>{t(item.summary)}</strong><span className={`${styles.outcome} ${styles[item.outcome]}`}>{t(item.outcome === 'success' ? 'Completed' : item.outcome === 'denied' ? 'Denied' : 'Failed')}</span></td>
      <td className={styles.target}><span>{targetLabel(item)}</span>{!['Session', 'Settings', 'MediaLibrary'].includes(item.target.type) && <small>{t(item.target.type === 'User' ? 'User account' : item.target.type)}</small>}</td>
    </tr>)}</tbody></table>}
    {current?.nextCursor && <button type="button" className={`button secondary ${styles.more}`} disabled={loading} onClick={() => void load(current.nextCursor)}>{t(loading ? 'Loading…' : 'Load more logs')}</button>}
  </section>;
}
