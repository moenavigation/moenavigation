'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, FileText, ImageOff, Languages, Pencil, Search, Ship, SlidersHorizontal, X } from 'lucide-react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { attentionTypes, type AttentionPage, type AttentionQuery } from '@/lib/cms-dashboard';
import { useCmsLocale } from '@/lib/cms-locale';
import type { ContentRecord } from '@/lib/cms-types';
import Dialog from './Dialog';
import styles from './CmsAttentionDialog.module.css';

type Props = { open: boolean; onClose: () => void; onEdit: (record: ContentRecord) => void; revision: number };

export default function CmsAttentionDialog({ open, onClose, onEdit, revision }: Props) {
  const { t, locale } = useCmsLocale();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<AttentionQuery['type']>('All');
  const [issue, setIssue] = useState<AttentionQuery['issue']>('All');
  const [data, setData] = useState<(AttentionPage & { key: string }) | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const pendingEdit = useRef<ContentRecord | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeId = useId(), issueId = useId();
  const params = new URLSearchParams({ view: 'attention' });
  if (search.trim()) params.set('q', search.trim());
  if (type !== 'All') params.set('type', type);
  if (issue !== 'All') params.set('issue', issue);
  const queryKey = params.toString();
  const dataKey = `${revision}:${queryKey}`;
  const current = data?.key === dataKey ? data : null;
  const currentError = error?.key === dataKey ? error.message : '';
  const loadingInitial = !current && !currentError;
  const filtered = Boolean(search.trim() || type !== 'All' || issue !== 'All');

  const load = useCallback(async (cursor: string | null = null) => {
    if (cursor && request.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const query = new URLSearchParams(queryKey);
    if (cursor) query.set('cursor', cursor);
    setLoading(true); setError(null);
    try {
      const result = await cmsRequest<AttentionPage>(`/api/cms/dashboard?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(previous => ({ ...result, key: dataKey, items: cursor && previous?.key === dataKey ? [...previous.items, ...result.items.filter(item => !previous.items.some(existing => existing.record.id === item.record.id && existing.record.type === item.record.type))] : result.items }));
    } catch (cause) {
      if (!controller.signal.aborted) setError({ key: dataKey, message: cmsErrorText(cause) });
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, [queryKey, dataKey]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(), search.trim() ? 250 : 0);
    return () => { clearTimeout(timer); request.current?.abort(); request.current = null; };
  }, [open, load, search]);

  const afterClose = useCallback(() => {
    const record = pendingEdit.current; pendingEdit.current = null;
    if (record) requestAnimationFrame(() => onEdit(record));
  }, [onEdit]);

  function clear() { setSearch(''); setType('All'); setIssue('All'); searchRef.current?.focus({ preventScroll: true }); }

  return <Dialog open={open} onClose={onClose} onAfterClose={afterClose} className={styles.dialog} title={t('Content needing attention')} closeLabel={t('Close attention review')}>
    <div className={styles.workspace}>
      <div className={styles.intro}><span className={styles.introIcon}><SlidersHorizontal size={25} aria-hidden="true" /></span><p>{t('Review missing translations, images and vessel details. Open an item to update it.')}</p></div>
      <div className={styles.filters}>
        <label className={styles.search}><Search size={20} aria-hidden="true" /><input ref={searchRef} type="search" maxLength={160} value={search} aria-label={t('Search content needing attention')} placeholder={t('Search content…')} onChange={event => setSearch(event.target.value)} /></label>
        <div className={styles.select}><label htmlFor={typeId}>{t('Content type')}</label><select id={typeId} value={type} onChange={event => setType(event.target.value as AttentionQuery['type'])}><option value="All">{t('All content types')}</option>{attentionTypes.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></div>
        <div className={styles.select}><label htmlFor={issueId}>{t('Needs attention')}</label><select id={issueId} value={issue} onChange={event => setIssue(event.target.value as AttentionQuery['issue'])}><option value="All">{t('All missing details')}</option><option value="translation">{t('English and Thai text')}</option><option value="image">{t('Main image')}</option><option value="vessel_details">{t('Vessel details')}</option></select></div>
      </div>
      <div className={styles.results}><span role="status">{loadingInitial ? t('Checking content…') : current ? t('Showing {count} of {total} items needing attention', { count: current.items.length, total: current.total }) : t('Content review unavailable')}</span>{filtered && <button type="button" className={styles.clear} onClick={clear}><X size={17} aria-hidden="true" />{t('Clear filters')}</button>}</div>
      {currentError && <div className={styles.error} role="alert"><p>{t(currentError)}</p><button type="button" className="button secondary" disabled={loading} onClick={() => void load(current?.nextCursor && current.items.length ? current.nextCursor : null)}>{t('Try again')}</button></div>}
      {loadingInitial && <div className={styles.loading} aria-hidden="true">{[0, 1, 2, 3].map(index => <div key={index} />)}</div>}
      {!loadingInitial && !currentError && current?.items.length === 0 && <div className={styles.empty}><CheckCircle2 size={37} aria-hidden="true" /><h3>{t(filtered ? 'No matching items' : 'No missing details found')}</h3><p>{t(filtered ? 'Try another search or clear your filters.' : 'The checked content has English and Thai text, images and vessel details where needed.')}</p></div>}
      {Boolean(current?.items.length) && <ul className={styles.list}>{current!.items.map(({ record, issues }) => {
        const title = (locale === 'th' ? record.titleTh || record.title : record.title || record.titleTh) || t('Untitled content');
        const secondary = locale === 'th' ? record.title : record.titleTh;
        const RecordIcon = record.type === 'Vessel' ? Ship : FileText;
        return <li key={`${record.type}:${record.id}`} className={styles.item}>
          <div className={styles.itemHeading}><span className={styles.recordIcon}><RecordIcon size={21} aria-hidden="true" /></span><div><span className={styles.type}>{t(record.type)}</span><h3>{title}</h3>{secondary && secondary !== title && <p lang={locale === 'th' ? 'en' : 'th'}>{secondary}</p>}</div></div>
          <ul className={styles.issues}>{issues.map(item => {
            const Icon = item.code === 'translation' ? Languages : item.code === 'image' ? ImageOff : Ship;
            return <li key={item.code}><Icon size={17} aria-hidden="true" />{t(item.label)}</li>;
          })}</ul>
          <button type="button" className={`button secondary ${styles.edit}`} aria-label={t('Edit {title}', { title })} onClick={() => { pendingEdit.current = record; onClose(); }}><Pencil size={17} aria-hidden="true" />{t('Edit content')}</button>
        </li>;
      })}</ul>}
      {current?.nextCursor && <button type="button" className={`button secondary ${styles.more}`} disabled={loading} onClick={() => void load(current.nextCursor)}>{t(loading ? 'Loading…' : 'Load more content')}</button>}
    </div>
  </Dialog>;
}
