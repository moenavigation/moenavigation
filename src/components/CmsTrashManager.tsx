/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Check, FileText, ImageIcon, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Trash2, UserRound, X } from 'lucide-react';
import { useCmsLocale } from '@/lib/cms-locale';
import { CmsRequestError, cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { containDialogFocus } from '@/lib/dialog-focus';
import type { CmsRole } from '@/lib/cms-roles';
import type { ContentRecord } from '@/lib/cms-types';
import type { CmsTrashItem, CmsTrashKind, CmsTrashPage } from '@/lib/cms-trash';
import styles from './CmsTrashManager.module.css';

type Filter = 'All' | CmsTrashKind;
const options: { kind: Filter; label: string }[] = [
  { kind: 'All', label: 'All items' }, { kind: 'Image', label: 'Images' }, { kind: 'User', label: 'User accounts' },
  { kind: 'Vessel', label: 'Vessels' }, { kind: 'Route', label: 'Routes' }, { kind: 'Project', label: 'Projects' },
  { kind: 'Service', label: 'Services' }, { kind: 'News', label: 'News' }, { kind: 'Page', label: 'Pages' }, { kind: 'Section', label: 'Sections' },
];
type Action = { item: CmsTrashItem; operation: 'restore' | 'remove' };

function TrashDialog({ open, title, busy = false, onClose, triggerRef, fallbackRef, children }: { open: boolean; title: string; busy?: boolean; onClose: () => void; triggerRef: RefObject<HTMLElement | null>; fallbackRef?: RefObject<HTMLElement | null>; children: ReactNode }) {
  const { t } = useCmsLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdrop = useRef(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previous = triggerRef.current;
    const fallback = fallbackRef?.current;
    const overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; const next = previous?.isConnected ? previous : fallback; if (next?.isConnected) next.focus({ preventScroll: true }); };
  }, [open, triggerRef, fallbackRef]);
  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onPointerDown={event => { backdrop.current = event.target === event.currentTarget; }} onClick={event => { if (!busy && backdrop.current && event.target === event.currentTarget) onClose(); backdrop.current = false; }}>
    {open && <><div className={styles.dialogHeading}><h2 id={titleId}>{title}</h2><button type="button" className={styles.close} autoFocus disabled={busy} aria-label={t('Close {title}', { title })} onClick={onClose}><X size={21} aria-hidden="true" /></button></div><div className={styles.dialogBody}>{children}</div></>}
  </dialog>;
}

export default function CmsTrashManager({ role, target, initialKind, revision, onClearTarget, onBusyChange, onChanged }: {
  role: CmsRole; target: string | null; initialKind: string | null; revision: number;
  onClearTarget: () => void; onBusyChange: (busy: boolean) => void;
  onChanged: (item: CmsTrashItem, restored?: ContentRecord) => void;
}) {
  const { t, locale } = useCmsLocale();
  const [kind, setKind] = useState<Filter>(() => options.some(option => option.kind === initialKind) ? initialKind as Filter : 'All');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<(CmsTrashPage & { queryKey: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<Filter>(kind);
  const [action, setAction] = useState<Action | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mutation = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const actionTrigger = useRef<HTMLElement | null>(null);
  const params = new URLSearchParams();
  if (target) params.set('item', target);
  else { if (kind !== 'All') params.set('kind', kind); if (search.trim()) params.set('q', search.trim()); }
  const queryKey = params.toString();
  const current = data?.queryKey === queryKey ? data : null;
  const waiting = loading || !current && !error;
  const title = (item: CmsTrashItem) => locale === 'th' ? item.titleTh || item.title : item.title || item.titleTh || '';
  const date = (value: string) => new Date(value).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const visibleOptions = options.filter(option => option.kind !== 'User' || role !== 'Operator');
  const hasFilters = Boolean(target || search.trim() || kind !== 'All');

  const load = useCallback(async (cursor: string | null = null) => {
    if (mutation.current || cursor && request.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const query = new URLSearchParams(queryKey);
    if (cursor) query.set('cursor', cursor);
    setLoading(true); setError('');
    try {
      const result = await cmsRequest<CmsTrashPage>(`/api/cms/trash?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(previous => ({ ...result, queryKey, items: cursor && previous?.queryKey === queryKey ? [...previous.items, ...result.items.filter(item => !previous.items.some(existing => existing.key === item.key))] : result.items }));
    } catch (cause) { if (!controller.signal.aborted) setError(cmsErrorText(cause)); }
    finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }, [queryKey]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), search.trim() ? 250 : 0);
    return () => { clearTimeout(timer); request.current?.abort(); request.current = null; };
  }, [load, revision, search]);

  function clearFilters() {
    setKind('All'); setDraftKind('All'); setSearch(''); setNotice('');
    if (target || initialKind) onClearTarget();
    searchRef.current?.focus({ preventScroll: true });
  }
  function chooseAction(item: CmsTrashItem, operation: Action['operation'], trigger: HTMLElement) {
    if (busy || waiting || !(operation === 'restore' ? item.canRestore : item.canDelete)) return;
    actionTrigger.current = trigger; setActionError('');
    if (operation === 'restore' && item.kind !== 'User') void mutate({ item, operation });
    else setAction({ item, operation });
  }
  async function mutate(selected: Action, currentPassword?: string) {
    if (mutation.current) return;
    mutation.current = true; request.current?.abort(); request.current = null;
    setLoading(false); setBusy(true); onBusyChange(true); setActionError(''); setError(''); setNotice('');
    const { item, operation } = selected;
    try {
      let restored: ContentRecord | undefined;
      if (item.kind === 'User') {
        await cmsRequest(`/api/cms/users/${operation}`, { method: 'POST', body: JSON.stringify({ id: item.id, currentPassword }) });
      } else if (item.kind === 'Image') {
        await cmsRequest(`/api/cms/media/${operation}`, { method: 'POST', body: JSON.stringify({ mediaId: item.id }) });
      } else if (operation === 'restore') {
        const result = await cmsRequest<{ record: ContentRecord }>('/api/cms/content/action', { method: 'POST', body: JSON.stringify({ id: item.id, type: item.kind, expectedRevision: item.revision, action: 'restore' }) });
        restored = result.record;
      } else {
        await cmsRequest('/api/cms/content/remove', { method: 'POST', body: JSON.stringify({ id: item.id, type: item.kind, expectedRevision: item.revision }) });
      }
      setData(previous => !previous ? previous : { ...previous, items: previous.items.filter(entry => entry.key !== item.key), total: Math.max(0, previous.total - 1), counts: { ...previous.counts, All: Math.max(0, previous.counts.All - 1), [item.kind]: Math.max(0, previous.counts[item.kind] - 1) } });
      setAction(null);
      setNotice(t(operation === 'restore' ? '“{name}” restored.' : '“{name}” permanently deleted.', { name: title(item) }));
      onChanged(item, restored);
      searchRef.current?.focus({ preventScroll: true });
    } catch (cause) {
      let reconciled = false;
      // Check uncertain writes without repeating them. Provider failures can also
      // change an image's available actions even when the item is still retained.
      if (!(cause instanceof CmsRequestError) || cause.status === 0 || cause.status >= 500 || cause.status === 404 || cause.status === 409) {
        try {
          const latest = await cmsRequest<CmsTrashPage>(`/api/cms/trash?item=${encodeURIComponent(item.key)}`);
          const updated = latest.items.find(entry => entry.key === item.key);
          if (updated) {
            setData(previous => previous ? { ...previous, items: previous.items.map(entry => entry.key === item.key ? updated : entry) } : previous);
            setAction(previous => previous?.item.key === item.key ? { ...previous, item: updated } : previous);
          } else {
            setData(previous => previous ? { ...previous, items: previous.items.filter(entry => entry.key !== item.key) } : previous);
            setAction(null); setActionError('');
            setNotice(t('This item is no longer in Trash. The list has been refreshed.'));
            onChanged(item); reconciled = true;
          }
        } catch { /* Keep the original error and let the user refresh or retry. */ }
      }
      if (!reconciled) {
        if (item.kind === 'User' || operation === 'remove') setActionError(cmsErrorText(cause));
        else setError(cmsErrorText(cause));
      }
    } finally { mutation.current = false; setBusy(false); onBusyChange(false); }
  }
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const fields = new FormData(event.currentTarget);
    void mutate(action, action.item.kind === 'User' ? String(fields.get('currentPassword') || '') : undefined);
  }
  const actionTitle = action?.item.kind === 'User' ? action.operation === 'restore' ? 'Restore user' : 'Delete user permanently' : 'Delete permanently';
  const explanation = action?.item.kind === 'User'
    ? action.operation === 'restore' ? 'Restoring this account allows it to sign in again with its existing password and role. Previous sessions stay signed out.' : 'This user account will be permanently deleted. This cannot be undone.'
    : action?.item.kind === 'Image' ? 'This image will be permanently deleted. This cannot be undone.' : 'This cannot be undone. Saved images stay in the media library.';

  return <>
    <section className={styles.panel} aria-labelledby="trash-heading" aria-busy={busy}>
      <div className={styles.heading}><div><h2 id="trash-heading">{t('Trash items')}</h2><p>{t('Content and user accounts are kept for 30 days. Images stay until permanently deleted.')}</p></div></div>
      <div className={styles.toolbar}><label className={styles.search}><Search size={20} aria-hidden="true" /><input ref={searchRef} type="search" aria-label={t('Search Trash')} placeholder={t('Search names…')} maxLength={160} value={search} disabled={busy || Boolean(target)} onChange={event => setSearch(event.target.value)} /></label><button ref={filterRef} type="button" className="button secondary" aria-label={t('Filter Trash')} disabled={busy} onClick={() => { setDraftKind(kind); setFilterOpen(true); }}><SlidersHorizontal size={18} aria-hidden="true" />{t('Filters')}{kind !== 'All' && <span className={styles.filterDot} aria-hidden="true" />}</button></div>
      <div className={styles.results}><span role="status">{waiting ? t('Loading Trash…') : t('Showing {count} of {total} items', { count: current?.items.length ?? 0, total: current?.total ?? 0 })}{kind !== 'All' && !target && ` · ${t(options.find(option => option.kind === kind)!.label)}`}{target && ` · ${t('Selected item')}`}</span>{hasFilters && <button className={styles.textButton} type="button" disabled={busy} onClick={clearFilters}><X size={16} aria-hidden="true" />{t('Clear filters')}</button>}</div>
      {notice && <p className={styles.success} role="status"><Check size={18} aria-hidden="true" />{notice}</p>}
      {error && <div className={styles.error} role="alert">{t(error)}<button type="button" className="button secondary" disabled={busy || loading} onClick={() => void load()}>{t('Try again')}</button></div>}
      {!waiting && !error && !current?.items.length && <div className={styles.empty}><Trash2 size={34} aria-hidden="true" /><h3>{t(hasFilters ? 'No matching items' : 'Trash is empty')}</h3><p>{t(hasFilters ? 'Try another search or clear your filters.' : 'Removed content, images, and user accounts will appear here.')}</p></div>}
      {Boolean(current?.items.length) && <table className={styles.table}><thead><tr><th scope="col">{t('Item')}</th><th scope="col">{t('Type')}</th><th scope="col">{t('Moved to Trash')}</th><th scope="col">{t('Action')}</th></tr></thead><tbody>{current!.items.map(item => <tr key={item.key} data-trash-key={item.key}>
        <td className={styles.item}><div className={styles.identity}>{item.image ? <img src={item.image} alt="" width={88} height={60} loading="lazy" /> : <span className={styles.placeholder}>{item.kind === 'User' ? <UserRound size={24} aria-hidden="true" /> : item.kind === 'Image' ? <ImageIcon size={24} aria-hidden="true" /> : <FileText size={24} aria-hidden="true" />}</span>}<div><strong>{title(item)}</strong>{item.kind === 'User' && <span className={styles.role}>{item.role}</span>}{!item.canRestore && !item.canDelete && <span className={styles.reason}><ShieldCheck size={15} aria-hidden="true" />{t(item.restoreBlockedReason || item.deleteBlockedReason || 'Protected item')}</span>}</div></div></td>
        <td className={styles.type}>{t(item.kind === 'User' ? 'User account' : item.kind)}</td><td className={styles.date}><span>{date(item.deletedAt)}</span>{item.purgeAt && <small>{t('Available until {date}', { date: date(item.purgeAt) })}</small>}</td>
        <td><div className={styles.actions}>{item.canRestore && <button type="button" className="button secondary" disabled={busy || waiting} aria-label={t('Restore {name}', { name: title(item) })} onClick={event => chooseAction(item, 'restore', event.currentTarget)}><RotateCcw size={16} aria-hidden="true" />{t('Restore')}</button>}{item.canDelete && <button type="button" className={`button secondary ${styles.danger}`} disabled={busy || waiting} aria-label={t('Delete {name} permanently', { name: title(item) })} onClick={event => chooseAction(item, 'remove', event.currentTarget)}><Trash2 size={16} aria-hidden="true" />{t('Delete permanently')}</button>}</div>{!item.canRestore && item.canDelete && item.restoreBlockedReason && <p className={styles.reason}>{t(item.restoreBlockedReason)}</p>}{!item.canDelete && item.deleteBlockedReason && item.canRestore && <p className={styles.reason}>{t(item.deleteBlockedReason)}</p>}</td>
      </tr>)}</tbody></table>}
      {current?.nextCursor && <button type="button" className={`button secondary ${styles.more}`} disabled={busy || loading} onClick={() => void load(current.nextCursor)}>{t(loading ? 'Loading…' : 'Load more items')}</button>}
      {role === 'Operator' && <p className={styles.note}>{t('Only Dev and Admin can permanently delete items from Trash.')}</p>}
    </section>
    <TrashDialog open={filterOpen} title={t('Filter Trash')} triggerRef={filterRef} onClose={() => setFilterOpen(false)}>
      <form className={styles.filterForm} onSubmit={event => { event.preventDefault(); setKind(draftKind); setFilterOpen(false); setNotice(''); if (target) onClearTarget(); }}><div className={styles.filterScroller}><fieldset className={styles.filterOptions} role="radiogroup"><legend>{t('Item type')}</legend>{visibleOptions.map(option => <label key={option.kind} className={draftKind === option.kind ? styles.selected : ''}><input type="radio" name="trashKind" value={option.kind} aria-label={t(option.label)} checked={draftKind === option.kind} onChange={() => setDraftKind(option.kind)} /><span>{t(option.label)}</span><small aria-hidden="true">{data?.counts[option.kind] ?? 0}</small></label>)}</fieldset></div><div className={styles.dialogActions}><button type="button" className={styles.textButton} onClick={() => setDraftKind('All')}>{t('Reset selection')}</button><button type="button" className="button secondary" onClick={() => setFilterOpen(false)}>{t('Cancel')}</button><button type="submit" className="button">{t('Apply filters')}</button></div></form>
    </TrashDialog>
    <TrashDialog open={Boolean(action)} title={t(actionTitle)} busy={busy} triggerRef={actionTrigger} fallbackRef={searchRef} onClose={() => { if (!busy) { setAction(null); setActionError(''); } }}>
      {action && <form onSubmit={confirm} className={styles.confirmForm}><strong className={styles.confirmName}>{title(action.item)}</strong><p>{t(explanation)}</p>{action.item.kind === 'User' && <label>{t('Your current password')}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} disabled={busy} /></label>}{actionError && <p role="alert" className={styles.error}>{t(actionError)}</p>}<div className={styles.dialogActions}><button type="button" className="button secondary" disabled={busy} onClick={() => { setAction(null); setActionError(''); }}>{t('Cancel')}</button><button type="submit" className="button" disabled={busy}>{t(busy ? 'Saving…' : action.operation === 'restore' ? 'Restore user' : 'Delete permanently')}</button></div></form>}
    </TrashDialog>
  </>;
}
