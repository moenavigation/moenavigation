/* eslint-disable @next/next/no-img-element */
'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, ImagePlus, Search, Trash2, X } from 'lucide-react';
import { CmsRequestError, cmsErrorText, cmsRequest, prepareCmsImage, resolveSubmission, type PreparedImage } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import { containDialogFocus } from '@/lib/dialog-focus';
import type { CmsUser } from '@/lib/cms-roles';
import type { MediaItem } from '@/lib/cms-types';
import useCmsMediaSearch from './useCmsMediaSearch';
import styles from './CmsUserPhotoDialog.module.css';

type ProfileUser = CmsUser & { current: boolean; profileRevision?: number };
export default function CmsUserPhotoDialog({ user, onClose, onSaved }: { user: ProfileUser; onClose: () => void; onSaved: (user: CmsUser) => void }) {
  const { t } = useCmsLocale();
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [baseRevision, setBaseRevision] = useState(user.profileRevision ?? 0);
  const [conflict, setConflict] = useState<CmsUser | null>(null);
  const [picker, setPicker] = useState(false);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const preparedRef = useRef<PreparedImage | null>(null);
  const staged = useRef<MediaItem | null>(null);
  const submission = useRef('');
  const savingRef = useRef(false);
  const uploadAttempted = useRef(false);
  const accepted = useRef(false);
  const alive = useRef(true);
  const libraryRequest = useRef<AbortController | null>(null);
  const titleId = useId();
  const busy = preparing || saving;
  const dirty = Boolean(prepared || avatar !== (user.avatar || ''));
  const search = useCmsMediaSearch(query, picker);
  const searching = Boolean(query.trim());
  const images = searching ? search.items : library;
  const more = searching ? Boolean(search.nextCursor) : Boolean(cursor);
  const pageCount = Math.max(1, Math.ceil(images.length / 12));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = images.slice(currentPage * 12, currentPage * 12 + 12);
  const selectedPreview = prepared?.preview || avatar;

  useEffect(() => {
    alive.current = true;
    const modal = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    modal?.showModal(); document.body.style.overflow = 'hidden';
    return () => {
      alive.current = false; modal?.close(); document.body.style.overflow = overflow;
      libraryRequest.current?.abort();
      if (preparedRef.current) URL.revokeObjectURL(preparedRef.current.preview);
      if (!accepted.current && uploadAttempted.current && submission.current) void resolveSubmission(submission.current, 'abort').catch(() => {});
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  useEffect(() => {
    if (!picker || library.length) return;
    const timer = setTimeout(() => void loadLibrary(), 0);
    return () => clearTimeout(timer);
    // Initial library reads are independent of the search field and its pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker]);

  async function loadLibrary(next: string | null = null) {
    if (libraryRequest.current) return;
    const controller = new AbortController(); libraryRequest.current = controller;
    setLibraryLoading(true); setLibraryError('');
    try {
      const result = await cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>(`/api/cms/media${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, { signal: controller.signal });
      if (!controller.signal.aborted) { setLibrary(previous => next ? [...previous, ...result.media.filter(item => !previous.some(existing => existing.id === item.id))] : result.media); setCursor(result.nextCursor); }
    } catch (cause) { if (!controller.signal.aborted) setLibraryError(cmsErrorText(cause)); }
    finally { if (libraryRequest.current === controller) { libraryRequest.current = null; setLibraryLoading(false); } }
  }
  function clearPrepared() {
    if (preparedRef.current) URL.revokeObjectURL(preparedRef.current.preview);
    preparedRef.current = null; setPrepared(null);
  }
  function resetSubmission() {
    if (uploadAttempted.current && submission.current) void resolveSubmission(submission.current, 'abort').catch(() => {});
    submission.current = ''; uploadAttempted.current = false; staged.current = null;
  }
  async function chooseFile(file: File) {
    if (busy) return;
    setPreparing(true); setError('');
    try {
      const image = await prepareCmsImage(file);
      if (!alive.current) { URL.revokeObjectURL(image.preview); return; }
      clearPrepared(); resetSubmission(); preparedRef.current = image; setPrepared(image); setPicker(false);
    } catch (cause) { if (alive.current) setError(cmsErrorText(cause)); }
    finally { if (alive.current) setPreparing(false); }
  }
  function chooseLibrary(url: string) { clearPrepared(); resetSubmission(); setAvatar(url); setPicker(false); setError(''); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || busy || !dirty || conflict) return;
    const fields = new FormData(event.currentTarget);
    savingRef.current = true; setSaving(true); setError('');
    if (!submission.current) submission.current = crypto.randomUUID();
    let desiredAvatar = avatar;
    let profileWriteAttempted = false;
    try {
      if (preparedRef.current) {
        if (!staged.current) {
          const body = new FormData(); body.set('file', preparedRef.current.blob, preparedRef.current.filename); body.set('submissionId', submission.current);
          uploadAttempted.current = true;
          const result = await cmsRequest<{ media: MediaItem }>('/api/cms/media', { method: 'POST', body });
          staged.current = result.media;
        }
        desiredAvatar = staged.current.url;
      }
      profileWriteAttempted = true;
      const result = await cmsRequest<{ user: CmsUser }>('/api/cms/users/profile', { method: 'POST', body: JSON.stringify({ id: user.id, avatar: desiredAvatar, submissionId: submission.current, expectedProfileRevision: baseRevision, ...(!user.current ? { currentPassword: String(fields.get('currentPassword') || '') } : {}) }) });
      accepted.current = true; if (alive.current) onSaved(result.user);
    } catch (cause) {
      // A lost successful response must not create a second profile change or
      // discard an image the account already references.
      if (profileWriteAttempted && (!(cause instanceof CmsRequestError) || cause.status === 0 || cause.status >= 500 || cause.status === 409)) {
        try {
          const latest = await cmsRequest<{ users: (CmsUser & { profileRevision?: number })[] }>('/api/cms/users');
          const saved = latest.users.find(item => item.id === user.id);
          if (saved && (saved.avatar || '') === desiredAvatar && (saved.profileRevision ?? 0) > baseRevision) { accepted.current = true; if (alive.current) onSaved(saved); return; }
          if (alive.current && saved && (saved.profileRevision ?? 0) !== baseRevision) setConflict(saved);
        } catch { /* Keep the prepared image and the original error available. */ }
      }
      if (alive.current) setError(cmsErrorText(cause));
    } finally { savingRef.current = false; if (alive.current) setSaving(false); }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className={styles.heading}><div><h2 id={titleId}>{t('Profile photo')}</h2><p>{user.username}</p></div><button type="button" autoFocus disabled={busy} className={styles.close} aria-label={t('Close profile photo')} onClick={onClose}><X size={21} aria-hidden="true" /></button></div>
    <form onSubmit={save} className={styles.form} aria-busy={busy}><div className={styles.body}>
      <div className={styles.preview}>{selectedPreview ? <img src={selectedPreview} alt={t('Profile photo preview')} width={104} height={104} /> : <span aria-label={t('No profile photo')}>{user.username.slice(0, 1).toUpperCase()}</span>}<p>{t(prepared ? 'Ready to upload. Your image uploads when you save.' : 'Choose a photo from your device or the image library.')}</p></div>
      <div className={styles.choices}><label className={styles.fileButton}><ImagePlus size={18} aria-hidden="true" />{t('Choose device image')}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('Choose profile photo')} disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void chooseFile(file); event.target.value = ''; }} /></label><button type="button" className="button secondary" disabled={busy} aria-expanded={picker} onClick={() => { setPicker(value => !value); setQuery(''); setPage(0); }}>{t('Browse library')}</button>{selectedPreview && <button type="button" className={styles.textButton} disabled={busy} onClick={() => { clearPrepared(); resetSubmission(); setAvatar(''); }}><Trash2 size={16} />{t('Remove photo')}</button>}</div>
      {preparing && <p role="status">{t('Preparing image…')}</p>}
      {picker && <section className={styles.library} aria-label={t('Profile image library')}><label className={styles.search}><Search size={18} aria-hidden="true" /><input ref={searchRef} type="search" maxLength={160} aria-label={t('Search profile images')} placeholder={t('Search image names…')} value={query} disabled={busy} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        {(searching ? search.loading : libraryLoading && !images.length) ? <p role="status">{t('Loading your images')}</p> : (searching ? search.error : libraryError) ? <div className={styles.error} role="alert">{t(searching ? search.error : libraryError)}<button type="button" className="button secondary" onClick={() => { if (searching) search.retry(); else void loadLibrary(); }}>{t('Try again')}</button></div> : <><div className={styles.images}>{visible.map(item => <button type="button" data-profile-image key={item.id} disabled={busy} aria-pressed={!prepared && avatar === item.url} onClick={() => chooseLibrary(item.url)}><img src={item.url} alt="" width={150} height={100} loading="lazy" /><span>{item.title}</span>{!prepared && avatar === item.url && <Check size={16} aria-hidden="true" />}</button>)}</div>{!images.length && <p>{t('No matching images. Try another name or clear your search.')}</p>}
          {pageCount > 1 && <div className={styles.pagination}><button type="button" className="button secondary" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('Previous images')}</button><span>{t('Page {page} of {total}', { page: currentPage + 1, total: pageCount })}</span><button type="button" className="button secondary" disabled={busy || currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>{t('Next images')}</button></div>}{more && currentPage === pageCount - 1 && <button type="button" className="button secondary" disabled={busy || libraryLoading || search.loadingMore} onClick={() => { if (searching) void search.loadMore(); else void loadLibrary(cursor); }}>{t('Load more images')}</button>}</>}
      </section>}
      {!user.current && <label className={styles.password}>{t('Your current password')}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} disabled={busy} /></label>}
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      {conflict && <div className={styles.conflict}><p>{t('Another change was saved first. Your selected photo is kept. Review the current photo before saving again.')}</p>{conflict.avatar && <img src={conflict.avatar} alt={t('Current saved profile photo')} width={64} height={64} />}<button type="button" className="button secondary" disabled={busy} onClick={() => { setBaseRevision(conflict.profileRevision ?? 0); setConflict(null); setError(''); }}>{t('Use my selected photo')}</button></div>}
    </div><div className={styles.footer}><button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button" disabled={busy || !dirty || Boolean(conflict)}>{t(saving ? 'Saving photo…' : 'Save photo')}</button></div></form>
  </dialog>;
}
