'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { History, LockKeyhole, Search, X } from 'lucide-react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import type { CmsLogCategory, CmsLogItem, CmsLogPage } from '@/lib/cms-logs';
import styles from './CmsActivityLog.module.css';

const categories: { value: 'All' | CmsLogCategory; label: string }[] = [
  { value: 'All', label: 'All activities' }, { value: 'auth', label: 'Sign-in and security' },
  { value: 'content', label: 'Content' }, { value: 'user', label: 'Users' },
  { value: 'settings', label: 'Settings' }, { value: 'enquiry', label: 'Enquiries' }, { value: 'media', label: 'Images' },
];

export default function CmsActivityLog({ revision }: { revision: number }) {
  const { t, locale } = useCmsLocale();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'All' | CmsLogCategory>('All');
  const [data, setData] = useState<(CmsLogPage & { key: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectId = useId();
  const params = new URLSearchParams();
  if (search.trim()) params.set('q', search.trim());
  if (category !== 'All') params.set('category', category);
  const queryKey = params.toString();
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
    setLoading(true); setError('');
    try {
      const result = await cmsRequest<CmsLogPage>(`/api/cms/logs?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(previous => ({ ...result, key: queryKey, items: cursor && previous?.key === queryKey ? [...previous.items, ...result.items.filter(item => !previous.items.some(existing => existing.id === item.id))] : result.items }));
    } catch (cause) { if (!controller.signal.aborted) setError(cmsErrorText(cause)); }
    finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }, [queryKey]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), search.trim() ? 250 : 0);
    return () => { clearTimeout(timer); request.current?.abort(); request.current = null; };
  }, [load, revision, search]);
  function clear() { setSearch(''); setCategory('All'); searchRef.current?.focus({ preventScroll: true }); }

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
