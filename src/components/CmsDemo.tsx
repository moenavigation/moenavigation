/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Container, Download, FileText, ImagePlus, Inbox, LoaderCircle, LockKeyhole, LogOut, Menu, Newspaper, Plus, RefreshCw, RotateCcw, Route, Search, Settings, Ship, Trash2, UploadCloud, X } from 'lucide-react';
import { legacyRecordKey as demoRecordKey, readLegacySnapshot, legacyRecordMatches, legacyMediaMatches, rememberLegacyRecord, rememberLegacyMedia, clearVerifiedLegacy, hasLegacyArchive, restoreLegacyArchive, getLegacySubmission, saveLegacySubmission, translateLegacyRecord, legacyImageUrl, type LegacyRecord as DemoRecord, type LegacySnapshot } from '@/lib/cms-legacy';
import { corePageIds, type ContentRecord, type MediaItem, type Enquiry, type SiteSettings } from '@/lib/cms-types';
import { recordSchema, siteSettingsSchema } from '@/lib/validation';
import { cmsPageLabel, contentBelongsToPage, publishedContentUrl } from '@/lib/cms-navigation';
import { containDialogFocus } from '@/lib/dialog-focus';
import { CmsRequestError, cmsErrorText, cmsRequest, prepareCmsImage, resolveSubmission, mapRecordImages, recordImageUrls, parseRouteCoordinates, refreshWebsiteDetailsDraft, createEditorDraftExport, changeEditorContentType, type PreparedImage } from '@/lib/cms-client';
import BrandMark from './BrandMark';
import LoadingScreen, { LoadingPanel } from './LoadingScreen';
import CmsContentFields, { type ImageTarget } from './CmsContentFields';
import useCmsInbox from './useCmsInbox';
import type { InboxStatus } from '@/lib/inbox-query';
import styles from './CmsDemo.module.css';
import { useCmsLocale } from '@/lib/cms-locale';
import { href } from '@/lib/content';
import CmsLanguageSwitch from './CmsLanguageSwitch';

type User = { username: string };
type Section = 'content' | 'trash' | 'inbox' | 'account';
const typeOptions: { title: string; type: ContentRecord['type']; icon: typeof Ship }[] = [
  { title: 'Pages', type: 'Page', icon: FileText }, { title: 'Sections', type: 'Section', icon: FileText }, { title: 'Fleet', type: 'Vessel', icon: Ship },
  { title: 'Routes', type: 'Route', icon: Route }, { title: 'Projects', type: 'Project', icon: Container },
  { title: 'Services', type: 'Service', icon: Settings }, { title: 'News', type: 'News', icon: Newspaper },
];
const enquiryStatuses: Enquiry['status'][] = ['New', 'In progress', 'Resolved'];
const blankRecord = (type: ContentRecord['type']): ContentRecord => ({ id: '', type, title: '', titleTh: '', description: '', descriptionTh: '', image: '', category: '', status: 'Published', revision: 0 });
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
const corePage = (record: ContentRecord) => record.type === 'Page' && (corePageIds as readonly string[]).includes(record.id);
const MAX_ATTEMPTS = 3;
const fieldNames: Record<string, string> = { caption: 'English image caption', captionTh: 'Thai image caption', parentId: 'Parent page', order: 'Display order', eyebrow: 'English eyebrow', eyebrowTh: 'Thai eyebrow', icon: 'Icon', mobileImage: 'Mobile image', gallery: 'Gallery images', bodyHeading: 'English content heading', bodyHeadingTh: 'Thai content heading', origin: 'Origin port', destination: 'Destination port', waypoints: 'Route coordinates', id: 'URL identifier', type: 'Content type', title: 'English title', titleTh: 'Thai title', description: 'English summary', descriptionTh: 'Thai summary', image: 'Content image', category: 'English category', categoryTh: 'Thai category', status: 'Status', body: 'English content', bodyTh: 'Thai content', date: 'Publication date', imageAlt: 'English image description', imageAltTh: 'Thai image description', companyName: 'English company name', companyNameTh: 'Thai company name', officeAddress: 'English office address', officeAddressTh: 'Thai office address', phone: 'Public phone number', email: 'Public email address', mapUrl: 'Map link' };
const specFieldNames: Record<string, string> = { imo: 'IMO number', yearBuilt: 'Year built', lengthM: 'Length overall', beamM: 'Beam', draftM: 'Vessel draft', deadweightT: 'Deadweight', capacityTeu: 'Container capacity', flag: 'English flag state', flagTh: 'Thai flag state', availability: 'English availability', availabilityTh: 'Thai availability' };
const validationMessages = (issues: { path: PropertyKey[]; message: string }[]) => issues.map(issue => `${issue.path[0] === 'vesselSpecs' ? specFieldNames[String(issue.path[1])] || 'Vessel specifications' : fieldNames[String(issue.path[0])] || 'Content'}: ${issue.message}`).join(' ');
const notificationLabels = { not_configured: 'Email not configured', pending: 'Email pending', sending: 'Sending email', sent: 'Email accepted', failed: 'Email failed', review: 'Email needs review' };

function Modal({ open, onClose, title, children, busy = false, compact = false, actions }: { open: boolean; onClose: () => void; title: string; children: ReactNode; busy?: boolean; compact?: boolean; actions?: ReactNode }) {
  const { t } = useCmsLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backdropPointerRef = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden'; closeRef.current?.focus();
    return () => { if (dialog.open) dialog.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return <dialog ref={ref} aria-label={t(title)} className={`${styles.dialog} ${compact ? styles.confirmDialog : ''} ${actions ? styles.actionDialog : ''}`} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onPointerDown={event => { backdropPointerRef.current = event.target === event.currentTarget; }} onClick={event => { if (!busy && event.target === event.currentTarget && backdropPointerRef.current) onClose(); backdropPointerRef.current = false; }}>
    {open && <div className={styles.dialogBody}><div className={styles.dialogHeading}><h2>{t(title)}</h2><div className={styles.dialogHeadingControls}><CmsLanguageSwitch compact /><button ref={closeRef} type="button" className={styles.iconButton} aria-label={t("Close {title}", { title: t(title) })} disabled={busy} onClick={onClose}><X size={22} /></button></div></div>{actions ? <><div className={styles.dialogScroll} tabIndex={0} role="region" aria-label={t("{title} fields", { title: t(title) })}>{children}</div><div className={styles.dialogActions}>{actions}</div></> : children}</div>}
  </dialog>;
}
function NavigationDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { t } = useCmsLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const backdropPointerRef = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (open) {
      if (!dialog.open) {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.dataset.phase = 'closed';
        dialog.showModal();
      }
      closeRef.current?.focus({ preventScroll: true });
      if (reduceMotion) {
        dialog.dataset.phase = 'open';
        return;
      }
      let enterFrame = 0;
      const paintFrame = window.requestAnimationFrame(() => {
        enterFrame = window.requestAnimationFrame(() => { dialog.dataset.phase = 'open'; });
      });
      return () => {
        window.cancelAnimationFrame(paintFrame);
        window.cancelAnimationFrame(enterFrame);
      };
    }

    if (!dialog.open) return;
    const wasOpen = dialog.dataset.phase === 'open';
    dialog.dataset.phase = 'closed';
    const finish = () => {
      if (!dialog.open) return;
      dialog.close();
      if (!document.querySelector('dialog[open]') && previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
    };
    if (reduceMotion || !wasOpen) {
      finish();
      return;
    }
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === dialog && event.propertyName === 'transform') finish();
    };
    dialog.addEventListener('transitionend', onTransitionEnd);
    const fallback = window.setTimeout(finish, 400);
    return () => {
      dialog.removeEventListener('transitionend', onTransitionEnd);
      window.clearTimeout(fallback);
    };
  }, [open]);

  useEffect(() => () => {
    const dialog = ref.current;
    if (!dialog?.open) return;
    dialog.close();
    if (!document.querySelector('dialog[open]') && previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
  }, []);

  return <dialog ref={ref} className={`${styles.dialog} ${styles.drawer}`} data-phase="closed" aria-label={t("CMS navigation")} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); onClose(); }} onPointerDown={event => { backdropPointerRef.current = event.target === event.currentTarget; }} onClick={event => { if (event.target === event.currentTarget && backdropPointerRef.current) onClose(); backdropPointerRef.current = false; }}>
    <div className={styles.dialogBody}><div className={styles.dialogHeading}><h2>{t("CMS navigation")}</h2><div className={styles.dialogHeadingControls}><CmsLanguageSwitch compact /><button ref={closeRef} type="button" className={styles.iconButton} aria-label={t("Close CMS navigation")} onClick={onClose}><X size={22} /></button></div></div>{children}</div>
  </dialog>;
}
function Brand() { const { t, locale } = useCmsLocale(); return <Link href={href(locale)} target="_blank" rel="noopener noreferrer" className={styles.logo} aria-label={t("MOE Navigation home in a new tab")}><span className={styles.brandMark}><BrandMark /></span><span className={styles.logoText}><strong>MOE</strong><span>NAVIGATION</span></span></Link>; }
async function stageImage(image: PreparedImage, submissionId: string): Promise<MediaItem> {
  const data = new FormData(); data.append('file', image.blob, image.filename); data.append('submissionId', submissionId);
  return (await cmsRequest<{ media: MediaItem }>('/api/cms/media', { method: 'POST', body: data })).media;
}

export default function CmsDemo() {
  const { t, locale } = useCmsLocale();
  const dateLocale = locale === 'th' ? 'th-TH' : 'en-GB';
  const formatDate = (value?: string) => value ? new Date(value).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const recordTitle = (record: { title: string; titleTh?: string }) => locale === 'th' ? record.titleTh || record.title : record.title || record.titleTh || '';
  const localizedPageLabel = (page: ContentRecord) => (corePageIds as readonly string[]).includes(page.id) ? t(cmsPageLabel(page)) : recordTitle(page);
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const workspaceLoad = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState('');
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [uploadedMedia, setUploadedMedia] = useState<MediaItem[]>([]);
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [websiteDetails, setWebsiteDetails] = useState<{ saved: SiteSettings; draft: SiteSettings } | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');
  const [section, setSection] = useState<Section>('content');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const workspaceSearchRef = useRef<HTMLInputElement>(null);
  const [pageFilter, setPageFilter] = useState('All');
  const [limit, setLimit] = useState(12);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [confirmation, setConfirmation] = useState<{ message: string; action: string; params?: Record<string, string | number> } | null>(null);
  const confirmationResolver = useRef<((accepted: boolean) => void) | null>(null);
  const [editing, setEditing] = useState<ContentRecord | null>(null);
  const [original, setOriginal] = useState<ContentRecord | null>(null);
  const [editorError, setEditorError] = useState('');
  const editorErrorRef = useRef<HTMLDivElement>(null);
  const [editorConflict, setEditorConflict] = useState(false);
  const [editorAttempts, setEditorAttempts] = useState(0);
  const [editorImages, setEditorImages] = useState<Record<string, PreparedImage>>({});
  const imagesRef = useRef<Record<string, PreparedImage>>({});
  const [routeText, setRouteText] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<ContentRecord | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaSearch, setMediaSearch] = useState('');
  const mediaSearchRef = useRef<HTMLInputElement>(null);
  const [mediaError, setMediaError] = useState('');
  const [mediaNotice, setMediaNotice] = useState('');
  const [preparedMedia, setPreparedMedia] = useState<PreparedImage | null>(null);
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaPreparing, setMediaPreparing] = useState(false);
  const [mediaAttempts, setMediaAttempts] = useState(0);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [enquiryError, setEnquiryError] = useState('');
  const [enquiryNotice, setEnquiryNotice] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importSnapshot, setImportSnapshot] = useState<LegacySnapshot | null>(null);
  const [importRecords, setImportRecords] = useState<DemoRecord[]>([]);
  const [verifiedLocal, setVerifiedLocal] = useState<string[]>([]);
  const [verifiedLocalMedia, setVerifiedLocalMedia] = useState(0);
  const [localArchive, setLocalArchive] = useState(false);
  const legacyPrepared = useRef(new Map<string, PreparedImage>());
  const [importError, setImportError] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const editorSubmission = useRef(''); const mediaSubmission = useRef('');
  const attemptedEditor = useRef(''); const attemptedMedia = useRef(''); const reviewedLegacy = useRef<DemoRecord | null>(null);
  const editorStaged = useRef(new Map<string, MediaItem>()); const libraryStaged = useRef<MediaItem | null>(null);
  const uploadVersion = useRef(0); const mediaVersion = useRef(0);
  const importSubmissions = useRef(new Map<string, { id: string; staged?: MediaItem; attempts: number }>());
  const inboxStatus: InboxStatus = section === 'inbox' && enquiryStatuses.includes(status as Enquiry['status']) ? status as Enquiry['status'] : 'All';
  const inbox = useCmsInbox(Boolean(user), section === 'inbox' ? search : '', inboxStatus);
  const { refresh: refreshInbox } = inbox;
  const media = uploadedMedia;
  const filteredMedia = media.filter(item => item.title.toLocaleLowerCase().includes(mediaSearch.trim().toLocaleLowerCase()));
  const editorDirty = Boolean(editing && (recordImageUrls(editing).some(url => Boolean(editorImages[url])) || routeText !== (original?.waypoints || []).map(point => point.join(', ')).join('\n') || JSON.stringify(editing) !== JSON.stringify(original || blankRecord(editing.type))));
  const settingsDirty = Boolean(websiteDetails && JSON.stringify(websiteDetails.saved) !== JSON.stringify(websiteDetails.draft));
  const publishedPreview = original ? publishedContentUrl(original, records, 'th') : null;
  function confirmAction(message: string, action: string, params?: Record<string, string | number>) {
    confirmationResolver.current?.(false);
    setConfirmation({ message, action, params });
    return new Promise<boolean>(resolve => { confirmationResolver.current = resolve; });
  }
  function settleConfirmation(accepted: boolean) {
    const resolve = confirmationResolver.current; confirmationResolver.current = null; setConfirmation(null); resolve?.(accepted);
  }
  useEffect(() => () => { confirmationResolver.current?.(false); }, []);
  useEffect(() => {
    if (!editorError) return;
    editorErrorRef.current?.scrollIntoView({ block: 'nearest' });
    editorErrorRef.current?.focus({ preventScroll: true });
  }, [editorError]);

  const load = useCallback(async () => {
    refreshInbox();
    workspaceLoad.current?.abort();
    const controller = new AbortController(); workspaceLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]);
    setLoading(true);
    const results = await Promise.allSettled([cmsRequest<{ records: ContentRecord[] }>('/api/cms/content', { signal }), cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>('/api/cms/media', { signal }), cmsRequest<{ settings: SiteSettings }>('/api/cms/settings', { signal })]);
    if (controller.signal.aborted) return;
    if (results[0].status === 'fulfilled') setRecords(results[0].value.records);
    if (results[1].status === 'fulfilled') { setUploadedMedia(results[1].value.media); setMediaCursor(results[1].value.nextCursor); }
    if (results[2].status === 'fulfilled') { const settings = results[2].value.settings; setWebsiteDetails(current => refreshWebsiteDetailsDraft(current, settings)); }
    const failed = results.find(result => result.status === 'rejected'); setError(failed?.status === 'rejected' ? cmsErrorText(failed.reason) : ''); setWorkspaceReady(true); setLoading(false); workspaceLoad.current = null;
  }, [refreshInbox]);
  function invalidateWorkspaceRefresh() { workspaceLoad.current?.abort(); workspaceLoad.current = null; setLoading(false); }
  useEffect(() => {
    let cancelled = false;
    cmsRequest<{ user: User | null }>('/api/cms/session').then(result => { if (!cancelled) { setUser(result.user); if (result.user) void load(); } }).catch(cause => { if (!cancelled) setLoginError(cmsErrorText(cause)); }).finally(() => { if (!cancelled) setSessionReady(true); });
    function expired() { invalidateWorkspaceRefresh(); refreshInbox(); setUser(null); setLoginError('Your session has expired. Sign in again to continue. Your open editor is preserved.'); }
    window.addEventListener('moe-cms-session-expired', expired);
    return () => { cancelled = true; workspaceLoad.current?.abort(); window.removeEventListener('moe-cms-session-expired', expired); };
  }, [load, refreshInbox]);
  useEffect(() => {
    if (!editorDirty && !preparedMedia && !settingsDirty && !preparing && !mediaPreparing && !busy) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [editorDirty, preparedMedia, settingsDirty, preparing, mediaPreparing, busy]);
  useEffect(() => () => { Object.values(imagesRef.current).forEach(image => URL.revokeObjectURL(image.preview)); legacyPrepared.current.forEach(image => URL.revokeObjectURL(image.preview)); }, []);
  function resetEditorImages() { Object.values(imagesRef.current).forEach(image => URL.revokeObjectURL(image.preview)); imagesRef.current = {}; setEditorImages({}); }
  useEffect(() => () => { if (preparedMedia) URL.revokeObjectURL(preparedMedia.preview); }, [preparedMedia]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields = new FormData(event.currentTarget); setBusy('login'); setLoginError('');
    try { const result = await cmsRequest<{ user: User }>('/api/cms/login', { method: 'POST', body: JSON.stringify({ username: fields.get('username'), password: fields.get('password') }) }); setUser(result.user); await load(); window.scrollTo({ top: 0, behavior: 'instant' }); }
    catch (cause) { setLoginError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function logout() {
    if (busy || ((editorDirty || preparedMedia || settingsDirty || preparing || mediaPreparing) && !await confirmAction('Your unsaved editor changes, prepared images and website details will be discarded. Saved content stays available.', 'Sign out & discard'))) return;
    setBusy('logout');
    try {
      if (attemptedEditor.current && await reconcileEditor() === 'pending') return;
      if (attemptedMedia.current && await reconcileMedia() === 'pending') return;
      await cmsRequest('/api/cms/logout', { method: 'POST', body: '{}' });
      invalidateWorkspaceRefresh();
      uploadVersion.current++; mediaVersion.current++;
      setPreparing(false); setMediaPreparing(false); setUser(null); setWorkspaceReady(false); setDrawerOpen(false); setEditing(null); setOriginal(null);
      resetEditorImages(); setPreparedMedia(null); setMediaOpen(false); setSelectedEnquiry(null); setImportOpen(false); setDeleteRecord(null);
      setWebsiteDetails(null); setSettingsError(''); setSettingsNotice(''); setRecords([]); refreshInbox(); setUploadedMedia([]); setMediaCursor(null);
      setNotice(''); setError(''); setLoginError(''); setSection('content'); setType('All'); setStatus('All'); setSearch(''); setPageFilter('All'); setLimit(12);
    }
    catch (cause) { setError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  function clearFilters() { setType('All'); setStatus('All'); setSearch(''); setPageFilter('All'); setLimit(12); workspaceSearchRef.current?.focus({ preventScroll: true }); }
  function openMedia() { setMediaSearch(''); setMediaOpen(true); }
  function navigate(next: Section, nextType = 'All') { setSection(next); setType(nextType); setStatus('All'); setSearch(''); setPageFilter('All'); setLimit(12); setDrawerOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function openEditor(record?: ContentRecord) {
    const draft = blankRecord(type === 'All' ? 'News' : type as ContentRecord['type']); if (draft.type === 'Section' && pageFilter !== 'All') draft.parentId = pageFilter; setOriginal(record || null); setEditing(record ? { ...record } : draft); resetEditorImages(); setRouteText((record?.waypoints || []).map(point => point.join(', ')).join('\n')); setEditorError(''); setEditorConflict(false); setEditorAttempts(0); editorSubmission.current = crypto.randomUUID(); editorStaged.current.clear(); attemptedEditor.current = ''; reviewedLegacy.current = null;
  }
  function updateEditor(patch: Partial<ContentRecord>) {
    setEditing(current => current ? { ...current, ...patch, ...(patch.title !== undefined && !original && (!current.id || current.id === slug(current.title)) ? { id: slug(patch.title) } : {}) } : current);
  }
  async function changeEditorType(nextType: ContentRecord['type']) {
    if (!editing || original || busy || preparing || editing.type === nextType) return;
    const next = changeEditorContentType(editing, nextType, routeText);
    if (next.discardedFields.length && !await confirmAction('Changing to {type} removes the {fields} from this unsaved item. Your titles, summaries and images stay in place.', 'Change content type', { type: nextType, fields: next.discardedFields.join(' and ') })) return;
    setEditing(next.record);
    if (nextType !== 'Route') setRouteText('');
    setEditorError('');
  }
  function acceptRecord(record: ContentRecord) { invalidateWorkspaceRefresh(); setRecords(current => [record, ...current.filter(item => demoRecordKey(item) !== demoRecordKey(record))]); }
  async function finishEditor(record: ContentRecord) {
    acceptRecord(record);
    if (reviewedLegacy.current) { try { await rememberLegacyRecord(reviewedLegacy.current, record); } catch { setImportError('Content saved, but the local migration receipt could not be stored. Keep or export your local copy.'); } }
    setNotice('“' + record.title + '” saved and published.'); setEditing(null); resetEditorImages(); attemptedEditor.current = ''; editorStaged.current.clear(); navigate('content', record.type); if (record.type === 'Section' && record.parentId) setPageFilter(record.parentId);
    void cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>('/api/cms/media').then(result => { setUploadedMedia(result.media); setMediaCursor(result.nextCursor); }).catch(() => {});
  }
  async function reconcileEditor(allowRetry = true): Promise<'committed' | 'aborted' | 'pending'> {
    if (!attemptedEditor.current) { if (allowRetry) setEditorAttempts(0); return 'aborted'; }
    setBusy('Checking saved content…');
    const result = await resolveSubmission(editorSubmission.current);
    if (result.status === 'committed' && result.record) {
      let currentFingerprint = ''; try { currentFingerprint = JSON.stringify(editing ? { ...editing, status: 'Published', ...(editing.type === 'Route' ? { waypoints: parseRouteCoordinates(routeText) } : {}) } : null); } catch { /* Keep partially edited coordinate text. */ }
      if (editing && currentFingerprint !== attemptedEditor.current) { acceptRecord(result.record); setOriginal(result.record); setEditing(current => current ? { ...current, revision: result.record!.revision } : current); editorSubmission.current = crypto.randomUUID(); editorStaged.current.clear(); attemptedEditor.current = ''; setEditorAttempts(0); setEditorConflict(false); setEditorError('Your earlier save succeeded. Your newer unsaved changes are still in this editor; review and save them when ready.'); return 'aborted'; }
      await finishEditor(result.record); return 'committed';
    }
    if (result.status === 'pending' || result.pending) { setEditorAttempts(MAX_ATTEMPTS); setEditorError('The previous save is still being checked. Your fields and prepared images are preserved. Choose Check saved content again before retrying.'); return 'pending'; }
    if (result.status !== 'aborted') throw new Error('The previous save could not yet be closed safely. Check saved content again.');
    editorStaged.current.clear(); editorSubmission.current = crypto.randomUUID(); attemptedEditor.current = ''; if (allowRetry) setEditorAttempts(0);
    setEditorError('The previous submission did not save. Its unreferenced uploads were removed. Your input is preserved; retry to upload the prepared images again.' + (result.failed ? ' Some unused uploads need manual Cleanup later.' : ''));
    return 'aborted';
  }
  async function closeEditor() {
    if (busy || ((editorDirty || preparing) && !await confirmAction('Your unsaved fields and prepared images will be discarded. Any interrupted save will be checked first.', 'Discard changes'))) return;
    setBusy('Checking unfinished save…');
    try { if (attemptedEditor.current && await reconcileEditor() === 'pending') return; uploadVersion.current++; setPreparing(false); setEditing(null); resetEditorImages(); }
    catch (cause) { setEditorError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || preparing || busy || editorAttempts >= MAX_ATTEMPTS) return;
    let candidate: ContentRecord;
    try { candidate = { ...editing, status: 'Published', ...(editing.type === 'Route' ? { waypoints: parseRouteCoordinates(routeText) } : {}) }; } catch (cause) { setEditorError(cmsErrorText(cause)); return; }
    const validated = recordSchema.safeParse(mapRecordImages(candidate, url => editorImages[url] ? 'prepared-image' : url));
    if (!validated.success) { setEditorError(validationMessages(validated.error.issues)); return; }
    setBusy('Saving content…'); setEditorError('');
    try {
      const fingerprint = JSON.stringify(candidate); let expectedRevision = original?.revision ?? null;
      if (attemptedEditor.current && attemptedEditor.current !== fingerprint) {
        const result = await resolveSubmission(editorSubmission.current);
        if (result.status === 'pending' || result.pending) { setEditorAttempts(MAX_ATTEMPTS); throw new Error('Your earlier save is still pending. Check saved content before saving these changes.'); }
        if (result.status === 'committed' && result.record) { acceptRecord(result.record); setOriginal(result.record); expectedRevision = result.record.revision; }
        else if (result.status !== 'aborted') throw new Error('The earlier submission could not be closed. Check saved content before trying again.');
        editorSubmission.current = crypto.randomUUID(); editorStaged.current.clear(); setEditorAttempts(0);
      }
      attemptedEditor.current = fingerprint;
      const urls = recordImageUrls(candidate).filter(url => editorImages[url]);
      for (let index = 0; index < urls.length; index++) { const url = urls[index]; setBusy('Uploading image ' + (index + 1) + ' of ' + urls.length + '…'); if (!editorStaged.current.has(url)) editorStaged.current.set(url, await stageImage(editorImages[url], editorSubmission.current)); }
      const prepared = mapRecordImages({ ...validated.data, image: candidate.image, mobileImage: candidate.mobileImage, gallery: candidate.gallery }, url => editorStaged.current.get(url)?.url || url);
      setBusy('Saving content…');
      const result = await cmsRequest<{ record: ContentRecord }>('/api/cms/content', { method: 'POST', body: JSON.stringify({ record: prepared, expectedRevision, submissionId: editorSubmission.current }) });
      await finishEditor(result.record);
    } catch (cause) {
      setEditorError(cmsErrorText(cause)); setEditorConflict(cause instanceof CmsRequestError && cause.status === 409);
      if (!(cause instanceof CmsRequestError) || cause.status === 0 || cause.status >= 500) { const attempts = editorAttempts + 1; setEditorAttempts(attempts); if (attempts >= MAX_ATTEMPTS) { try { await reconcileEditor(false); } catch (recoveryError) { setEditorError(cmsErrorText(recoveryError) + ' The save outcome is uncertain. Keep this editor open and check saved content.'); } } }
    } finally { setBusy(''); }
  }
  async function recoverEditor() {
    if (!editing || busy) return;
    if (editorConflict && !await confirmAction('Loading the latest saved version replaces your unsaved fields. Cancel and download your unsaved text first if you need a copy.', 'Load saved version')) return;
    setBusy('Checking saved content…');
    try {
      const outcome = await reconcileEditor(); if (outcome !== 'aborted' || !editorConflict) return;
      const result = await cmsRequest<{ records: ContentRecord[] }>('/api/cms/content'); setRecords(result.records); const saved = result.records.find(item => demoRecordKey(item) === demoRecordKey(editing));
      if (!saved || saved.deletedAt) throw new Error('This record is no longer available. Your unsaved changes are still here.'); openEditor(saved);
    } catch (cause) { setEditorError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  function downloadDraft() {
    if (!editing) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(createEditorDraftExport(editing, routeText), null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `unsaved-${editing.id || 'content'}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  async function changeRecord(record: ContentRecord, action: 'trash' | 'restore') {
    if (busy) return; setBusy(action); setError('');
    try { const result = await cmsRequest<{ record: ContentRecord }>('/api/cms/content/action', { method: 'POST', body: JSON.stringify({ id: record.id, type: record.type, expectedRevision: record.revision, action }) }); acceptRecord(result.record); setDeleteRecord(null); setNotice(`“${record.title}” ${action === 'trash' ? 'moved to Trash. You can restore it within 30 days.' : 'restored.'}`); }
    catch (cause) { setError(cmsErrorText(cause)); setDeleteRecord(null); } finally { setBusy(''); }
  }
  async function chooseEditorImage(file: File, target: ImageTarget = 'image') {
    const version = ++uploadVersion.current; setPreparing(true); setEditorError('');
    try { const image = await prepareCmsImage(file); if (version !== uploadVersion.current) { URL.revokeObjectURL(image.preview); return; } imagesRef.current = { ...imagesRef.current, [image.preview]: image }; setEditorImages(imagesRef.current); setEditing(current => !current ? current : typeof target === 'number' ? { ...current, gallery: current.gallery?.map((entry, index) => index === target ? { ...entry, url: image.preview } : entry) } : { ...current, [target]: image.preview }); }
    catch (cause) { if (version === uploadVersion.current) setEditorError(cmsErrorText(cause)); } finally { if (version === uploadVersion.current) setPreparing(false); }
  }
  function finishMedia(items: MediaItem[]) { invalidateWorkspaceRefresh(); setUploadedMedia(current => [...items, ...current.filter(item => !items.some(saved => saved.id === item.id))]); setPreparedMedia(null); attemptedMedia.current = ''; libraryStaged.current = null; setMediaNotice('Image saved to the library. It is ready to use in your content.'); }
  async function reconcileMedia(allowRetry = true): Promise<'committed' | 'aborted' | 'pending'> {
    if (!attemptedMedia.current) { if (allowRetry) setMediaAttempts(0); return 'aborted'; }
    setBusy('Checking saved media…'); const result = await resolveSubmission(mediaSubmission.current);
    if (result.status === 'committed') { if (!result.media?.length) throw new Error('The saved image could not be identified. Refresh the library before retrying.'); finishMedia(result.media); return 'committed'; }
    if (result.status === 'pending' || result.pending) { setMediaAttempts(MAX_ATTEMPTS); setMediaError('The previous upload is still being checked. Your prepared image is preserved. Check saved media again before retrying.'); return 'pending'; }
    if (result.status !== 'aborted') throw new Error('The previous upload could not yet be closed safely. Check saved media again.');
    libraryStaged.current = null; mediaSubmission.current = crypto.randomUUID(); attemptedMedia.current = ''; if (allowRetry) setMediaAttempts(0);
    setMediaError('The image did not save. Its unreferenced upload was removed. Retry to upload the prepared image again.' + (result.failed ? ' Manual Cleanup may be needed for an unfinished deletion.' : '')); return 'aborted';
  }
  async function chooseLibraryImage(file?: File) {
    if (!file || busy) return; const version = ++mediaVersion.current; setMediaPreparing(true); setMediaError(''); setMediaNotice('');
    try {
      if (attemptedMedia.current) { setBusy('Checking previous upload…'); if (await reconcileMedia() === 'pending') return; }
      const image = await prepareCmsImage(file); if (version !== mediaVersion.current) { URL.revokeObjectURL(image.preview); return; } setPreparedMedia(image); setMediaTitle(file.name.replace(/\.[^.]+$/, '')); libraryStaged.current = null; mediaSubmission.current = crypto.randomUUID(); setMediaAttempts(0);
    } catch (cause) { if (version === mediaVersion.current) setMediaError(cmsErrorText(cause)); } finally { if (version === mediaVersion.current) setMediaPreparing(false); setBusy(''); }
  }
  async function saveMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!preparedMedia || mediaPreparing || busy || mediaAttempts >= MAX_ATTEMPTS) return; setBusy('Uploading image…'); setMediaError('');
    try {
      const fingerprint = preparedMedia.preview + mediaTitle.trim();
      if (attemptedMedia.current && attemptedMedia.current !== fingerprint && await reconcileMedia() !== 'aborted') return;
      attemptedMedia.current = fingerprint;
      if (!libraryStaged.current) libraryStaged.current = await stageImage(preparedMedia, mediaSubmission.current);
      setBusy('Saving media…'); const result = await cmsRequest<{ media: MediaItem }>('/api/cms/media/commit', { method: 'POST', body: JSON.stringify({ mediaId: libraryStaged.current.id, submissionId: mediaSubmission.current, title: mediaTitle.trim() }) }); finishMedia([result.media]);
    } catch (cause) { setMediaError(cmsErrorText(cause)); if (!(cause instanceof CmsRequestError) || cause.status === 0 || cause.status >= 500) { const attempts = mediaAttempts + 1; setMediaAttempts(attempts); if (attempts >= MAX_ATTEMPTS) { try { await reconcileMedia(false); } catch (recoveryError) { setMediaError(cmsErrorText(recoveryError) + ' The upload outcome is uncertain. Check saved media before retrying.'); } } } } finally { setBusy(''); }
  }
  async function recoverMedia() { if (busy) return; setBusy('Checking saved media…'); try { await reconcileMedia(); } catch (cause) { setMediaError(cmsErrorText(cause)); } finally { setBusy(''); } }
  async function closeMedia() {
    if (busy || ((preparedMedia || mediaPreparing) && !await confirmAction('This prepared image has not been saved. Any interrupted upload will be checked before closing.', 'Discard image'))) return; setBusy('Checking unfinished upload…');
    try { if (attemptedMedia.current && await reconcileMedia() === 'pending') return; mediaVersion.current++; setMediaPreparing(false); setPreparedMedia(null); setMediaOpen(false); }
    catch (cause) { setMediaError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function cleanupMedia() {
    if (busy || !await confirmAction('Remove unfinished, unreferenced uploads? Images used by content or saved in the library will be preserved.', 'Clean unfinished uploads')) return;
    setBusy('Cleaning unfinished uploads…'); setMediaError('');
    try { const result = await cmsRequest<{ deleted: number; failed: number }>('/api/cms/media/cleanup', { method: 'POST', body: '{}' }); setMediaNotice(`${result.deleted} unfinished upload${result.deleted === 1 ? '' : 's'} removed.${result.failed ? ` ${result.failed} could not be removed; try cleanup again later.` : ''}`); }
    catch (cause) { setMediaError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function loadMoreMedia() {
    if (!mediaCursor || busy) return; setBusy('Loading more images…'); setMediaError('');
    try { const result = await cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>(`/api/cms/media?cursor=${encodeURIComponent(mediaCursor)}`); setUploadedMedia(current => [...current, ...result.media.filter(item => !current.some(existing => existing.id === item.id))]); setMediaCursor(result.nextCursor); }
    catch (cause) { setMediaError(cmsErrorText(cause)); setEditorError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function removeMedia(item: { id: string; title: string }) {
    if (busy || !await confirmAction(`Remove “${item.title}” from the library? Images used by content or Trash cannot be removed.`, 'Delete image from library')) return;
    setBusy('Removing image…'); setMediaError('');
    try { await cmsRequest('/api/cms/media/remove', { method: 'POST', body: JSON.stringify({ mediaId: item.id }) }); invalidateWorkspaceRefresh(); setUploadedMedia(current => current.filter(image => image.id !== item.id)); setMediaNotice('Image removed from the library.'); }
    catch (cause) { setMediaError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function changeEnquiry(enquiry: Enquiry, nextStatus: Enquiry['status']) {
    if (busy) return; setBusy('Updating enquiry…'); setEnquiryError(''); setEnquiryNotice('');
    try { const result = await cmsRequest<{ enquiry: Enquiry }>('/api/cms/inbox', { method: 'PATCH', body: JSON.stringify({ id: enquiry.id, expectedRevision: enquiry.revision, status: nextStatus }) }); acceptEnquiry(result.enquiry); setNotice('Enquiry status updated.'); }
    catch (cause) { setEnquiryError(cmsErrorText(cause) + (cause instanceof CmsRequestError && cause.status === 409 ? ' Refresh this enquiry to load its latest status before trying again.' : '')); } finally { setBusy(''); }
  }
  function acceptEnquiry(enquiry: Enquiry) {
    refreshInbox();
    setSelectedEnquiry(current => current?.id === enquiry.id ? enquiry : current);
  }
  async function refreshEnquiry(enquiry: Enquiry) {
    if (busy) return; setBusy('Refreshing enquiry…'); setEnquiryError(''); setEnquiryNotice('');
    try {
      const result = await cmsRequest<{ enquiry: Enquiry }>(`/api/cms/inbox?id=${encodeURIComponent(enquiry.id)}`);
      acceptEnquiry(result.enquiry);
      setEnquiryNotice('Showing the latest saved status and email delivery details.');
    } catch (cause) { setEnquiryError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function retryNotification(enquiry: Enquiry) {
    if (busy) return; setBusy('Sending notification…'); setEnquiryError(''); setEnquiryNotice('');
    try {
      const result = await cmsRequest<{ enquiry: Enquiry }>('/api/cms/inbox/notify', { method: 'POST', body: JSON.stringify({ id: enquiry.id }) });
      acceptEnquiry(result.enquiry);
    } catch (cause) { setEnquiryError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget; const fields = new FormData(form);
    if (fields.get('newPassword') !== fields.get('confirmPassword')) { setError('The new passwords do not match.'); return; }
    setBusy('Updating password…'); setError('');
    try { await cmsRequest('/api/cms/password', { method: 'POST', body: JSON.stringify({ currentPassword: fields.get('currentPassword'), newPassword: fields.get('newPassword') }) }); form.reset(); setNotice('Your password has been updated.'); }
    catch (cause) { setError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function saveWebsiteDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!websiteDetails || busy) return;
    const validated = siteSettingsSchema.safeParse(websiteDetails.draft);
    if (!validated.success) { setSettingsError(validationMessages(validated.error.issues)); return; }
    setBusy('Saving website details…'); setSettingsError(''); setSettingsNotice('');
    try { const result = await cmsRequest<{ settings: SiteSettings }>('/api/cms/settings', { method: 'PUT', body: JSON.stringify({ settings: validated.data, expectedRevision: websiteDetails.saved.revision }) }); invalidateWorkspaceRefresh(); setWebsiteDetails({ saved: result.settings, draft: result.settings }); setSettingsNotice('Website details saved. They are now available on the public contact page.'); }
    catch (cause) { setSettingsError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function refreshWebsiteDetails() {
    if (busy || (settingsDirty && !await confirmAction('Your unsaved website details will be replaced with the latest saved version.', 'Load saved details'))) return;
    setBusy('Loading website details…'); setSettingsError('');
    try { const result = await cmsRequest<{ settings: SiteSettings }>('/api/cms/settings'); invalidateWorkspaceRefresh(); setWebsiteDetails({ saved: result.settings, draft: result.settings }); }
    catch (cause) { setSettingsError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  function updateWebsiteDetails(key: keyof SiteSettings, value: string) { setWebsiteDetails(current => current ? { ...current, draft: { ...current.draft, [key]: value } } : current); setSettingsNotice(''); }
  async function allRemoteMedia() {
    const result: MediaItem[] = []; let cursor: string | null = null;
    do { const page: { media: MediaItem[]; nextCursor: string | null } = await cmsRequest('/api/cms/media' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')); result.push(...page.media); cursor = page.nextCursor; } while (cursor);
    invalidateWorkspaceRefresh(); setUploadedMedia(result); setMediaCursor(null); return result;
  }
  async function inspectLegacy(snapshot: LegacySnapshot, remote: ContentRecord[], library: MediaItem[]) {
    const verified: string[] = [];
    for (const local of snapshot.records) if (await legacyRecordMatches(local, remote.find(record => demoRecordKey(record) === demoRecordKey(local)), library, snapshot)) verified.push(demoRecordKey(local));
    let verifiedMedia = 0; for (const local of snapshot.media) if (await legacyMediaMatches(local, library, snapshot)) verifiedMedia++;
    setLocalArchive(hasLegacyArchive()); setImportSnapshot(snapshot); setImportRecords(snapshot.records); setVerifiedLocal(verified); setVerifiedLocalMedia(verifiedMedia);
  }
  async function previewImport() {
    if (busy) return; setImportError(''); setImportProgress(''); setImportOpen(true); setDrawerOpen(false); setBusy('Checking local data…');
    try {
      const snapshot = readLegacySnapshot(); const remote = await cmsRequest<{ records: ContentRecord[] }>('/api/cms/content'); const library = await allRemoteMedia(); setRecords(remote.records); await inspectLegacy(snapshot, remote.records, library);
      const localImages = [...new Set([...snapshot.records.flatMap(record => recordImageUrls(record)), ...snapshot.media.map(item => item.image)])];
      for (const url of localImages) if (url.startsWith('data:') && !legacyPrepared.current.has(url)) {
        if ((await legacyImageUrl(url, library, snapshot)).startsWith('data:')) { setImportProgress('Preparing local images on this device…'); const blob = await (await fetch(url)).blob(); legacyPrepared.current.set(url, await prepareCmsImage(new File([blob], 'legacy-image.webp', { type: blob.type }))); }
      }
      setImportProgress('Local review is ready. No data has been uploaded or removed.');
    } catch (cause) { setImportError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  const newImports = importRecords.filter(record => !record.deletedAt && !records.some(remote => demoRecordKey(remote) === demoRecordKey(record)));
  const changedImports = importRecords.filter(record => !verifiedLocal.includes(demoRecordKey(record)) && (Boolean(record.deletedAt) || records.some(remote => demoRecordKey(remote) === demoRecordKey(record))));
  async function reviewLocal(record: DemoRecord) {
    if (busy || !importSnapshot) return; const saved = records.find(remote => demoRecordKey(remote) === demoRecordKey(record));
    if (saved?.deletedAt) { setImportError('This record is in server Trash. Restore it there before reviewing the local version.'); return; }
    if (record.deletedAt && !await confirmAction('Review this local Trash item? It stays unchanged until you explicitly Save, which publishes the reviewed content.', 'Review content')) return;
    setBusy('Preparing local content…'); setImportError('');
    try {
      const currentSnapshot = readLegacySnapshot(); for (const localImage of currentSnapshot.media) { if (recordImageUrls(record).includes(localImage.image) && !await legacyMediaMatches(localImage, media, currentSnapshot)) throw new Error('Import the local library images first, then review this version. The same saved image will be reused.'); }
      const translated = await translateLegacyRecord(record, media, currentSnapshot);
      openEditor(saved); const prepared: Record<string, PreparedImage> = {};
      const candidate = mapRecordImages({ ...saved, ...translated, revision: saved?.revision || 0, deletedAt: undefined, status: saved && corePage(saved) ? 'Published' : record.deletedAt ? 'Draft' : record.status } as ContentRecord, url => { const image = legacyPrepared.current.get(url); if (image) { prepared[image.preview] = image; legacyPrepared.current.delete(url); return image.preview; } return url; });
      imagesRef.current = prepared; setEditorImages(prepared); setEditing(candidate); setRouteText((candidate.waypoints || []).map(point => point.join(', ')).join('\n')); reviewedLegacy.current = record; setImportOpen(false);
    } catch (cause) { setImportError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function importAttempt<T>(key: string, execute: (submission: { id: string; staged?: MediaItem; attempts: number }) => Promise<T>, committed: (result: Awaited<ReturnType<typeof resolveSubmission>>) => T | undefined): Promise<T> {
    const submission: { id: string; staged?: MediaItem; attempts: number } = importSubmissions.current.get(key) || await getLegacySubmission(key); importSubmissions.current.set(key, submission);
    if (submission.attempts >= MAX_ATTEMPTS) throw new Error('Three attempts failed for this item. Choose Check interrupted import before retrying.');
    try { const existing = await resolveSubmission(submission.id, 'resolve'); if (existing.status === 'committed') { const saved = committed(existing); if (saved !== undefined) { importSubmissions.current.delete(key); return saved; } } if (existing.status === 'pending' || existing.pending) throw new Error('An earlier import is still pending. Check interrupted import before retrying.'); if (existing.status === 'aborted') { submission.id = crypto.randomUUID(); submission.staged = undefined; await saveLegacySubmission(key, submission); } const result = await execute(submission); importSubmissions.current.delete(key); return result; }
    catch (cause) {
      submission.attempts++; await saveLegacySubmission(key, submission);
      if (submission.attempts >= MAX_ATTEMPTS) { const outcome = await resolveSubmission(submission.id); if (outcome.status === 'committed') { const saved = committed(outcome); if (saved !== undefined) { importSubmissions.current.delete(key); return saved; } } if (outcome.status === 'aborted') { submission.staged = undefined; submission.id = crypto.randomUUID(); await saveLegacySubmission(key, submission); } }
      throw cause;
    }
  }
  async function recoverImport() {
    if (busy) return; setBusy('Checking interrupted import…'); setImportError('');
    try { for (const [key, submission] of importSubmissions.current) { const result = await resolveSubmission(submission.id); if (result.status === 'pending' || result.pending) throw new Error('An import submission is still pending. Check again shortly.'); if (result.status === 'committed') { if (result.record) { acceptRecord(result.record); const local = importRecords.find(record => demoRecordKey(record) === demoRecordKey(result.record!)); if (local) await rememberLegacyRecord(local, result.record); } if (key.startsWith('image:') && result.media?.[0]) await rememberLegacyMedia(key.slice(6), result.media[0].url); } else if (result.status !== 'aborted') throw new Error('The unfinished import could not be closed safely.'); importSubmissions.current.delete(key); await saveLegacySubmission(key, null); } setImportProgress('Interrupted submissions checked. Retry import to verify and continue the remaining items.'); }
    catch (cause) { setImportError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function importLocal() {
    if (busy || !importSnapshot) return; setBusy('Importing local data…'); setImportError(''); let imported = 0;
    try {
      let snapshot = readLegacySnapshot(); let library = await allRemoteMedia();
      // Validate ordinary content fields before uploading any images.
      for (const record of newImports) { const validated = recordSchema.safeParse(mapRecordImages(record, url => url.startsWith('data:') ? 'prepared-image' : url)); if (!validated.success) throw new Error(validationMessages(validated.error.issues)); }
      const assets = new Map<string, string>(); newImports.forEach(record => recordImageUrls(record).forEach(url => { if (url.startsWith('data:')) assets.set(url, record.title); })); snapshot.media.forEach(item => assets.set(item.image, item.title));
      for (const [url, title] of assets) {
                const mapped = await legacyImageUrl(url, library, snapshot); if (library.some(item => item.url === mapped)) continue;
        const prepared = legacyPrepared.current.get(url); if (!prepared) throw new Error('Review local data again to finish preparing all images before importing.');
        setImportProgress('Saving local image: ' + title);
        const item = await importAttempt('image:' + url, async submission => { if (!submission.staged) submission.staged = await stageImage(prepared, submission.id); return (await cmsRequest<{ media: MediaItem }>('/api/cms/media/commit', { method: 'POST', body: JSON.stringify({ mediaId: submission.staged.id, submissionId: submission.id, title: title.slice(0, 100) }) })).media; }, result => result.media?.[0]);
        await rememberLegacyMedia(url, item.url); await saveLegacySubmission('image:' + url, null); library = [item, ...library]; snapshot = readLegacySnapshot();
      }
      const current = await cmsRequest<{ records: ContentRecord[] }>('/api/cms/content'); let remote = [...current.records]; setRecords([...remote]);
      for (const record of newImports) {
        const existing = remote.find(item => demoRecordKey(item) === demoRecordKey(record)); if (existing) continue;
        setImportProgress('Importing new record: ' + record.title); const translated = await translateLegacyRecord(record, library, snapshot); const validated = recordSchema.safeParse(translated); if (!validated.success) throw new Error(validationMessages(validated.error.issues));
        const saved = await importAttempt('record:' + demoRecordKey(record), async submission => (await cmsRequest<{ record: ContentRecord }>('/api/cms/content', { method: 'POST', body: JSON.stringify({ record: validated.data, expectedRevision: null, submissionId: submission.id }) })).record, result => result.record);
        await rememberLegacyRecord(record, saved); await saveLegacySubmission('record:' + demoRecordKey(record), null); acceptRecord(saved); remote = [...remote, saved]; imported++;
      }
      setUploadedMedia(library); await inspectLegacy(readLegacySnapshot(), remote, library); setImportProgress(imported + ' new records imported. Local images are saved in the media library. Changed versions and local Trash still need individual review. Your browser copy is preserved.');
    } catch (cause) { setImportError(cmsErrorText(cause) + ' Your browser copy is preserved. Retry continues with remaining items.'); } finally { setBusy(''); }
  }
  function exportLocalData() {
    const raw = { content: localStorage.getItem('moe-content-v1'), media: localStorage.getItem('moe-media-v1'), receipts: localStorage.getItem('moe-migration-v1'), archive: localStorage.getItem('moe-migration-archive-v1') }; const url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'moe-local-data-' + new Date().toISOString().slice(0, 10) + '.json'; anchor.click(); URL.revokeObjectURL(url);
  }
  async function restoreLocalData() { if (busy || !await confirmAction('Restore the archived legacy browser data for review? This does not change server content.', 'Restore browser archive')) return; try { restoreLegacyArchive(); await previewImport(); } catch (cause) { setImportError(cmsErrorText(cause)); } }
  async function clearLocalData() {
    if (busy || !importSnapshot || !await confirmAction('All retained local records and images will be verified against the server, archived, then cleared from active browser storage. Cancel and export local data first if you also want to keep expired Trash.', 'Archive & clear local data')) return;
    setBusy('Verifying before clearing…'); setImportError('');
    try { const snapshot = readLegacySnapshot(); const remote = await cmsRequest<{ records: ContentRecord[] }>('/api/cms/content'); const library = await allRemoteMedia(); await clearVerifiedLegacy(snapshot, remote.records, library); setRecords(remote.records); await inspectLegacy(readLegacySnapshot(), remote.records, library); legacyPrepared.current.forEach(image => URL.revokeObjectURL(image.preview)); legacyPrepared.current.clear(); setImportProgress('Verified legacy content and media have been archived and cleared from active browser storage. You can restore the local archive below.'); }
    catch (cause) { setImportError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function exportContent() {
    if (busy) return; setBusy('Preparing export…'); setError('');
    try { const backup = await cmsRequest<unknown>('/api/cms/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `moe-export-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); }
    catch (cause) { setError(cmsErrorText(cause)); } finally { setBusy(''); }
  }

  const filtered = records.filter(record => (section === 'trash' ? Boolean(record.deletedAt) : !record.deletedAt) && (type === 'All' || record.type === type) && (status === 'All' || record.status === status) && contentBelongsToPage(record, pageFilter) && `${record.title} ${record.titleTh} ${record.id} ${record.category} ${record.categoryTh || ''} ${record.parentId || ''}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => pageFilter === 'All' ? 0 : (a.type === 'Page' ? -1 : b.type === 'Page' ? 1 : (a.order ?? 0) - (b.order ?? 0)));
  const hasContentFilters = Boolean(search.trim() || type !== 'All' || status !== 'All' || pageFilter !== 'All');
  const hasInboxFilters = Boolean(search.trim() || status !== 'All');
  const pages = records.filter(record => record.type === 'Page' && !record.deletedAt);
  const pageLabel = (id?: string) => id === 'shared' ? t('Shared across pages') : pages.find(page => page.id === id) ? localizedPageLabel(pages.find(page => page.id === id)!) : id || t('No parent page');
  const trashCount = records.filter(record => record.deletedAt).length;
  const newEnquiries = inbox.newCount;
  const inboxItems = inbox.enquiries;
  const title = section === 'trash' ? 'Trash' : section === 'inbox' ? 'Enquiries' : section === 'account' ? 'Account & tools' : type === 'All' ? 'Content overview' : typeOptions.find(option => option.type === type)?.title || 'Content';

  if (!sessionReady) return <LoadingScreen variant="cms" locale={locale} stage="session" />;
  if (user && !workspaceReady) return <LoadingScreen variant="cms" locale={locale} stage="workspace" />;
  if (!user) return <div className={styles.cms} lang={locale}><header className={styles.header}><Brand /><span className={styles.cmsLabel}>CMS</span><Link href={href(locale)} target="_blank" rel="noopener noreferrer" className={`button secondary ${styles.viewSite}`} aria-label={t("View website in a new tab")}>{t("View website")} </Link><CmsLanguageSwitch header /></header><main className={styles.loginMain}><section className={styles.loginCard}><div className={styles.loginIcon}><LockKeyhole size={30} /></div><span className="eyebrow">MOE Navigation CMS</span><h1>{t("Welcome back")}</h1><p>{t("Sign in to manage your website content and enquiries.")}</p><form className={styles.editor} onSubmit={login}><label>{t("Username")}<input name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={80} /></label><label>{t("Password")}<input type="password" name="password" required autoComplete="current-password" maxLength={200} /></label>{loginError && <div className={styles.error} role="alert">{t(loginError)}</div>}<button type="submit" className="button" disabled={Boolean(busy)}>{busy === 'login' ? <><LoaderCircle className={styles.spinner} size={20} />{t("Signing in…")}</> : <>{t("Sign in")}</>}</button><p className={styles.loginHelp}>{t("Use the administrator credentials created for this website.")}</p></form></section></main></div>;

  return <div className={styles.cms} lang={locale} data-cms-root>
    <a className="skip-link" href="#cms-content">{t("Skip to content")}</a>
    <header className={styles.header}><button className={styles.menuButton} type="button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setDrawerOpen(true); }} aria-label={t("Open CMS navigation")} aria-haspopup="dialog"><Menu /><span>{t("Menu")}</span></button><Brand /><span className={styles.cmsLabel}>CMS</span><Link href={href(locale)} target="_blank" rel="noopener noreferrer" className={`button secondary ${styles.viewSite}`} aria-label={t("View website in a new tab")}><span className={styles.viewSiteLong}>{t("View website")}</span><span className={styles.viewSiteShort}>{t("Site")}</span></Link><CmsLanguageSwitch header /><button type="button" className={styles.avatar} title={t("Account: {name}", { name: user.username })} aria-label={t("Open account settings")} onClick={() => navigate('account')}>{user.username.slice(0, 1).toUpperCase()}</button></header>
    <main className={styles.main} id="cms-content">
      <div className={styles.intro}><div><span className="eyebrow">{t("Website workspace")}</span><h1>{t(title)}</h1><p>{section === 'trash' ? t("Restore deleted content within 30 days.") : section === 'inbox' ? t("Keep track of messages from your website visitors.") : section === 'account' ? t("Manage your sign-in and keep a copy of your content.") : t("Keep your website current, in English and Thai.")}</p></div><div className={styles.introActions}><button type="button" className={`button secondary ${styles.refreshButton}`} aria-label={t("Refresh workspace")} disabled={loading || Boolean(busy)} onClick={() => void load()}><RefreshCw className={loading ? styles.spinner : ''} size={20} /><span className={styles.refreshLabel}>{t("Refresh")}</span></button>{section === 'content' && <button type="button" className="button" onClick={() => openEditor()} disabled={loading || Boolean(busy)}><Plus size={21} />{t("Create content")}</button>}</div></div>
      {loading && <div className={styles.refreshStatus} role="status"><span className={styles.refreshStatusIcon}><RefreshCw className={styles.spinner} size={19} aria-hidden="true" /></span><div><strong>{t("Refreshing workspace")}</strong><p>{t("Your current content stays available while the latest updates load.")}</p></div></div>}
      {error && <div className={styles.error} role="alert">{t(error)}</div>}{notice && <div className={styles.success} role="status"><Check size={19} /><span>{t(notice)}</span><button type="button" className={styles.iconButton} onClick={() => setNotice('')} aria-label={t("Dismiss notification")}><X size={18} /></button></div>}
      {section === 'content' && <div className={styles.overviewStats}><div><span>{t("Published")}</span><strong>{records.filter(item => item.status === 'Published' && !item.deletedAt).length}</strong></div><div><span>{t("Not public")}</span><strong>{records.filter(item => item.status === 'Draft' && !item.deletedAt).length}</strong></div><button type="button" onClick={() => navigate('inbox')}><span>{t("New enquiries")}</span><strong>{newEnquiries ?? '—'}</strong></button></div>}
      {(section === 'content' || section === 'trash') && <div className={styles.workspace}><section className={styles.panel} aria-labelledby="content-heading"><div className={styles.panelHeading}><h2 id="content-heading">{section === 'trash' ? t("Deleted content") : t("Website content")}</h2><button className={styles.textButton} type="button" onClick={clearFilters}>{t("All content")}</button></div><div className={styles.tabs}><button type="button" aria-pressed={section === 'content'} className={section === 'content' ? styles.tabActive : ''} onClick={() => navigate('content')}>{t("Content")}<span>{records.length - trashCount}</span></button><button type="button" aria-pressed={section === 'trash'} className={section === 'trash' ? styles.tabActive : ''} onClick={() => navigate('trash')}>{t("Trash")}<span>{trashCount}</span></button></div><div className={styles.filters}><label className={styles.search}><Search size={20} /><input ref={workspaceSearchRef} type="search" placeholder={t("Search content…")} aria-label={t("Search content")} value={search} onChange={event => { setSearch(event.target.value); setLimit(12); }} /></label><label className={styles.select}><span className={styles.srOnly}>{t("Content type")}</span><select value={type} onChange={event => { setType(event.target.value); setPageFilter('All'); setLimit(12); }}><option value="All">{t("All types")}</option>{typeOptions.map(option => <option key={option.type} value={option.type}>{t(option.title)}</option>)}</select><ChevronDown size={17} /></label><label className={styles.select}><span className={styles.srOnly}>{t("Publication status")}</span><select value={status} onChange={event => { setStatus(event.target.value); setLimit(12); }}><option value="All">{t("All statuses")}</option><option value="Published">{t("Published")}</option><option value="Draft">{t("Not public")}</option></select><ChevronDown size={17} /></label></div>
        {(type === 'All' || type === 'Page' || type === 'Section') && <div className={styles.pageFilter}><label>{t("Find a page and its sections")}<select value={pageFilter} onChange={event => { setPageFilter(event.target.value); setLimit(12); }}><option value="All">{t("All pages")}</option>{pages.map(page => <option key={page.id} value={page.id}>{localizedPageLabel(page)}</option>)}<option value="shared">{t("Shared across pages")}</option></select></label><span className={styles.fieldHint}>{pageFilter === 'All' ? t("Select a page to find its main content and related sections.") : t("{count} matching items for {page}.", { count: filtered.length, page: pageLabel(pageFilter) })}</span></div>}
        <div className={styles.resultBar}><span role="status">{loading ? t("Refreshing content…") : t(hasContentFilters ? "Showing {shown} of {total} items matching your filters" : "Showing {shown} of {total} items", { shown: Math.min(filtered.length, limit), total: filtered.length })}</span>{hasContentFilters && <button className={styles.textButton} type="button" onClick={clearFilters}><X size={16} />{t("Clear filters")}</button>}</div>
        {loading && !records.length ? <LoadingPanel title={t("Loading your content")} description={t("Bringing your pages and updates into view.")} kind="content" /> : !filtered.length ? <div className={styles.empty}><FileText size={34} /><h3>{hasContentFilters ? t("No matching content") : section === 'trash' ? t("Trash is empty") : t("No content yet")}</h3><p>{hasContentFilters ? t("Try another search or clear your filters.") : section === 'trash' ? t("Deleted items will appear here for 30 days.") : t("Create your first item to get started.")}</p></div> : <table className={styles.contentTable}><thead><tr><th>{t("Title")}</th><th>{t("Type")}</th><th>{t("Status")}</th><th>{t("Action")}</th></tr></thead><tbody>{filtered.slice(0, limit).map(record => <tr key={demoRecordKey(record)}><td className={styles.titleCell}><>{record.image ? <img src={record.image} alt="" width={140} height={83} /> : <span className={styles.contentThumbEmpty}><FileText size={24} aria-hidden="true" /></span>}</><div><strong>{recordTitle(record)}</strong><span className={styles.mobileType}>{t(record.type)}</span>{record.type === 'Section' && <span className={styles.recordContext}>{pageLabel(record.parentId)} {t("· Order")} {record.order ?? 0}</span>}{record.type === 'Page' && <button type="button" className={styles.sectionLink} onClick={() => { setType('Section'); setPageFilter(record.id); setSearch(''); setStatus('All'); setLimit(12); }}>{t("Manage sections (")}{records.filter(item => item.type === 'Section' && item.parentId === record.id && !item.deletedAt).length})</button>}{record.deletedAt && <span className={styles.expiry}>{t("Deleted")} {new Date(record.deletedAt).toLocaleDateString(dateLocale)}</span>}</div></td><td className={styles.typeCell}>{t(record.type)}</td><td className={styles.statusCell}><span className={`${styles.badge} ${record.status === 'Published' ? styles.published : styles.draft}`}>{record.status === 'Draft' ? t("Not public") : t(record.status)}</span></td><td className={styles.actionCell}>{section === 'trash' ? <button type="button" className={styles.textButton} aria-label={t("Restore {name}", { name: recordTitle(record) })} disabled={Boolean(busy)} onClick={() => void changeRecord(record, 'restore')}><RotateCcw size={18} />{t("Restore")}</button> : <><button type="button" className={styles.textButton} aria-label={t("Edit {name}", { name: recordTitle(record) })} onClick={() => openEditor(record)} disabled={Boolean(busy)}>{t("Edit")}</button><button type="button" className={styles.deleteButton} aria-label={t("Move {name} to Trash", { name: recordTitle(record) })} title={corePage(record) ? t("This core page must remain available.") : undefined} disabled={Boolean(busy) || (corePage(record))} onClick={() => setDeleteRecord(record)}><Trash2 size={18} /></button></>}</td></tr>)}</tbody></table>}
        {filtered.length > limit && <button className={styles.showMore} type="button" onClick={() => setLimit(current => current + 12)}>{t("Show more (")}{filtered.length - limit} {t("remaining)")}</button>}{section === 'trash' && <p className={styles.retentionNote}>{t("Items are permanently removed after 30 days. Images referenced by other content remain protected.")}</p>}</section><aside className={`${styles.panel} ${styles.mediaPanel}`} aria-labelledby="media-heading"><div className={styles.panelHeading}><h2 id="media-heading">{t("Media library")}</h2><button type="button" className={styles.textButton} onClick={openMedia}>{t("View all")}</button></div><p>{t("Ready for your next update")}</p>{loading && !media.length ? <LoadingPanel title={t("Loading your images")} kind="media" /> : <div className={styles.mediaGrid}>{media.slice(0, 4).map(item => <button type="button" key={item.id} onClick={openMedia}><img src={item.url} alt="" width={300} height={180} /><strong>{item.title}</strong></button>)}</div>}<button type="button" className={`button secondary ${styles.uploadButton}`} onClick={openMedia}><UploadCloud size={23} />{t("Add an image")}</button><span className={styles.localLabel}>{t("Choose an image, review it, then upload.")}</span></aside></div>}
      {section === 'inbox' && <section className={styles.panel} aria-label={t("Enquiry inbox")}>
        <div className={styles.inboxFilters}>
          <label className={styles.search}><Search size={20} /><input ref={workspaceSearchRef} type="search" aria-label={t("Search all enquiries")} placeholder={t("Search all enquiries…")} maxLength={200} value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label className={styles.select}><span className={styles.srOnly}>{t("Enquiry status")}</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="All">{t("All statuses")}</option>{enquiryStatuses.map(value => <option key={value} value={value}>{t(value)}</option>)}</select><ChevronDown size={17} /></label>
        </div>
        <div className={styles.resultBar}><span role={inbox.searching ? undefined : 'status'}>{inbox.searching ? t("Searching all enquiries…") : inbox.total !== null ? t("Showing {shown} of {total} enquiries", { shown: inboxItems.length, total: inbox.total }) : t("Enquiries could not be loaded")}</span>{hasInboxFilters && <button type="button" className={styles.textButton} onClick={clearFilters}><X size={16} />{t("Clear filters")}</button>}</div>
        {inbox.totalAll !== null && !inbox.searching && <p className={styles.fieldHint}>{t("{total} enquiries in your inbox · {new} new. Search covers all saved enquiries.", { total: inbox.totalAll, new: inbox.newCount ?? 0 })}</p>}
        {inbox.error && <div className={styles.error} role="alert"><p>{t(inbox.error)}</p><button type="button" className="button secondary" disabled={inbox.loadingMore || Boolean(busy)} onClick={() => inboxItems.length ? void inbox.loadMore() : refreshInbox()}><RefreshCw size={18} />{inboxItems.length ? t("Retry loading more") : t("Retry enquiry search")}</button></div>}
        <div id="enquiry-results" aria-busy={inbox.searching || inbox.loadingMore}>
          {inbox.searching ? <LoadingPanel title={hasInboxFilters ? t("Finding matching enquiries") : t("Loading your enquiries")} description={hasInboxFilters ? t("Searching every saved message for your selection.") : t("Bringing your latest website messages into view.")} kind="inbox" /> : !inbox.error && !inboxItems.length ? <div className={styles.empty}><Inbox size={36} /><h3>{hasInboxFilters ? t("No matching enquiries") : t("Your inbox is clear")}</h3><p>{hasInboxFilters ? t("Try another search or clear your filters.") : t("Messages submitted through the contact form appear here.")}</p></div> : <div className={styles.inboxList}>{inboxItems.map(item => <button type="button" key={item.id} className={styles.enquiryRow} onClick={() => { setSelectedEnquiry(item); setEnquiryError(''); setEnquiryNotice(''); }}><div><strong>{item.subject}</strong><span>{item.name}{item.company ? ` · ${item.company}` : ''}</span><p>{item.message}</p></div><div className={styles.enquiryMeta}><span className={`${styles.badge} ${item.status === 'Resolved' ? styles.published : styles.draft}`}>{t(item.status)}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div></button>)}</div>}
          {inbox.nextCursor && !inbox.error && <button type="button" className={styles.showMore} disabled={inbox.loadingMore || Boolean(busy)} onClick={() => void inbox.loadMore()}>{inbox.loadingMore ? <><LoaderCircle className={styles.spinner} size={18} />{t("Loading more enquiries…")}</> : <>{t("Load more enquiries")}</>}</button>}
        </div>
      </section>}
      {section === 'account' && <div className={styles.accountGrid}><section className={`${styles.panel} ${styles.websiteSettings}`}><div className={styles.panelHeading}><h2>{t("Website details")}</h2><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void refreshWebsiteDetails()}><RefreshCw size={17} />{t("Refresh details")}</button></div><p className={styles.accountDescription}>{t("Use verified company information. Leave contact fields blank until the details are ready.")}</p>{websiteDetails ? <form className={styles.editor} onSubmit={saveWebsiteDetails}><fieldset className={styles.formFields} disabled={Boolean(busy)}><div className={styles.twoColumns}><label>{t("Company name · English")}<input required lang="en" maxLength={150} value={websiteDetails.draft.companyName} onChange={event => updateWebsiteDetails('companyName', event.target.value)} /></label><label>{t("Company name · Thai")}<input required lang="th" maxLength={150} value={websiteDetails.draft.companyNameTh} onChange={event => updateWebsiteDetails('companyNameTh', event.target.value)} /></label></div><div className={styles.twoColumns}><label>{t("Office address · English")}<textarea lang="en" rows={3} maxLength={1000} value={websiteDetails.draft.officeAddress} onChange={event => updateWebsiteDetails('officeAddress', event.target.value)} /></label><label>{t("Office address · Thai")}<textarea lang="th" rows={3} maxLength={1000} value={websiteDetails.draft.officeAddressTh} onChange={event => updateWebsiteDetails('officeAddressTh', event.target.value)} /></label></div><div className={styles.twoColumns}><label>{t("Public phone number")}<input type="tel" maxLength={40} value={websiteDetails.draft.phone} onChange={event => updateWebsiteDetails('phone', event.target.value)} autoComplete="tel" /></label><label>{t("Public email address")}<input type="email" maxLength={254} value={websiteDetails.draft.email} onChange={event => updateWebsiteDetails('email', event.target.value)} autoComplete="email" /></label></div><label>{t("Map link")}<input type="url" maxLength={1500} placeholder="https://" value={websiteDetails.draft.mapUrl} onChange={event => updateWebsiteDetails('mapUrl', event.target.value)} /><span className={styles.fieldHint}>{t("Paste the HTTPS link to your office location.")}</span></label></fieldset>{settingsError && <div className={styles.error} role="alert">{t(settingsError)}<p>{t("Your input is preserved. Refresh details only when you want to discard the unsaved version.")}</p></div>}{settingsNotice && <div className={styles.success} role="status"><Check size={18} />{t(settingsNotice)}</div>}<div className={styles.editorFooter}><button type="submit" className="button" disabled={Boolean(busy) || !settingsDirty}><Check size={18} />{busy === 'Saving website details…' ? t(busy) : t("Save website details")}</button></div></form> : <p className={styles.editorNotice}>{t("Website details could not be loaded. Use Refresh details to try again.")}</p>}</section><section className={styles.panel}><div className={styles.panelHeading}><h2>{t("Change password")}</h2><LockKeyhole size={22} /></div><p className={styles.accountDescription}>{t("Signed in as")} <strong>{user.username}</strong>{t(". Use at least 14 characters for your new password.")}</p><form className={styles.editor} onSubmit={changePassword}><label>{t("Current password")}<input name="currentPassword" disabled={Boolean(busy)} type="password" autoComplete="current-password" required maxLength={200} /></label><label>{t("New password")}<input name="newPassword" disabled={Boolean(busy)} type="password" autoComplete="new-password" required minLength={14} maxLength={200} /></label><label>{t("Confirm new password")}<input name="confirmPassword" disabled={Boolean(busy)} type="password" autoComplete="new-password" required minLength={14} maxLength={200} /></label><button className="button" disabled={Boolean(busy)} type="submit">{busy === 'Updating password…' ? t(busy) : t("Update password")}</button></form></section><section className={styles.panel}><h2>{t("Content tools")}</h2><div className={styles.toolCard}><Download size={24} /><div><h3>{t("Export website data")}</h3><p>{t("Download content, media references and enquiries as JSON. Image files and administrator accounts are stored separately.")}</p><button type="button" className="button secondary" onClick={() => void exportContent()} disabled={loading || Boolean(busy)}><Download size={18} />{busy === 'Preparing export…' ? t("Preparing export…") : t("Export data")}</button></div></div><div className={styles.toolCard}><UploadCloud size={24} /><div><h3>{t("Bring over local content")}</h3><p>{t("Review content saved by the earlier browser demo. Import new records while preserving current website content.")}</p><button type="button" className="button secondary" onClick={previewImport}>{t("Review local content")}</button></div></div><button type="button" className={styles.textButton} onClick={() => void logout()} disabled={Boolean(busy)}><LogOut size={19} />{t("Sign out")}</button></section></div>}
    </main>
    <NavigationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}><p className={styles.drawerDescription}>MOE Navigation · {user.username}</p><nav className={styles.drawerLinks}><button type="button" onClick={() => navigate('content')}><FileText size={20} />{t("Content overview")}</button>{typeOptions.map(option => <button key={option.type} type="button" onClick={() => navigate('content', option.type)}><option.icon size={20} />{t(option.title)}</button>)}<button type="button" onClick={() => navigate('inbox')}><Inbox size={20} />{t("Enquiries")} {newEnquiries !== null && newEnquiries > 0 && <span className={styles.navCount}>{newEnquiries}</span>}</button><button type="button" onClick={() => { setDrawerOpen(false); openMedia(); }}><ImagePlus size={20} />{t("Media library")}</button><button type="button" onClick={() => navigate('trash')}><Trash2 size={20} />{t("Trash (")}{trashCount})</button><button type="button" onClick={() => navigate('account')}><Settings size={20} />{t("Account & tools")}</button></nav><div className={styles.drawerFoot}><button type="button" className="button secondary" onClick={() => void logout()} disabled={Boolean(busy)}><LogOut size={19} />{t("Sign out")}</button></div></NavigationDrawer>
    <Modal open={editing !== null} onClose={closeEditor} title={original ? t("Edit content") : t("Create content")} busy={Boolean(busy)} actions={<div className={styles.editorActionRow}><span className={styles.saveState} role="status">{editorDirty ? t("Unsaved changes") : original ? t("Showing the saved version") : t("New content")}</span>{editorDirty && <button type="button" className={styles.textButton} onClick={downloadDraft} disabled={Boolean(busy)}><Download size={18} />{t("Download unsaved text")}</button>}<button type="button" className="button secondary" onClick={closeEditor} disabled={Boolean(busy)}>{t("Cancel")}</button><button type="submit" form="cms-content-editor" className="button" disabled={preparing || Boolean(busy) || editorAttempts >= MAX_ATTEMPTS || editorConflict}>{busy ? <LoaderCircle className={styles.spinner} size={19} /> : <Check size={19} />}{t(busy) || (preparing ? t("Preparing image…") : t("Save"))}</button></div>}>{editing && <form id="cms-content-editor" className={styles.editor} aria-busy={Boolean(busy)} onSubmit={saveEditor} onInvalidCapture={event => { const field = event.target as HTMLElement; field.closest('details')?.setAttribute('open', ''); }}><p className={styles.editorNotice}>{t("Save makes your changes available on the website immediately.")}{publishedPreview && original && <span className={styles.previewLinks}><a className={styles.previewLink} href={publishedPreview} target="_blank" rel="noopener noreferrer">{t("View website · Thai")}</a><a className={styles.previewLink} href={publishedContentUrl(original, records, 'en')!} target="_blank" rel="noopener noreferrer">{t("View website · English")}</a></span>}</p><CmsContentFields record={editing} existing={Boolean(original)} pages={records.filter(record => record.type === 'Page')} media={media} images={editorImages} disabled={Boolean(busy)} preparing={preparing} hasMore={Boolean(mediaCursor)} onChange={updateEditor} onTypeChange={nextType => void changeEditorType(nextType)} onImage={(file, target) => void chooseEditorImage(file, target)} onMore={() => void loadMoreMedia()} routeText={routeText} onRouteText={setRouteText} />{editorError && <div ref={editorErrorRef} className={styles.error} role="alert" tabIndex={-1}>{t(editorError)}<p>{t("Your input is preserved.")}{editorAttempts >= MAX_ATTEMPTS ? t(" Three attempts failed. Check the saved content before retrying.") : editorConflict ? t(" Load the latest version before editing again.") : t(" Retry after checking the issue.")}</p>{(editorConflict || editorAttempts >= MAX_ATTEMPTS) && <div className={styles.recoveryActions}><button type="button" className="button secondary" onClick={() => void recoverEditor()} disabled={Boolean(busy)}>{editorConflict ? t("Load latest saved version") : t("Check saved content")}</button><button type="button" className={styles.textButton} onClick={downloadDraft}><Download size={18} />{t("Download unsaved text")}</button></div>}</div>}</form>}</Modal>
    <Modal open={deleteRecord !== null} onClose={() => setDeleteRecord(null)} title={t("Move to Trash?")} busy={Boolean(busy)}><p className={styles.confirmText}>{t("“{name}” will be hidden from the website. You can restore it for 30 days.", { name: deleteRecord ? recordTitle(deleteRecord) : '' })}</p><div className={styles.editorFooter}><button type="button" className="button secondary" onClick={() => setDeleteRecord(null)} disabled={Boolean(busy)}>{t("Cancel")}</button><button type="button" className="button" disabled={Boolean(busy)} onClick={() => { if (deleteRecord) void changeRecord(deleteRecord, 'trash'); }}><Trash2 size={18} />{busy === 'trash' ? t("Moving…") : t("Move to Trash")}</button></div></Modal>
    <Modal open={mediaOpen} onClose={closeMedia} title={t("Media library")} busy={Boolean(busy)}><p className={styles.editorNotice}>{t("Prepare an image first. Upload starts only when you choose Save image.")}</p>{mediaNotice && <div className={styles.success} role="status"><Check size={19} />{t(mediaNotice)}</div>}<div className={styles.mediaUpload}><label className={`button secondary ${styles.fileButton}`}><UploadCloud size={20} />{mediaPreparing ? t("Preparing image…") : t("Choose device image")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={mediaPreparing || Boolean(busy)} aria-label={t("Choose media library image")} onChange={event => { void chooseLibraryImage(event.target.files?.[0]); event.target.value = ''; }} /></label><p>{t("JPEG, PNG or WebP · up to 8 MB before preparation")}</p></div>{preparedMedia && <form className={styles.preparedImage} onSubmit={saveMedia}><img src={preparedMedia.preview} alt={t("Prepared media preview")} width={240} height={150} /><label>{t("Image name")}<input required maxLength={100} value={mediaTitle} disabled={Boolean(busy)} onChange={event => setMediaTitle(event.target.value)} /><span className={styles.fieldHint}>{preparedMedia.width} × {preparedMedia.height} · {(preparedMedia.blob.size / 1024).toFixed(0)} KB</span></label><button type="submit" className="button" disabled={mediaPreparing || !mediaTitle.trim() || Boolean(busy) || mediaAttempts >= MAX_ATTEMPTS}>{busy ? <LoaderCircle className={styles.spinner} size={18} /> : <Check size={18} />}{t(busy) || t("Save image")}</button></form>}{mediaError && <div className={styles.error} role="alert">{t(mediaError)}{mediaAttempts >= MAX_ATTEMPTS && <div className={styles.recoveryActions}><p>{t("Three attempts failed. Your prepared image is preserved.")}</p><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void recoverMedia()}>{t("Check saved media")}</button></div>}</div>}<div className={styles.librarySearch}><label className={styles.search}><Search size={20} /><input ref={mediaSearchRef} type="search" aria-label={t("Search media library")} placeholder={t("Search image names…")} value={mediaSearch} onChange={event => setMediaSearch(event.target.value)} /></label>{mediaSearch && <button type="button" className={styles.textButton} onClick={() => { setMediaSearch(''); mediaSearchRef.current?.focus({ preventScroll: true }); }}><X size={16} />{t("Clear search")}</button>}</div><div className={styles.resultBar}><span role="status">{t(mediaCursor ? "{count} of {total} loaded images" : "{count} of {total} images", { count: filteredMedia.length, total: media.length })}</span></div>{loading && !media.length ? <LoadingPanel title={t("Loading your images")} description={t("Preparing your media library.")} kind="media" /> : !filteredMedia.length && <div className={styles.empty}><ImagePlus size={32} /><h3>{mediaSearch.trim() ? t("No matching images") : t("Your library is empty")}</h3><p>{mediaSearch.trim() ? t("Try another image name or clear your search.") : t("Choose a device image above to get started.")}</p></div>}<div className={styles.libraryGrid}>{filteredMedia.map(item => <div key={item.id}><img src={item.url} alt="" width={260} height={160} loading="lazy" /><strong>{item.title}</strong><span className={styles.fieldHint}>Cloudinary</span>{<button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void removeMedia(item)} aria-label={t("Remove {name} from library", { name: item.title })}><Trash2 size={16} />{t("Remove")}</button>}</div>)}</div>{mediaCursor && <button type="button" className={styles.showMore} disabled={Boolean(busy)} onClick={() => void loadMoreMedia()}>{t("Load more images")}</button>}{mediaCursor && <p className={styles.fieldHint}>{t("Search covers loaded images. Load more to include older images.")}</p>}<div className={styles.cleanup}><p>{t("Remove unused uploads after a one-hour grace period. Images in content or Trash remain protected.")}</p><button type="button" className={styles.textButton} onClick={() => void cleanupMedia()} disabled={Boolean(busy) || Boolean(preparedMedia) || Object.keys(editorImages).length > 0}><Trash2 size={18} />{t("Clean unfinished uploads")}</button></div></Modal>
    <Modal open={selectedEnquiry !== null} onClose={() => setSelectedEnquiry(null)} title={t("Enquiry details")} busy={Boolean(busy)}>{selectedEnquiry && <div className={styles.enquiryDetails}><div className={styles.enquiryToolbar}><span className={styles.fieldHint}>{t("Received")} {formatDate(selectedEnquiry.createdAt)}</span><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void refreshEnquiry(selectedEnquiry)}><RefreshCw size={18} />{busy === 'Refreshing enquiry…' ? t("Refreshing…") : t("Refresh enquiry")}</button></div>{enquiryNotice && <p className={styles.fieldHint} role="status">{t(enquiryNotice)}</p>}<h3>{selectedEnquiry.subject}</h3><dl><div><dt>{t("Name")}</dt><dd>{selectedEnquiry.name}</dd></div><div><dt>{t("Email")}</dt><dd><a href={`mailto:${selectedEnquiry.email}`}>{selectedEnquiry.email}</a></dd></div>{selectedEnquiry.company && <div><dt>{t("Company")}</dt><dd>{selectedEnquiry.company}</dd></div>}</dl><p className={styles.messageBody}>{selectedEnquiry.message}</p><section className={styles.notification} aria-label={t("Email notification")}><strong>{selectedEnquiry.notification ? t(notificationLabels[selectedEnquiry.notification.status]) : t("Email status unavailable")}</strong><p className={styles.fieldHint}>{t(selectedEnquiry.notification?.message || "") || (selectedEnquiry.notification?.status === 'sent' ? t("The email provider accepted the notification. Inbox delivery is not guaranteed.") : selectedEnquiry.notification?.status === 'sending' ? t("A notification is being processed. Refresh the enquiry to check the outcome.") : selectedEnquiry.notification?.status === 'review' ? t("Check the email provider before sending again to avoid a duplicate notification.") : t("The enquiry remains saved here regardless of email status."))}</p>{selectedEnquiry.notification?.sentAt && <span className={styles.fieldHint}>{t("Accepted")} {formatDate(selectedEnquiry.notification.sentAt)}</span>}{selectedEnquiry.notification && selectedEnquiry.notification.attempts < 3 && ['not_configured', 'failed', 'pending'].includes(selectedEnquiry.notification.status) && <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void retryNotification(selectedEnquiry)}><RefreshCw size={18} />{busy === 'Sending notification…' ? t(busy) : t("Retry notification")}</button>}{selectedEnquiry.notification && selectedEnquiry.notification.attempts >= 3 && selectedEnquiry.notification.status !== 'sent' && <p className={styles.fieldHint}>{t("The automatic retry limit has been reached. Review the provider before taking further action.")}</p>}</section>{enquiryError && <div className={styles.error} role="alert">{t(enquiryError)}</div>}<label className="field">{t("Status")}<select value={selectedEnquiry.status} disabled={Boolean(busy)} onChange={event => void changeEnquiry(selectedEnquiry, event.target.value as Enquiry['status'])}>{enquiryStatuses.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><a className="button secondary" href={`mailto:${selectedEnquiry.email}?subject=${encodeURIComponent(`Re: ${selectedEnquiry.subject}`)}`}>{t("Reply by email")}</a></div>}</Modal>
    <Modal open={importOpen} onClose={() => setImportOpen(false)} title={t("Review local content")} busy={Boolean(busy)}>
      <p className={styles.editorNotice}>{t("Import new records and local images. Review changed versions individually before saving. Local Trash is never published automatically.")}</p>
      <div className={styles.importStats}><strong>{newImports.length} {t("new records ·")} {importSnapshot?.media.length || 0} {t("local library images")}</strong><span>{verifiedLocal.length} {t("of")} {importRecords.length} {t("retained records verified ·")} {verifiedLocalMedia} {t("local library images verified")}</span></div>
      {newImports.length > 0 && <ul className={styles.importList}>{newImports.map(record => <li key={demoRecordKey(record)}><span>{recordTitle(record)}</span><span>{t(record.type)} · {t(record.status)}</span><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void reviewLocal(record)}>{t("Review before import")}</button></li>)}</ul>}
      {changedImports.length > 0 && <><h3>{t("Versions needing review")}</h3><p className={styles.fieldHint}>{t("Existing website content is preserved until you review and save each local version.")}</p><ul className={styles.importList}>{changedImports.map(record => <li key={demoRecordKey(record)}><span>{recordTitle(record)}{record.deletedAt ? t(" · Local Trash") : ''}</span><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void reviewLocal(record)}>{t("Review local version")}</button></li>)}</ul></>}
      {!importRecords.length && !importSnapshot?.media.length && !importError && <p className={styles.empty}>{t("No retained local content or media was found.")}</p>}
      {Boolean(importSnapshot?.expired) && <p className={styles.fieldHint}>{importSnapshot?.expired} {t("expired Trash item(s) are excluded from import. Export local data to keep an archive before clearing.")}</p>}
      {importError && <div className={styles.error} role="alert">{t(importError)}</div>}{importProgress && <p className={styles.editorNotice} role="status">{t(importProgress)}</p>}
      <div className={styles.recoveryActions}><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={exportLocalData}><Download size={18} />{t("Export local data")}</button>{localArchive && <button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void restoreLocalData()}><RotateCcw size={18} />{t("Restore archived browser data")}</button>}{<button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void recoverImport()}>{t("Check interrupted import")}</button>}<button type="button" className={styles.textButton} disabled={Boolean(busy) || !importSnapshot || verifiedLocal.length !== importRecords.length || verifiedLocalMedia !== importSnapshot.media.length || !Object.values(importSnapshot.raw).some(Boolean)} onClick={() => void clearLocalData()}><Trash2 size={18} />{t("Clear verified local data")}</button></div>
      <div className={styles.editorFooter}><button type="button" className="button secondary" onClick={() => setImportOpen(false)} disabled={Boolean(busy)}>{t("Close")}</button><button type="button" className="button" disabled={Boolean(busy) || !importSnapshot || (!newImports.length && verifiedLocal.length === importRecords.length && verifiedLocalMedia === importSnapshot.media.length)} onClick={() => void importLocal()}><UploadCloud size={19} />{t(busy) || t("Import new records & images")}</button></div>
    </Modal>
    <Modal open={confirmation !== null} onClose={() => settleConfirmation(false)} title={t(confirmation?.action || "") || t("Confirm action")} compact><p className={styles.confirmText}>{t(confirmation?.message || "", confirmation?.action === 'Change content type' && confirmation.params ? { type: t(String(confirmation.params.type)), fields: String(confirmation.params.fields).split(' and ').map(field => t(field)).join(locale === 'th' ? 'และ' : ' and ') } : confirmation?.params)}</p><div className={styles.editorFooter}><button type="button" className="button secondary" onClick={() => settleConfirmation(false)}>{t("Cancel")}</button><button type="button" className="button" onClick={() => settleConfirmation(true)}>{t(confirmation?.action || "")}</button></div></Modal>
  </div>;
}
