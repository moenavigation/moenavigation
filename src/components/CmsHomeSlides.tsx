/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, Check, GripVertical, ImagePlus, Images, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import { CmsRequestError, cmsErrorText, cmsRequest, prepareCmsImage, resolveSubmission, type PreparedImage } from '@/lib/cms-client';
import type { ContentImage, ContentRecord, MediaItem } from '@/lib/cms-types';
import { defaultHomeSlides, getHomeSlides, getHomeSlideInterval } from '@/lib/home-slides';
import { useCmsLocale } from '@/lib/cms-locale';
import Dialog from './Dialog';
import useCmsMediaSearch from './useCmsMediaSearch';
import styles from './CmsHomeSlides.module.css';

type Slide = ContentImage & { key: string };
type Desired = { slides: ContentImage[]; interval: number; revision: number };
export type CmsSlidesDraft = {
  ownerId: string; saved: ContentRecord | null; slides: Slide[]; intervalSeconds: number; attempts: number; conflict: ContentRecord | null; error: string; uncertain: boolean;
  prepared: Map<string, PreparedImage>; staged: Map<string, MediaItem>; submission: string; hasUploaded: boolean; lastDesired: Desired | null;
};
export class CmsSlidesDraftStore {
  private draft: CmsSlidesDraft | null = null;
  read(ownerId: string) { return this.draft?.ownerId === ownerId ? this.draft : null; }
  save(draft: CmsSlidesDraft) { if (this.draft && this.draft.ownerId !== draft.ownerId) this.discard(); this.draft = draft; }
  resources(ownerId: string, resources: Pick<CmsSlidesDraft, 'submission' | 'hasUploaded' | 'lastDesired'>) { if (this.draft?.ownerId === ownerId) Object.assign(this.draft, resources); }
  async cancelUploads() { if (this.draft?.submission) { const result = await resolveSubmission(this.draft.submission, 'abort'); if (result.status === 'pending') throw new Error('The save outcome is uncertain. Keep this editor open and check saved content.'); this.draft.staged.clear(); this.draft.submission = ''; this.draft.hasUploaded = false; this.draft.lastDesired = null; } }
  discard() { if (this.draft) for (const image of this.draft.prepared.values()) URL.revokeObjectURL(image.preview); this.draft = null; }
}
type Props = { active: boolean; ownerId: string; store: CmsSlidesDraftStore; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; onSaved: (record: ContentRecord) => void };
const serialize = (slides: ContentImage[], interval: number) => JSON.stringify({ slides: slides.map(({ url, alt, altTh }) => ({ url, alt, altTh })), interval });
const asSlides = (record: ContentRecord): Slide[] => getHomeSlides(record).map((slide, index) => ({ ...slide, key: `saved-${index}-${slide.url}` }));

function SlideCard({ slide, index, total, busy, onChange, onMove, onRemove }: { slide: Slide; index: number; total: number; busy: boolean; onChange: (field: 'alt' | 'altTh', value: string) => void; onMove: (offset: number) => void; onRemove: () => void }) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();
  const { t, locale } = useCmsLocale();
  const fields = locale === 'th' ? ['altTh', 'alt'] as const : ['alt', 'altTh'] as const;
  return <Reorder.Item value={slide} id={`slide-${slide.key}`} dragListener={false} dragControls={controls} drag={!busy} layout="position" transition={{ duration: reduceMotion ? 0 : .2 }} className={styles.card} data-slide-card>
    <div className={styles.cardTop}>
      <button type="button" className={`${styles.iconButton} ${styles.handle}`} disabled={busy} aria-label={t('Drag slide {number} to reorder', { number: index + 1 })} onPointerDown={event => controls.start(event)}><GripVertical aria-hidden="true" size={20} /></button>
      <div className={styles.cardSummary}><strong>{t('Slide {number}', { number: index + 1 })}</strong>{slide.url.startsWith('blob:') && <span>{t('Ready to upload')}</span>}</div>
      <div className={styles.cardActions}><button type="button" className={styles.iconButton} disabled={busy || index === 0} aria-label={t('Move slide {number} up', { number: index + 1 })} onClick={() => onMove(-1)}><ArrowUp size={18} aria-hidden="true" /></button><button type="button" className={styles.iconButton} disabled={busy || index === total - 1} aria-label={t('Move slide {number} down', { number: index + 1 })} onClick={() => onMove(1)}><ArrowDown size={18} aria-hidden="true" /></button><button type="button" className={styles.iconButton} disabled={busy || total === 1} aria-label={t('Remove slide {number}', { number: index + 1 })} onClick={onRemove}><Trash2 size={18} aria-hidden="true" /></button></div>
    </div>
    <div className={styles.thumbnail}><img src={slide.url} alt={locale === 'th' ? slide.altTh : slide.alt} width={600} height={200} loading="lazy" /><span>{String(index + 1).padStart(2, '0')}</span></div>
    <details className={styles.descriptions}><summary>{t('Image descriptions')}</summary><div>{fields.map(field => <label key={field}>{t(field === 'alt' ? 'Image description · English' : 'Image description · Thai')}<input lang={field === 'alt' ? 'en' : 'th'} maxLength={250} value={slide[field]} disabled={busy} onChange={event => onChange(field, event.target.value)} /></label>)}</div></details>
  </Reorder.Item>;
}

export default function CmsHomeSlides({ active, ownerId, store, onDirtyChange, onBusyChange, onSaved }: Props) {
  const { t, locale } = useCmsLocale();
  const [initial] = useState(() => store.read(ownerId));
  const [saved, setSaved] = useState<ContentRecord | null>(initial?.saved ?? null);
  const [slides, setSlides] = useState<Slide[]>(initial?.slides ?? []);
  const [intervalSeconds, setIntervalSeconds] = useState(initial?.intervalSeconds ?? 3);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(initial?.error ?? '');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState<ContentRecord | null>(initial?.conflict ?? null);
  const [uncertain, setUncertain] = useState(Boolean(initial?.uncertain || initial?.lastDesired));
  const [picker, setPicker] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [attempts, setAttempts] = useState(initial?.attempts ?? 0);
  const prepared = useRef(initial?.prepared ?? new Map<string, PreparedImage>());
  const staged = useRef(initial?.staged ?? new Map<string, MediaItem>());
  const submission = useRef(initial?.submission ?? '');
  const busyRef = useRef(false);
  const loadRequest = useRef(false);
  const mounted = useRef(true);
  const initialRequest = useRef(Boolean(initial?.saved));
  const hasUploaded = useRef(initial?.hasUploaded ?? false);
  const lastDesired = useRef<Desired | null>(initial?.lastDesired ?? null);
  const busy = saving || preparing || loading;
  const locked = busy || uncertain;
  const dirty = Boolean(saved && serialize(slides, intervalSeconds) !== serialize(getHomeSlides(saved), getHomeSlideInterval(saved)));
  const search = useCmsMediaSearch(query, active && picker);
  const searching = Boolean(query.trim());
  const images = searching ? search.items : library;
  const pageCount = Math.max(1, Math.ceil(images.length / 12));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleImages = images.slice(currentPage * 12, currentPage * 12 + 12);
  const hasMore = searching ? Boolean(search.nextCursor) : Boolean(cursor);
  const includedBanners = defaultHomeSlides.filter(slide => (locale === 'th' ? slide.altTh : slide.alt).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  const accept = useCallback((record: ContentRecord) => {
    // A confirmed save can retain fewer cards than an earlier upload attempt.
    // Cleanup protects committed references and removes only unused uploads.
    if (hasUploaded.current && submission.current) void resolveSubmission(submission.current, 'abort').catch(() => {});
    const next = asSlides(record);
    setSaved(record); setSlides(next); setIntervalSeconds(getHomeSlideInterval(record)); setConflict(null); setAttempts(0); setUncertain(false);
    for (const image of prepared.current.values()) URL.revokeObjectURL(image.preview);
    prepared.current.clear(); staged.current.clear(); submission.current = ''; hasUploaded.current = false; lastDesired.current = null;
  }, [hasUploaded, lastDesired, submission]);
  const load = useCallback(async () => {
    if (loadRequest.current) return;
    loadRequest.current = true;
    setLoading(true); setError(''); setNotice('');
    try { const result = await cmsRequest<{ record: ContentRecord }>('/api/cms/home-slides'); if (mounted.current) accept(result.record); }
    catch (cause) { if (mounted.current) setError(cmsErrorText(cause)); }
    finally { loadRequest.current = false; if (mounted.current) setLoading(false); }
  }, [accept]);
  useEffect(() => { if (active && !initialRequest.current) { initialRequest.current = true; void load(); } }, [active, load]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    // The owning layout retains this draft through session expiry. Only an
    // explicit sign-out/discard or a different account releases its blobs.
    store.save({ ownerId, saved, slides, intervalSeconds, attempts, conflict, error, uncertain, prepared: prepared.current, staged: staged.current, submission: submission.current, hasUploaded: hasUploaded.current, lastDesired: lastDesired.current });
  });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; store.resources(ownerId, { submission: submission.current, hasUploaded: hasUploaded.current, lastDesired: lastDesired.current }); };
  }, [ownerId, store]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  function changed() { setNotice(''); setError(''); setAttempts(0); }
  function updateSlides(next: Slide[]) { if (locked) return; changed(); setSlides(next); }
  function move(index: number, offset: number) { const next = [...slides]; const target = index + offset; [next[index], next[target]] = [next[target], next[index]]; updateSlides(next); setNotice(t('Slide moved to position {number}. Save to apply.', { number: target + 1 })); }
  function remove(slide: Slide) {
    if (slides.length < 2 || locked) return;
    const image = prepared.current.get(slide.key); if (image) URL.revokeObjectURL(image.preview);
    prepared.current.delete(slide.key); updateSlides(slides.filter(item => item.key !== slide.key));
  }
  async function chooseFiles(files: File[]) {
    if (locked || !files.length) return;
    if (slides.length + files.length > 12) { setError('You can add up to 12 slides.'); return; }
    setPreparing(true); changed();
    const additions: Slide[] = [];
    try {
      for (const file of files) {
        const image = await prepareCmsImage(file);
        if (!mounted.current) { URL.revokeObjectURL(image.preview); return; }
        const key = crypto.randomUUID(); prepared.current.set(key, image); additions.push({ key, url: image.preview, alt: '', altTh: '' });
      }
      setSlides(previous => [...previous, ...additions]);
    } catch (cause) {
      for (const slide of additions) { const image = prepared.current.get(slide.key); if (image) URL.revokeObjectURL(image.preview); prepared.current.delete(slide.key); }
      if (mounted.current) setError(cmsErrorText(cause));
    } finally { if (mounted.current) setPreparing(false); }
  }
  async function loadLibrary(next: string | null = null) {
    setLibraryLoading(true); setLibraryError('');
    try { const result = await cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>(`/api/cms/media${next ? `?cursor=${encodeURIComponent(next)}` : ''}`); if (mounted.current) { setLibrary(previous => next ? [...previous, ...result.media.filter(item => !previous.some(existing => existing.id === item.id))] : result.media); setCursor(result.nextCursor); } }
    catch (cause) { if (mounted.current) setLibraryError(cmsErrorText(cause)); }
    finally { if (mounted.current) setLibraryLoading(false); }
  }
  function openLibrary() { setPicker(true); setQuery(''); setPage(0); if (!library.length) void loadLibrary(); }
  function addLibrary(item: MediaItem) { if (slides.length >= 12 || slides.some(slide => slide.url === item.url)) return; const slide = { key: crypto.randomUUID(), url: item.url, alt: '', altTh: '' }; updateSlides([...slides, slide]); setPicker(false); }
  function addIncluded(item: ContentImage) { if (locked || slides.length >= 12 || slides.some(slide => slide.url === item.url)) return; const slide = { ...item, key: crypto.randomUUID() }; updateSlides([...slides, slide]); setPicker(false); }
  async function reconcile(abortAttempt = false) {
    const desired = lastDesired.current;
    if (!desired) return false;
    // Resolve the exact request before changing its payload or identifier.
    // This also finds a committed save after a later homepage edit.
    const outcome = await resolveSubmission(submission.current, 'resolve');
    if (outcome.record) {
      accept(outcome.record); onSaved(outcome.record); setNotice('Homepage slides saved. Your website is up to date.'); return true;
    }
    const latest = (await cmsRequest<{ record: ContentRecord }>('/api/cms/home-slides')).record;
    if (latest.revision > desired.revision && serialize(getHomeSlides(latest), getHomeSlideInterval(latest)) === serialize(desired.slides, desired.interval)) {
      accept(latest); onSaved(latest); setNotice('Homepage slides saved. Your website is up to date.'); return true;
    }
    if (abortAttempt) {
      // Tombstone only when abandoning an attempted payload. Normal retries
      // keep successful uploads and send the same idempotent request.
      const cancelled = await resolveSubmission(submission.current, 'abort');
      if (cancelled.record) { accept(cancelled.record); onSaved(cancelled.record); setNotice('Homepage slides saved. Your website is up to date.'); return true; }
      if (cancelled.status === 'pending') throw new Error('The save outcome is uncertain. Keep this editor open and check saved content.');
      staged.current.clear(); submission.current = ''; hasUploaded.current = false; lastDesired.current = null; setUncertain(false);
    } else setUncertain(true);
    if (latest.revision !== desired.revision) setConflict(latest);
    return false;
  }
  async function save() {
    if (!saved || busyRef.current || busy || !dirty || conflict || attempts >= 3) return;
    busyRef.current = true; setSaving(true); setError(''); setNotice(''); setAttempts(value => value + 1);
    if (!submission.current) submission.current = crypto.randomUUID();
    let writeAttempted = false;
    try {
      const desired: ContentImage[] = [];
      for (const [index, slide] of slides.entries()) {
        let url = slide.url;
        const image = prepared.current.get(slide.key);
        if (image) {
          if (!staged.current.has(slide.key)) {
            setProgress(t('Uploading image {number} of {total}…', { number: index + 1, total: slides.length }));
            const body = new FormData(); body.set('file', image.blob, image.filename); body.set('submissionId', submission.current); hasUploaded.current = true;
            const result = await cmsRequest<{ media: MediaItem }>('/api/cms/media', { method: 'POST', body }); staged.current.set(slide.key, result.media);
          }
          url = staged.current.get(slide.key)!.url;
        }
        desired.push({ url, alt: slide.alt.trim(), altTh: slide.altTh.trim() });
      }
      setProgress(t('Saving slides…'));
      lastDesired.current = { slides: desired, interval: intervalSeconds, revision: saved.revision }; writeAttempted = true;
      const result = await cmsRequest<{ record: ContentRecord }>('/api/cms/home-slides', { method: 'PUT', body: JSON.stringify({ slides: desired, intervalSeconds, expectedRevision: saved.revision, submissionId: submission.current }) });
      if (mounted.current) { accept(result.record); onSaved(result.record); setNotice('Homepage slides saved. Your website is up to date.'); }
    } catch (cause) {
      if (writeAttempted && (!(cause instanceof CmsRequestError) || cause.status === 0 || cause.status >= 500 || cause.status === 409)) {
        try { if (await reconcile()) return; } catch { if (mounted.current) setUncertain(true); }
      } else if (writeAttempted) {
        // A definitive validation response never committed this request.
        lastDesired.current = null;
      }
      if (mounted.current) setError(cmsErrorText(cause));
    } finally { busyRef.current = false; if (mounted.current) { setSaving(false); setProgress(''); } }
  }
  async function reload() {
    if (busyRef.current || busy) return;
    busyRef.current = true; setLoading(true);
    try {
    setConfirmReload(false);
    if (lastDesired.current) { try { if (await reconcile(true)) return; } catch (cause) { setError(cmsErrorText(cause)); return; } }
    if (hasUploaded.current && submission.current) {
      try { const result = await resolveSubmission(submission.current, 'abort'); if (result.status === 'pending') { setError('The save outcome is uncertain. Keep this editor open and check saved content.'); return; } staged.current.clear(); submission.current = ''; hasUploaded.current = false; lastDesired.current = null; }
      catch (cause) { setError(cmsErrorText(cause)); return; }
    }
    await load();
    } finally { busyRef.current = false; if (mounted.current) setLoading(false); }
  }
  async function checkSaved() {
    if (busyRef.current || busy) return;
    busyRef.current = true; setLoading(true);
    try {
      if (await reconcile(true)) return;
      if (submission.current) {
        const result = await resolveSubmission(submission.current, 'abort');
        if (result.record) { accept(result.record); onSaved(result.record); setNotice('Homepage slides saved. Your website is up to date.'); return; }
        if (result.status === 'pending') throw new Error('The save outcome is uncertain. Keep this editor open and check saved content.');
        submission.current = ''; hasUploaded.current = false; staged.current.clear(); lastDesired.current = null;
      }
      setAttempts(0); setError(''); setUncertain(false);
    } catch (cause) { setError(cmsErrorText(cause)); }
    finally { busyRef.current = false; if (mounted.current) setLoading(false); }
  }
  return <section hidden={!active} className={styles.manager} aria-label={t('Homepage slides')}>
    {loading && <p role="status" className={styles.loading}>{t('Loading homepage slides…')}</p>}
    {!saved && !loading && <div className={styles.empty}><p>{t(error || 'Homepage slides could not be loaded.')}</p><button type="button" className="button secondary" onClick={() => void load()}><RefreshCw size={18} />{t('Try again')}</button></div>}
    {saved && <>
      <div className={styles.toolbar}><div><span className={styles.count}>{t('{count} slides', { count: slides.length })}</span><span className={styles.draft}>{t(dirty ? 'Unsaved changes' : 'All changes saved')}</span></div><div className={styles.toolbarActions}><button type="button" className="button secondary" disabled={busy} onClick={() => dirty ? setConfirmReload(true) : void load()}><RefreshCw size={17} />{t('Reload saved slides')}</button><button type="button" className="button" disabled={busy || !dirty || Boolean(conflict) || attempts >= 3} onClick={() => void save()}><Save size={18} />{t(saving ? 'Saving slides…' : 'Save slides')}</button></div></div>
      <div className={styles.layout}>
        <div className={styles.editor}>
          <div className={styles.sectionHeading}><div><h2>{t('Slide order')}</h2><p>{t('Drag the handle to arrange your images. The first image opens the homepage.')}</p></div></div>
          <Reorder.Group axis="xy" values={slides} onReorder={next => updateSlides(next)} className={styles.cards} aria-label={t('Reorder homepage slides')}>
            {slides.map((slide, index) => <SlideCard key={slide.key} slide={slide} index={index} total={slides.length} busy={locked} onChange={(field, value) => updateSlides(slides.map(item => item.key === slide.key ? { ...item, [field]: value } : item))} onMove={offset => move(index, offset)} onRemove={() => remove(slide)} />)}
          </Reorder.Group>
          <div className={styles.addPanel}>
            <div className={styles.addContent}><div className={styles.addHeading}><Plus size={21} aria-hidden="true" /><strong>{t('Add a banner')}</strong><p>{t('Use a wide image with the main subject near the center.')}</p></div><div className={styles.addActions}><label className={`button secondary ${styles.fileButton}`} aria-disabled={locked || slides.length >= 12}><ImagePlus size={18} />{t('Choose device image')}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked || slides.length >= 12} aria-label={t('Upload banner images')} onChange={event => { void chooseFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /></label><button type="button" className="button secondary" disabled={locked || slides.length >= 12} onClick={openLibrary}><Images size={18} />{t('Browse library')}</button></div><p>{t('Device images upload only when you save. Up to 12 slides.')}</p></div>
            <div className={styles.timing}><label htmlFor="hero-slide-interval">{t('Time between slides')}</label><div><input id="hero-slide-interval" type="range" min={2} max={15} step={1} value={intervalSeconds} disabled={locked} onChange={event => { changed(); setIntervalSeconds(Number(event.target.value)); }} /><output htmlFor="hero-slide-interval">{t('{seconds} sec', { seconds: intervalSeconds })}</output></div><p>{t('The homepage advances automatically. Visitors can pause it at any time.')}</p></div>
          </div>
        </div>
      </div>
      {(preparing || progress) && <p className={styles.status} role="status">{progress || t('Preparing image…')}</p>}
      {error && <div className={styles.error} role="alert"><p>{t(error)}</p><p>{t('Your changes and prepared images are kept here.')}</p></div>}
      {(uncertain || attempts >= 3) && !conflict && <div className={styles.error}><p>{t(attempts >= 3 ? 'Saving has failed three times. Check the saved version before trying again.' : 'The previous save needs checking. Retry Save with the same changes, or check the saved version before editing.')}</p><button type="button" className="button secondary" disabled={busy} onClick={() => void checkSaved()}>{t('Check saved slides')}</button></div>}
      {conflict && <div className={styles.conflict}><h3>{t('Another change was saved first')}</h3><p>{t('Your slide order and images are kept. Reload the saved slides, or keep your version after reviewing the latest change.')}</p><div><button type="button" className="button secondary" onClick={() => setConfirmReload(true)}>{t('Reload saved slides')}</button><button type="button" className="button secondary" disabled={busy} onClick={async () => { try { if (await reconcile(true)) return; setSaved(conflict); setConflict(null); setAttempts(0); setError(''); } catch (cause) { setError(cmsErrorText(cause)); } }}>{t('Keep my version')}</button></div></div>}
      {notice && <p className={styles.success} role="status"><Check size={18} />{t(notice)}</p>}
    </>}
    <Dialog open={active && picker} onClose={() => setPicker(false)} title={t('Choose a banner image')} closeLabel={t('Close image library')}><div className={styles.library}><label className={styles.search}><Search size={18} /><input type="search" maxLength={160} value={query} aria-label={t('Search banner images')} placeholder={t('Search image names…')} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      {includedBanners.length > 0 && <section className={styles.included} aria-label={t('Included banners')}><h3>{t('Included banners')}</h3><div className={styles.libraryGrid}>{includedBanners.map(item => <button type="button" key={item.url} disabled={locked || slides.some(slide => slide.url === item.url)} onClick={() => addIncluded(item)}><img src={item.url} alt="" width={300} height={100} loading="lazy" /><span>{locale === 'th' ? item.altTh : item.alt}</span>{slides.some(slide => slide.url === item.url) && <Check size={16} />}</button>)}</div></section>}
      <h3>{t('Media library')}</h3>
      {(searching ? search.loading : libraryLoading && !images.length) ? <p role="status">{t('Loading your images')}</p> : <><div className={styles.libraryGrid}>{visibleImages.map(item => <button type="button" key={item.id} disabled={slides.some(slide => slide.url === item.url)} onClick={() => addLibrary(item)}><img src={item.url} alt="" width={300} height={100} loading="lazy" /><span>{item.title}</span>{slides.some(slide => slide.url === item.url) && <Check size={16} />}</button>)}</div>{!images.length && <p>{t('No matching images. Try another name or clear your search.')}</p>}</>}
      {(searching ? search.error : libraryError) && <div className={styles.error} role="alert">{t(searching ? search.error : libraryError)}<button type="button" className="button secondary" onClick={() => searching ? search.retry() : void loadLibrary()}>{t('Try again')}</button></div>}
      {pageCount > 1 && <div className={styles.pagination}><button type="button" className="button secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('Previous images')}</button><span>{t('Page {page} of {total}', { page: currentPage + 1, total: pageCount })}</span><button type="button" className="button secondary" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>{t('Next images')}</button></div>}{hasMore && currentPage === pageCount - 1 && <button type="button" className="button secondary" disabled={libraryLoading || search.loadingMore} onClick={() => searching ? void search.loadMore() : void loadLibrary(cursor)}>{t('Load more images')}</button>}
    </div></Dialog>
    <Dialog open={active && confirmReload} onClose={() => setConfirmReload(false)} title={t('Reload saved slides?')} closeLabel={t('Cancel')}><p>{t('This replaces your unsaved slide changes with the latest saved version.')}</p><div className={styles.confirmActions}><button type="button" className="button secondary" onClick={() => setConfirmReload(false)}>{t('Cancel')}</button><button type="button" className="button" onClick={() => void reload()}>{t('Reload saved slides')}</button></div></Dialog>
  </section>;
}
