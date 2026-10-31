/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, BarChart3, Check, ChevronDown, Container, Download, FileText, Globe2, ImagePlus, Inbox, History, Link2, LoaderCircle, LogOut, Menu, Newspaper, Plus, RefreshCw, RotateCcw, Route, Search, Settings, Ship, UserRound, Trash2, UploadCloud, X } from 'lucide-react';
import { legacyRecordKey, readLegacySnapshot, legacyRecordMatches, legacyMediaMatches, rememberLegacyRecord, rememberLegacyMedia, clearVerifiedLegacy, hasLegacyArchive, restoreLegacyArchive, getLegacySubmission, saveLegacySubmission, translateLegacyRecord, legacyImageUrl, type LegacyRecord, type LegacySnapshot } from '@/lib/cms-legacy';
import { contentTypes, corePageIds, type CmsContentSummary, type ContentRecord, type MediaItem, type Enquiry, type SiteSettings } from '@/lib/cms-types';
import { recordSchema, siteSettingsSchema } from '@/lib/validation';
import { cmsPageLabel, publishedContentUrl } from '@/lib/cms-navigation';
import { cmsPathForView, cmsViewFromPathname } from '@/lib/cms-routes';
import { containDialogFocus } from '@/lib/dialog-focus';
import { CmsRequestError, cmsErrorText, cmsRequest, prepareCmsImage, resolveSubmission, mapRecordImages, recordImageUrls, parseRouteCoordinates, refreshWebsiteDetailsDraft, createEditorDraftExport, type PreparedImage } from '@/lib/cms-client';
import BrandMark from './BrandMark';
import LoadingScreen, { LoadingPanel } from './LoadingScreen';
import CmsContentFields, { type ImageTarget } from './CmsContentFields';
import useCmsInbox from './useCmsInbox';
import useCmsCollectionPage from './useCmsCollectionPage';
import type { InboxStatus } from '@/lib/inbox-query';
import styles from './CmsWorkspace.module.css';
import { useCmsLocale } from '@/lib/cms-locale';
import { href } from '@/lib/content';
import CmsLanguageSwitch from './CmsLanguageSwitch';
import CmsLoginForm from './CmsLoginForm';
import CmsUsersManager from './CmsUsersManager';
import CmsDashboard from './CmsDashboard';
import CmsPageManager from './CmsPageManager';
import useCmsMediaSearch from './useCmsMediaSearch';
import { collectionEditorTitle, createCollectionId, newCollectionDraft } from '@/lib/cms-collection-editor';
import type { CmsUser } from '@/lib/cms-roles';
import CmsTrashManager from './CmsTrashManager';
import CmsActivityLog from './CmsActivityLog';
import CmsUsageDashboard from './CmsUsageDashboard';
import CmsHomeSlides, { CmsSlidesDraftStore } from './CmsHomeSlides';
import CmsAvatar from './CmsAvatar';
import useCmsEmailSetup from './useCmsEmailSetup';
import { CmsEmailSetupCard, CmsEmailSetupNotice, CmsNotificationSend } from './CmsEmailSetup';
import CmsEnquiryRecipients from './CmsEnquiryRecipients';
import type { CmsTrashItem } from '@/lib/cms-trash';

type User = CmsUser;
type Section = 'content' | 'trash' | 'inbox' | 'media' | 'setting' | 'users' | 'logs' | 'usage' | 'slides';
const typeOptions: { title: string; type: ContentRecord['type']; icon: typeof Ship }[] = [
  { title: 'Pages', type: 'Page', icon: FileText }, { title: 'Sections', type: 'Section', icon: FileText }, { title: 'Fleet', type: 'Vessel', icon: Ship },
  { title: 'Routes', type: 'Route', icon: Route }, { title: 'Projects', type: 'Project', icon: Container },
  { title: 'Services', type: 'Service', icon: Settings }, { title: 'News', type: 'News', icon: Newspaper },
];
const enquiryStatuses: Enquiry['status'][] = ['New', 'In progress', 'Resolved'];
const blankRecord = (type: ContentRecord['type']): ContentRecord => ({ id: '', type, title: '', titleTh: '', description: '', descriptionTh: '', image: '', category: '', status: 'Published', revision: 0 });
const corePage = (record: ContentRecord) => record.type === 'Page' && (corePageIds as readonly string[]).includes(record.id);
const MAX_ATTEMPTS = 3;
const REFRESH_COOLDOWN_MS = 3000;
type MediaUsage = { media: { id: string; title: string }; usages: { type: ContentRecord['type'] | 'User'; id: string; title: string; titleTh?: string; status: ContentRecord['status']; parentId?: string; deletedAt?: string; fields: ('image' | 'mobileImage' | 'gallery' | 'heroSlides' | 'avatar')[] }[] };
function mediaUsageHref(usage: { type: ContentRecord['type'] | 'User'; id: string; parentId?: string; deletedAt?: string; fields?: string[] }) {
  const key = `${usage.type}:${usage.id}`;
  if (usage.deletedAt) return `/cms/trash?item=${encodeURIComponent(key)}`;
  if (usage.type === 'User') return `/cms/users?edit=${encodeURIComponent(key)}`;
  if (usage.type === 'Page' && usage.id === 'home' && usage.fields?.includes('heroSlides')) return '/cms/slides';
  const params = new URLSearchParams();
  if (usage.type === 'Page') params.set('page', usage.id);
  if (usage.type === 'Section' && usage.parentId) params.set('page', usage.parentId);
  params.set('edit', key);
  return `${cmsPathForView('content', usage.type)}?${params.toString()}`;
}
const emptySummary: CmsContentSummary = {
  counts: Object.fromEntries(contentTypes.map(type => [type, { total: 0, published: 0, draft: 0 }])) as CmsContentSummary['counts'],
  categories: {}, nextOrder: {}, recent: [], trashCount: 0,
};
const MEDIA_PAGE_SIZE = 30;
const fieldNames: Record<string, string> = { caption: 'English image caption', captionTh: 'Thai image caption', parentId: 'Parent page', order: 'Display order', eyebrow: 'English eyebrow', eyebrowTh: 'Thai eyebrow', icon: 'Icon', mobileImage: 'Mobile image', gallery: 'Gallery images', bodyHeading: 'English content heading', bodyHeadingTh: 'Thai content heading', origin: 'Origin port', destination: 'Destination port', waypoints: 'Route coordinates', id: 'URL identifier', type: 'Content type', title: 'English title', titleTh: 'Thai title', description: 'English summary', descriptionTh: 'Thai summary', image: 'Content image', category: 'English category', categoryTh: 'Thai category', status: 'Status', body: 'English content', bodyTh: 'Thai content', date: 'Date', imageAlt: 'English image description', imageAltTh: 'Thai image description', companyName: 'English company name', companyNameTh: 'Thai company name', officeAddress: 'English office address', officeAddressTh: 'Thai office address', phone: 'Public phone number', email: 'Public email address', mapUrl: 'Map link' };
const specFieldNames: Record<string, string> = { imo: 'IMO number', yearBuilt: 'Year built', lengthM: 'Length overall', beamM: 'Beam', draftM: 'Vessel draft', deadweightT: 'Deadweight', capacityTeu: 'Container capacity', flag: 'English flag state', flagTh: 'Thai flag state', availability: 'English availability', availabilityTh: 'Thai availability' };
const validationMessages = (issues: { path: PropertyKey[]; message: string }[]) => issues.map(issue => `${issue.path[0] === 'vesselSpecs' ? specFieldNames[String(issue.path[1])] || 'Vessel specifications' : fieldNames[String(issue.path[0])] || 'Content'}: ${issue.message}`).join(' ');
const notificationLabels = { not_configured: 'Email not configured', pending: 'Email pending', sending: 'Sending email', sent: 'Email accepted', failed: 'Email failed', review: 'Email needs review' };

function notificationRetryPending(retryAt: string) { return Date.parse(retryAt) > Date.now(); }

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
    {open && <div className={styles.dialogBody}><div className={styles.dialogHeading}><h2>{t(title)}</h2><div className={styles.dialogHeadingControls}><button ref={closeRef} type="button" className={styles.iconButton} aria-label={t("Close {title}", { title: t(title) })} disabled={busy} onClick={onClose}><X size={22} /></button></div></div>{actions ? <><div className={styles.dialogScroll} tabIndex={0} role="region" aria-label={t("{title} fields", { title: t(title) })}>{children}</div><div className={styles.dialogActions}>{actions}</div></> : children}</div>}
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
    <div className={styles.dialogBody}><div className={styles.dialogHeading}><button ref={closeRef} type="button" className={styles.iconButton} aria-label={t("Close CMS navigation")} onClick={onClose}><X size={22} /></button></div>{children}</div>
  </dialog>;
}
function Brand() { const { t, locale } = useCmsLocale(); return <Link href={href(locale)} target="_blank" rel="noopener noreferrer" className={styles.logo} aria-label={t("Moe Navigation Co.,Ltd. home in a new tab")}><BrandMark className={styles.brandLogo} locale={locale} /></Link>; }
async function stageImage(image: PreparedImage, submissionId: string): Promise<MediaItem> {
  const data = new FormData(); data.append('file', image.blob, image.filename); data.append('submissionId', submissionId);
  return (await cmsRequest<{ media: MediaItem }>('/api/cms/media', { method: 'POST', body: data })).media;
}

export default function CmsWorkspace() {
  const { t, locale } = useCmsLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { section, type: contentType } = cmsViewFromPathname(pathname, searchParams);
  const dateLocale = locale === 'th' ? 'th-TH' : 'en-GB';
  const formatDate = (value?: string) => value ? new Date(value).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const recordTitle = (record: { title: string; titleTh?: string }) => locale === 'th' ? record.titleTh || record.title : record.title || record.titleTh || '';
  const localizedPageLabel = (page: ContentRecord) => (corePageIds as readonly string[]).includes(page.id) ? t(cmsPageLabel(page)) : recordTitle(page);
  const currentTrashTarget = useRef<string | null>(null);
  useEffect(() => { currentTrashTarget.current = section === 'trash' ? searchParams.get('item') : null; }, [section, searchParams]);
  const [user, setUser] = useState<User | null>(null);
  const emailSetup = useCmsEmailSetup(user?.id ?? null, Boolean(user) && (section === 'inbox' || section === 'setting'));
  const [sessionReady, setSessionReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const workspaceLoad = useRef<AbortController | null>(null);
  const mediaPageRequest = useRef<AbortController | null>(null);
  const lastManualRefresh = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshCoolingDown, setRefreshCoolingDown] = useState(false);
  const [refreshFailures, setRefreshFailures] = useState<{ area: string; message: string }[]>([]);
  const [busy, setBusy] = useState('');
  const notificationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => {
    if (!notificationRequest.current) return;
    notificationRequest.current.abort();
    notificationRequest.current = null;
    setBusy(current => current === 'Sending notification…' ? '' : current);
  }, [user?.id]);
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [summary, setSummary] = useState<CmsContentSummary>(emptySummary);
  const [contentRevision, setContentRevision] = useState(0);
  const [dashboardRevision, setDashboardRevision] = useState(0);
  const [uploadedMedia, setUploadedMedia] = useState<MediaItem[]>([]);
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [websiteDetails, setWebsiteDetails] = useState<{ saved: SiteSettings; draft: SiteSettings } | null>(null);
  const [slidesDirty, setSlidesDirty] = useState(false);
  const [slidesBusy, setSlidesBusy] = useState(false);
  const [slidesDraft] = useState(() => new CmsSlidesDraftStore());
  const [settingsError, setSettingsError] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const type = contentType;
  const [enquiryStatus, setEnquiryStatus] = useState<InboxStatus>('All');
  const [search, setSearch] = useState('');
  const workspaceSearchRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [confirmation, setConfirmation] = useState<{ message: string; action: string; params?: Record<string, string | number> } | null>(null);
  const confirmationResolver = useRef<((accepted: boolean) => void) | null>(null);
  const [editing, setEditing] = useState<ContentRecord | null>(null);
  const editLinkHandled = useRef<string | null>(null);
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
  const [mediaSearch, setMediaSearch] = useState('');
  const [mediaSearchRevision, setMediaSearchRevision] = useState(0);
  const [mediaPage, setMediaPage] = useState(0);
  const mediaSearchRef = useRef<HTMLInputElement>(null);
  const [mediaError, setMediaError] = useState('');
  const [mediaUploadOpen, setMediaUploadOpen] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState('');
  const [mediaNotice, setMediaNotice] = useState('');
  const [mediaUsage, setMediaUsage] = useState<{ item: MediaItem; result: MediaUsage | null; loading: boolean; error: string } | null>(null);
  const mediaUsageRequest = useRef<AbortController | null>(null);
  const [preparedMedia, setPreparedMedia] = useState<PreparedImage | null>(null);
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaPreparing, setMediaPreparing] = useState(false);
  const [mediaAttempts, setMediaAttempts] = useState(0);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [enquiryError, setEnquiryError] = useState('');
  const [enquiryNotice, setEnquiryNotice] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importSnapshot, setImportSnapshot] = useState<LegacySnapshot | null>(null);
  const [importRecords, setImportRecords] = useState<LegacyRecord[]>([]);
  const [verifiedLocal, setVerifiedLocal] = useState<string[]>([]);
  const [verifiedLocalMedia, setVerifiedLocalMedia] = useState(0);
  const [localArchive, setLocalArchive] = useState(false);
  const legacyPrepared = useRef(new Map<string, PreparedImage>());
  const [importError, setImportError] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [editorBaseline, setEditorBaseline] = useState<ContentRecord | null>(null);
  const editorSubmission = useRef(''); const mediaSubmission = useRef('');
  const attemptedEditor = useRef(''); const attemptedMedia = useRef(''); const reviewedLegacy = useRef<LegacyRecord | null>(null);
  const editorStaged = useRef(new Map<string, MediaItem>()); const libraryStaged = useRef<MediaItem | null>(null);
  const uploadVersion = useRef(0); const mediaVersion = useRef(0);
  const importSubmissions = useRef(new Map<string, { id: string; staged?: MediaItem; attempts: number }>());
  const inboxStatus: InboxStatus = section === 'inbox' ? enquiryStatus : 'All';
  const inbox = useCmsInbox(Boolean(user), section === 'inbox' ? search : '', inboxStatus);
  const { refresh: refreshInbox } = inbox;
  const collectionType = section === 'content' && !['All', 'Page', 'Section'].includes(type) ? type as Exclude<ContentRecord['type'], 'Page' | 'Section'> : null;
  const collectionPage = useCmsCollectionPage(collectionType, search, Boolean(user), contentRevision);
  const media = uploadedMedia;
  const mediaSearching = Boolean(mediaSearch.trim());
  const searchedMedia = useCmsMediaSearch(mediaSearch, Boolean(user) && section === 'media', mediaSearchRevision);
  const filteredMedia = mediaSearching ? searchedMedia.items : media;
  const activeMediaCursor = mediaSearching ? searchedMedia.nextCursor : mediaCursor;
  const mediaPageCount = Math.max(1, Math.ceil(filteredMedia.length / MEDIA_PAGE_SIZE));
  const currentMediaPage = Math.min(mediaPage, mediaPageCount - 1);
  const mediaPageStart = currentMediaPage * MEDIA_PAGE_SIZE;
  const visibleMedia = filteredMedia.slice(mediaPageStart, mediaPageStart + MEDIA_PAGE_SIZE);
  const editorDirty = Boolean(editing && (recordImageUrls(editing).some(url => Boolean(editorImages[url])) || routeText !== (original?.waypoints || []).map(point => point.join(', ')).join('\n') || JSON.stringify(editing) !== JSON.stringify(original || editorBaseline || blankRecord(editing.type))));
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
    mediaPageRequest.current?.abort();
    mediaPageRequest.current = null;
    setBusy(current => current === 'Loading more images…' ? '' : current);
    const controller = new AbortController(); workspaceLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]);
    setLoading(true); setRefreshFailures([]); setError('');
    setContentRevision(value => value + 1);
    setMediaSearchRevision(value => value + 1);
    const results = await Promise.allSettled([cmsRequest<{ records: ContentRecord[]; summary: CmsContentSummary }>('/api/cms/content?scope=overview', { signal }), cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>('/api/cms/media', { signal }), cmsRequest<{ settings: SiteSettings }>('/api/cms/settings', { signal })]);
    if (controller.signal.aborted) return;
    if (results[0].status === 'fulfilled') { setRecords(results[0].value.records); setSummary(results[0].value.summary); }
    if (results[1].status === 'fulfilled') { setUploadedMedia(results[1].value.media); setMediaCursor(results[1].value.nextCursor); }
    if (results[2].status === 'fulfilled') { const settings = results[2].value.settings; setWebsiteDetails(current => refreshWebsiteDetailsDraft(current, settings)); }
    setRefreshFailures(results.flatMap((result, index) => result.status === 'rejected' ? [{ area: ['Content', 'Media library', 'Website details'][index], message: cmsErrorText(result.reason) }] : []));
    setWorkspaceReady(true); setLoading(false); workspaceLoad.current = null;
  }, [refreshInbox]);
  function refreshWorkspace() {
    if (workspaceLoad.current || busy || searchedMedia.loadingMore || Date.now() - lastManualRefresh.current < REFRESH_COOLDOWN_MS) return;
    lastManualRefresh.current = Date.now();
    setRefreshCoolingDown(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { setRefreshCoolingDown(false); refreshTimer.current = null; }, REFRESH_COOLDOWN_MS);
    void load();
  }
  function invalidateWorkspaceRefresh() { workspaceLoad.current?.abort(); workspaceLoad.current = null; setLoading(false); }
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);
  useEffect(() => {
    let cancelled = false;
    cmsRequest<{ user: User | null }>('/api/cms/session').then(result => { if (!cancelled) { setUser(result.user); if (result.user) void load(); } }).catch(cause => { if (!cancelled) setLoginError(cmsErrorText(cause)); }).finally(() => { if (!cancelled) setSessionReady(true); });
    function expired() { invalidateWorkspaceRefresh(); refreshInbox(); mediaUsageRequest.current?.abort(); setMediaUsage(null); setUser(null); setUserSettingsOpen(false); setLoginError('Your session has expired. Sign in again to continue. Your open editor is preserved.'); }
    window.addEventListener('moe-cms-session-expired', expired);
    return () => { cancelled = true; workspaceLoad.current?.abort(); window.removeEventListener('moe-cms-session-expired', expired); };
  }, [load, refreshInbox]);
  useEffect(() => {
    if (!editorDirty && !preparedMedia && !settingsDirty && !preparing && !mediaPreparing && !busy) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [editorDirty, preparedMedia, settingsDirty, preparing, mediaPreparing, busy]);
  useEffect(() => () => { Object.values(imagesRef.current).forEach(image => URL.revokeObjectURL(image.preview)); legacyPrepared.current.forEach(image => URL.revokeObjectURL(image.preview)); }, []);
  const resetEditorImages = useCallback(() => { Object.values(imagesRef.current).forEach(image => URL.revokeObjectURL(image.preview)); imagesRef.current = {}; setEditorImages({}); }, []);
  useEffect(() => () => { if (preparedMedia) URL.revokeObjectURL(preparedMedia.preview); }, [preparedMedia]);

  async function login(username: string, password: string, challengeId: string, challengePosition: number): Promise<string | null> {
    if (busy) return null;
    setBusy('login'); setLoginError('');
    try { const result = await cmsRequest<{ user: User }>('/api/cms/login', { method: 'POST', body: JSON.stringify({ username, password, challengeId, challengePosition }) }); setUser(result.user); await load(); window.scrollTo({ top: 0, behavior: 'instant' }); return result.user.username; }
    catch (cause) { setLoginError(cmsErrorText(cause)); return null; } finally { setBusy(''); }
  }
  async function logout() {
    if (busy || slidesBusy || ((editorDirty || preparedMedia || settingsDirty || slidesDirty || preparing || mediaPreparing) && !await confirmAction('Your unsaved editor changes, prepared images and website details will be discarded. Saved content stays available.', 'Sign out & discard'))) return;
    setBusy('logout');
    try {
      if (attemptedEditor.current && await reconcileEditor() === 'pending') return;
      if (attemptedMedia.current && await reconcileMedia() === 'pending') return;
      await slidesDraft.cancelUploads();
      await cmsRequest('/api/cms/logout', { method: 'POST', body: '{}' });
      slidesDraft.discard(); setSlidesDirty(false); setSlidesBusy(false);
      invalidateWorkspaceRefresh();
      uploadVersion.current++; mediaVersion.current++;
      setPreparing(false); setMediaPreparing(false); closeMediaUsage(); setUser(null); setWorkspaceReady(false); setDrawerOpen(false); setUserSettingsOpen(false); setEditing(null); setOriginal(null);
      resetEditorImages(); setPreparedMedia(null); setMediaUploadOpen(false); setMediaUploadError(''); setSelectedEnquiry(null); setImportOpen(false); setDeleteRecord(null);
      setWebsiteDetails(null); setSettingsError(''); setSettingsNotice(''); setRecords([]); setSummary(emptySummary); setRefreshFailures([]); refreshInbox(); setUploadedMedia([]); setMediaCursor(null); setMediaPage(0);
      setNotice(''); setError(''); setLoginError(''); setEnquiryStatus('All'); setSearch('');
    }
    catch (cause) { setError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  function clearFilters() {
    setEnquiryStatus('All'); setSearch('');
    if (section === 'trash' && searchParams.has('item')) router.replace('/cms/trash', { scroll: false });
    workspaceSearchRef.current?.focus({ preventScroll: true });
  }
  function navigate(next: Section, nextType = 'All') {
    setEnquiryStatus('All'); setSearch('');  setDrawerOpen(false); setUserSettingsOpen(false); setMediaUploadOpen(false);
    const destination = cmsPathForView(next, nextType);
    const current = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
    if (current !== destination) router.push(destination, { scroll: false });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const openExistingEditor = useCallback((record: ContentRecord) => {
    setEditorBaseline(record); setOriginal(record); setEditing({ ...record }); resetEditorImages(); setRouteText((record.waypoints || []).map(point => point.join(', ')).join('\n')); setEditorError(''); setEditorConflict(false); setEditorAttempts(0); editorSubmission.current = crypto.randomUUID(); editorStaged.current.clear(); attemptedEditor.current = ''; reviewedLegacy.current = null;
  }, [resetEditorImages]);
  function openEditor(record?: ContentRecord) {
    if (record) { openExistingEditor(record); return; }
    if (!record && (type === 'All' || type === 'Page' || type === 'Section')) return;
    const draftType = type === 'All' ? 'News' : type as ContentRecord['type'];
    const draft = newCollectionDraft(draftType, records, new Date(), summary.nextOrder[draftType]); setEditorBaseline(draft); setOriginal(null); setEditing(draft); resetEditorImages(); setRouteText(''); setEditorError(''); setEditorConflict(false); setEditorAttempts(0); editorSubmission.current = crypto.randomUUID(); editorStaged.current.clear(); attemptedEditor.current = ''; reviewedLegacy.current = null;
  }
  const linkedEdit = searchParams.get('edit');
  useEffect(() => {
    if (!linkedEdit) { editLinkHandled.current = null; return; }
    if (!user || !workspaceReady || section !== 'content' || editLinkHandled.current === linkedEdit) return;
    const match = /^(Page|Section|Vessel|Route|Project|Service|News):([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(linkedEdit);
    if (!match || cmsPathForView('content', match[1]) !== pathname) return;
    const controller = new AbortController();
    editLinkHandled.current = linkedEdit;
    void cmsRequest<{ record: ContentRecord }>(`/api/cms/content/item?type=${encodeURIComponent(match[1])}&id=${encodeURIComponent(match[2])}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) openExistingEditor(result.record); })
      .catch(cause => { if (!controller.signal.aborted) setError(cmsErrorText(cause)); });
    return () => controller.abort();
  }, [linkedEdit, openExistingEditor, pathname, section, user, workspaceReady]);
  function updateEditor(patch: Partial<ContentRecord>) {
    setEditing(current => current ? { ...current, ...patch } : current);
  }
  function acceptRecord(record: ContentRecord) {
    invalidateWorkspaceRefresh();
    if (record.type === 'Page' || record.type === 'Section') {
      setRecords(current => [record, ...current.filter(item => legacyRecordKey(item) !== legacyRecordKey(record))]);
    } else if (!record.deletedAt) {
      setSummary(current => ({
        ...current,
        nextOrder: { ...current.nextOrder, [record.type]: Math.max(current.nextOrder[record.type] ?? 0, Math.min(10000, (record.order ?? 0) + 1)) },
      }));
    }
    setContentRevision(value => value + 1);
    refreshContentOverview();
  }
  function refreshContentOverview() {
    void cmsRequest<{ records: ContentRecord[]; summary: CmsContentSummary }>('/api/cms/content?scope=overview')
      .then(result => { setRecords(result.records); setSummary(result.summary); setRefreshFailures(current => current.filter(failure => failure.area !== 'Content')); })
      .catch(cause => setRefreshFailures([{ area: 'Content', message: cmsErrorText(cause) }]));
  }
  function committedImageResolver(record: ContentRecord) {
    const committedUrls = new Set(recordImageUrls(record));
    const savedImages = new Map([...editorStaged.current].filter(([, media]) => committedUrls.has(media.url)));
    return (url: string) => savedImages.get(url)?.url || url;
  }
  async function finishEditor(record: ContentRecord) {
    acceptRecord(record);
    if (reviewedLegacy.current) { try { await rememberLegacyRecord(reviewedLegacy.current, record); } catch { setImportError('Content saved, but the local migration receipt could not be stored. Keep or export your local copy.'); } }
    setNotice('“' + record.title + '” saved.'); setEditing(null); resetEditorImages(); attemptedEditor.current = ''; editorStaged.current.clear(); if (record.type === 'Page' || record.type === 'Section') {
      const selected = record.type === 'Page' ? record.id : record.parentId;
      const destination = selected ? `/cms/pages?page=${encodeURIComponent(selected)}` : '/cms/pages';
      if (`${pathname}?${searchParams.toString()}` !== destination) router.push(destination, { scroll: false });
    } else navigate('content', record.type);
    void cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>('/api/cms/media').then(result => { setUploadedMedia(result.media); setMediaCursor(result.nextCursor); }).catch(() => {});
  }
  async function reconcileEditor(allowRetry = true, submitted?: ContentRecord): Promise<'committed' | 'aborted' | 'pending'> {
    if (!attemptedEditor.current) { if (allowRetry) setEditorAttempts(0); return 'aborted'; }
    setBusy('Checking saved content…');
    const result = await resolveSubmission(editorSubmission.current);
    if (result.status === 'committed' && result.record) {
      let currentFingerprint = ''; try { currentFingerprint = JSON.stringify(submitted || (editing ? { ...editing, status: 'Published', ...(editing.type === 'Route' ? { waypoints: parseRouteCoordinates(routeText) } : {}) } : null)); } catch { /* Keep partially edited coordinate text. */ }
      if (editing && currentFingerprint !== attemptedEditor.current) { acceptRecord(result.record); setOriginal(result.record); const savedImage = committedImageResolver(result.record); setEditing(current => current ? mapRecordImages({ ...current, revision: result.record!.revision }, savedImage) : current); editorSubmission.current = crypto.randomUUID(); editorStaged.current.clear(); attemptedEditor.current = ''; setEditorAttempts(0); setEditorConflict(false); setEditorError('Your earlier save succeeded. Your newer unsaved changes are still in this editor; review and save them when ready.'); return 'aborted'; }
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
    try { if (attemptedEditor.current && await reconcileEditor() === 'pending') return; uploadVersion.current++; setPreparing(false); setEditing(null); resetEditorImages(); if (linkedEdit) { const params = new URLSearchParams(searchParams.toString()); params.delete('edit'); router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`, { scroll: false }); } }
    catch (cause) { setEditorError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || preparing || busy || editorAttempts >= MAX_ATTEMPTS) return;
    const identified = !original && !editing.id ? { ...editing, id: createCollectionId(editing.type, editing.title, editorSubmission.current) } : editing;
    if (identified !== editing) setEditing(identified);
    let candidate: ContentRecord;
    try { candidate = { ...identified, status: 'Published', ...(editing.type === 'Route' ? { waypoints: parseRouteCoordinates(routeText) } : {}) }; } catch (cause) { setEditorError(cmsErrorText(cause)); return; }
    const validated = recordSchema.safeParse(mapRecordImages(candidate, url => editorImages[url] ? 'prepared-image' : url));
    if (!validated.success) { setEditorError(validationMessages(validated.error.issues)); return; }
    setBusy('Saving content…'); setEditorError('');
    let attemptsForSubmission = editorAttempts;
    try {
      let fingerprint = JSON.stringify(candidate); let expectedRevision = original?.revision ?? null;
      if (attemptedEditor.current && attemptedEditor.current !== fingerprint) {
        const result = await resolveSubmission(editorSubmission.current);
        if (result.status === 'pending' || result.pending) { setEditorAttempts(MAX_ATTEMPTS); throw new Error('Your earlier save is still pending. Check saved content before saving these changes.'); }
        if (result.status === 'committed' && result.record) {
          acceptRecord(result.record); setOriginal(result.record); expectedRevision = result.record.revision;
          // A newer text edit can reuse photos committed by the earlier save.
          // Only reuse URLs confirmed on that saved record, never uncertain uploads.
          const savedImage = committedImageResolver(result.record);
          candidate = mapRecordImages(candidate, savedImage);
          setEditing(current => current ? mapRecordImages(current, savedImage) : current);
          fingerprint = JSON.stringify(candidate);
        }
        else if (result.status !== 'aborted') throw new Error('The earlier submission could not be closed. Check saved content before trying again.');
        editorSubmission.current = crypto.randomUUID(); editorStaged.current.clear(); setEditorAttempts(0); attemptsForSubmission = 0;
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
      if (!(cause instanceof CmsRequestError) || cause.status === 0 || cause.status >= 500) { const attempts = attemptsForSubmission + 1; setEditorAttempts(attempts); if (attempts >= MAX_ATTEMPTS) { try { await reconcileEditor(false, candidate); } catch (recoveryError) { setEditorError(cmsErrorText(recoveryError) + ' The save outcome is uncertain. Keep this editor open and check saved content.'); } } }
    } finally { setBusy(''); }
  }
  async function recoverEditor() {
    if (!editing || busy) return;
    if (editorConflict && !await confirmAction('Loading the latest saved version replaces your unsaved fields. Cancel and download your unsaved text first if you need a copy.', 'Load saved version')) return;
    setBusy('Checking saved content…');
    try {
      const outcome = await reconcileEditor(); if (outcome !== 'aborted' || !editorConflict) return;
      const result = await cmsRequest<{ records: ContentRecord[] }>('/api/cms/content'); setRecords(result.records); const saved = result.records.find(item => legacyRecordKey(item) === legacyRecordKey(editing));
      if (!saved || saved.deletedAt) throw new Error('This record is no longer available. Your unsaved changes are still here.'); openEditor(saved);
    } catch (cause) { setEditorError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  function downloadDraft() {
    if (!editing) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(createEditorDraftExport(editing, routeText), null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `unsaved-${editing.id || 'content'}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  async function changeRecord(record: ContentRecord, action: 'trash' | 'restore') {
    if (busy) return; setBusy(action); setError('');
    try { const result = await cmsRequest<{ record: ContentRecord }>('/api/cms/content/action', { method: 'POST', body: JSON.stringify({ id: record.id, type: record.type, expectedRevision: record.revision, action }) }); acceptRecord(result.record); setDeleteRecord(null); setNotice(`“${record.title}” ${action === 'trash' ? 'moved to Trash. You can restore it within 30 days.' : 'restored.'}`); if (action === 'restore' && targetedTrash === `${record.type}:${record.id}`) router.push(mediaUsageHref(result.record), { scroll: false }); }
    catch (cause) { setError(cmsErrorText(cause)); setDeleteRecord(null); } finally { setBusy(''); }
  }
  function handleTrashChange(item: CmsTrashItem, restored?: ContentRecord) {
    invalidateWorkspaceRefresh();
    if (restored) acceptRecord(restored);
    else { setContentRevision(value => value + 1); refreshContentOverview(); }
    if (item.kind === 'Image') {
      setMediaSearchRevision(value => value + 1);
      void refreshMediaLibrary().catch(cause => setMediaError(cmsErrorText(cause)));
    }
    if (currentTrashTarget.current === item.key) {
      if (restored) router.push(mediaUsageHref(restored), { scroll: false });
      else router.replace('/cms/trash', { scroll: false });
    }
  }
  async function chooseEditorImage(file: File, target: ImageTarget = 'image') {
    const version = ++uploadVersion.current; setPreparing(true); setEditorError('');
    try { const image = await prepareCmsImage(file); if (version !== uploadVersion.current) { URL.revokeObjectURL(image.preview); return; } imagesRef.current = { ...imagesRef.current, [image.preview]: image }; setEditorImages(imagesRef.current); setEditing(current => !current ? current : typeof target === 'number' ? { ...current, gallery: current.gallery?.map((entry, index) => index === target ? { ...entry, url: image.preview } : entry) } : { ...current, [target]: image.preview }); }
    catch (cause) { if (version === uploadVersion.current) setEditorError(cmsErrorText(cause)); } finally { if (version === uploadVersion.current) setPreparing(false); }
  }
  function finishMedia(items: MediaItem[], closeUpload = true) { invalidateWorkspaceRefresh(); setUploadedMedia(current => [...items, ...current.filter(item => !items.some(saved => saved.id === item.id))]); setMediaPage(0); setMediaSearchRevision(value => value + 1); setPreparedMedia(null); setMediaTitle(''); setMediaUploadError(''); if (closeUpload) setMediaUploadOpen(false); attemptedMedia.current = ''; libraryStaged.current = null; setMediaNotice('Image saved to the library. It is ready to use in your content.'); }
  async function reconcileMedia(allowRetry = true, closeUpload = true): Promise<'committed' | 'aborted' | 'pending'> {
    if (!attemptedMedia.current) { if (allowRetry) setMediaAttempts(0); return 'aborted'; }
    setBusy('Checking saved media…'); const result = await resolveSubmission(mediaSubmission.current);
    if (result.status === 'committed') { if (!result.media?.length) throw new Error('The saved image could not be identified. Refresh the library before retrying.'); finishMedia(result.media, closeUpload); return 'committed'; }
    if (result.status === 'pending' || result.pending) { setMediaAttempts(MAX_ATTEMPTS); setMediaUploadError('The previous upload is still being checked. Your prepared image is preserved. Check saved media again before retrying.'); return 'pending'; }
    if (result.status !== 'aborted') throw new Error('The previous upload could not yet be closed safely. Check saved media again.');
    libraryStaged.current = null; mediaSubmission.current = crypto.randomUUID(); attemptedMedia.current = ''; if (allowRetry) setMediaAttempts(0);
    setMediaUploadError('The image did not save. Its unreferenced upload was removed. Retry to upload the prepared image again.' + (result.failed ? ' Manual Cleanup may be needed for an unfinished deletion.' : '')); return 'aborted';
  }
  async function chooseLibraryImage(file?: File) {
    if (!file || busy) return; const version = ++mediaVersion.current; setMediaPreparing(true); setMediaUploadError(''); setMediaNotice('');
    try {
      if (attemptedMedia.current) { setBusy('Checking previous upload…'); if (await reconcileMedia(true, false) === 'pending') return; }
      const image = await prepareCmsImage(file); if (version !== mediaVersion.current) { URL.revokeObjectURL(image.preview); return; } setPreparedMedia(image); setMediaTitle(file.name.replace(/\.[^.]+$/, '')); libraryStaged.current = null; mediaSubmission.current = crypto.randomUUID(); setMediaAttempts(0);
    } catch (cause) { if (version === mediaVersion.current) setMediaUploadError(cmsErrorText(cause)); } finally { if (version === mediaVersion.current) setMediaPreparing(false); setBusy(''); }
  }
  async function saveMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!preparedMedia || mediaPreparing || busy || mediaAttempts >= MAX_ATTEMPTS) return; setBusy('Uploading image…'); setMediaUploadError('');
    try {
      const fingerprint = preparedMedia.preview + mediaTitle.trim();
      if (attemptedMedia.current && attemptedMedia.current !== fingerprint && await reconcileMedia() !== 'aborted') return;
      attemptedMedia.current = fingerprint;
      if (!libraryStaged.current) libraryStaged.current = await stageImage(preparedMedia, mediaSubmission.current);
      setBusy('Saving media…'); const result = await cmsRequest<{ media: MediaItem }>('/api/cms/media/commit', { method: 'POST', body: JSON.stringify({ mediaId: libraryStaged.current.id, submissionId: mediaSubmission.current, title: mediaTitle.trim() }) }); finishMedia([result.media]);
    } catch (cause) { setMediaUploadError(cmsErrorText(cause)); if (!(cause instanceof CmsRequestError) || cause.status === 0 || cause.status >= 500) { const attempts = mediaAttempts + 1; setMediaAttempts(attempts); if (attempts >= MAX_ATTEMPTS) { try { await reconcileMedia(false); } catch (recoveryError) { setMediaUploadError(cmsErrorText(recoveryError) + ' The upload outcome is uncertain. Check saved media before retrying.'); } } } } finally { setBusy(''); }
  }
  async function recoverMedia() { if (busy) return; setBusy('Checking saved media…'); try { await reconcileMedia(); } catch (cause) { setMediaUploadError(cmsErrorText(cause)); } finally { setBusy(''); } }
  async function refreshMediaLibrary() {
    invalidateWorkspaceRefresh();
    refreshContentOverview();
    const result = await cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>('/api/cms/media');
    setUploadedMedia(result.media); setMediaCursor(result.nextCursor); setMediaPage(0); setMediaSearchRevision(value => value + 1);
  }
  async function cleanupMedia() {
    if (busy || !await confirmAction('Move saved images with no content usage to Media Trash? Images added in the last hour and images used by content or content in Trash stay in the library. Old unfinished uploads will be removed.', 'Clean unused images')) return;
    setBusy('Cleaning unused images…'); setMediaError('');
    try {
      const result = await cmsRequest<{ trashed: number; deleted: number; failed: number }>('/api/cms/media/cleanup', { method: 'POST', body: '{}' });
      invalidateWorkspaceRefresh(); refreshContentOverview();
      setMediaNotice(`${result.trashed} unused saved images moved to Media Trash. ${result.deleted} unfinished uploads removed.${result.failed ? ` ${result.failed} unfinished uploads could not be removed; try again later.` : ''}`);
      try { await refreshMediaLibrary(); }
      catch { setMediaError('Cleanup finished, but the library could not refresh. Use Refresh to load the latest images.'); }
    }
    catch (cause) { setMediaError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  async function loadMoreMedia() {
    if (!mediaCursor || busy || workspaceLoad.current || mediaPageRequest.current) return;
    const controller = new AbortController(); mediaPageRequest.current = controller;
    setBusy('Loading more images…'); setMediaError('');
    try {
      const result = await cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>(`/api/cms/media?cursor=${encodeURIComponent(mediaCursor)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setUploadedMedia(current => [...current, ...result.media.filter(item => !current.some(existing => existing.id === item.id))]);
      setMediaCursor(result.nextCursor);
    } catch (cause) {
      if (!controller.signal.aborted) { setMediaError(cmsErrorText(cause)); setEditorError(cmsErrorText(cause)); }
    } finally {
      if (mediaPageRequest.current === controller) { mediaPageRequest.current = null; setBusy(''); }
    }
  }
  async function moveMediaToTrash(item: { id: string; title: string }) {
    if (busy || !await confirmAction(`Move “${item.title}” to Media Trash? You can restore it later. Images used by content or content in Trash cannot be moved.`, 'Move to Media Trash')) return;
    setBusy('Moving image to Media Trash…'); setMediaError('');
    try { await cmsRequest('/api/cms/media/trash', { method: 'POST', body: JSON.stringify({ mediaId: item.id }) }); setUploadedMedia(current => current.filter(image => image.id !== item.id)); setMediaSearchRevision(value => value + 1); setMediaNotice('Image moved to Media Trash.'); invalidateWorkspaceRefresh(); refreshContentOverview(); try { await refreshMediaLibrary(); } catch { setMediaError('Image moved to Media Trash, but the library could not refresh. Use Refresh to load the latest images.'); } }
    catch (cause) { setMediaError(cmsErrorText(cause)); } finally { setBusy(''); }
  }
  function closeMediaUsage() { mediaUsageRequest.current?.abort(); mediaUsageRequest.current = null; setMediaUsage(null); }
  async function showMediaUsage(item: MediaItem) {
    mediaUsageRequest.current?.abort();
    const controller = new AbortController(); mediaUsageRequest.current = controller;
    setMediaUsage({ item, result: null, loading: true, error: '' });
    try {
      const result = await cmsRequest<MediaUsage>(`/api/cms/media/usage?mediaId=${encodeURIComponent(item.id)}`, { signal: controller.signal });
      if (!controller.signal.aborted) setMediaUsage({ item, result, loading: false, error: '' });
    } catch (cause) {
      if (!controller.signal.aborted) setMediaUsage({ item, result: null, loading: false, error: cmsErrorText(cause) });
    } finally { if (mediaUsageRequest.current === controller) mediaUsageRequest.current = null; }
  }
  function openEnquiry(enquiry: Enquiry) {
    if (busy) return;
    setSelectedEnquiry(enquiry); setEnquiryError(''); setEnquiryNotice('');
    if (enquiry.status === 'New') void changeEnquiry(enquiry, 'In progress');
  }
  async function changeEnquiry(enquiry: Enquiry, nextStatus: Enquiry['status']) {
    if (busy || enquiry.status === nextStatus) return; setBusy('Updating enquiry…'); setEnquiryError(''); setEnquiryNotice('');
    try { const result = await cmsRequest<{ enquiry: Enquiry }>('/api/cms/inbox', { method: 'PATCH', body: JSON.stringify({ id: enquiry.id, expectedRevision: enquiry.revision, status: nextStatus }) }); acceptEnquiry(result.enquiry); setNotice('Enquiry status updated.'); }
    catch (cause) { setEnquiryError(cmsErrorText(cause) + (cause instanceof CmsRequestError && cause.status === 409 ? ' Refresh this enquiry to load its latest status before trying again.' : '')); } finally { setBusy(''); }
  }
  function acceptEnquiry(enquiry: Enquiry) {
    refreshInbox();
    setDashboardRevision(value => value + 1);
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
    const notification = enquiry.notification;
    if (notificationRequest.current || busy || !emailSetup.canSend || !notification || notification.attempts >= 3 || !['not_configured', 'failed', 'pending'].includes(notification.status) || notification.retryAt && notificationRetryPending(notification.retryAt)) return;
    const controller = new AbortController();
    notificationRequest.current = controller;
    setBusy('Sending notification…'); setEnquiryError(''); setEnquiryNotice('');
    try {
      const result = await cmsRequest<{ enquiry: Enquiry }>('/api/cms/inbox/notify', { method: 'POST', body: JSON.stringify({ id: enquiry.id }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
      if (controller.signal.aborted || notificationRequest.current !== controller) return;
      acceptEnquiry(result.enquiry);
    } catch (cause) {
      if (!controller.signal.aborted && notificationRequest.current === controller) setEnquiryError(cmsErrorText(cause));
    } finally {
      if (notificationRequest.current === controller) {
        notificationRequest.current = null;
        setBusy(current => current === 'Sending notification…' ? '' : current);
      }
    }
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
    for (const local of snapshot.records) if (await legacyRecordMatches(local, remote.find(record => legacyRecordKey(record) === legacyRecordKey(local)), library, snapshot)) verified.push(legacyRecordKey(local));
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
  const newImports = importRecords.filter(record => !record.deletedAt && !records.some(remote => legacyRecordKey(remote) === legacyRecordKey(record)));
  const changedImports = importRecords.filter(record => !verifiedLocal.includes(legacyRecordKey(record)) && (Boolean(record.deletedAt) || records.some(remote => legacyRecordKey(remote) === legacyRecordKey(record))));
  async function reviewLocal(record: LegacyRecord) {
    if (busy || !importSnapshot) return; const saved = records.find(remote => legacyRecordKey(remote) === legacyRecordKey(record));
    if (saved?.deletedAt) { setImportError('This record is in server Trash. Restore it there before reviewing the local version.'); return; }
    if (record.deletedAt && !await confirmAction('Review this local Trash item? It stays unchanged until you explicitly Save, which makes the reviewed content available on the website.', 'Review content')) return;
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
    try { for (const [key, submission] of importSubmissions.current) { const result = await resolveSubmission(submission.id); if (result.status === 'pending' || result.pending) throw new Error('An import submission is still pending. Check again shortly.'); if (result.status === 'committed') { if (result.record) { acceptRecord(result.record); const local = importRecords.find(record => legacyRecordKey(record) === legacyRecordKey(result.record!)); if (local) await rememberLegacyRecord(local, result.record); } if (key.startsWith('image:') && result.media?.[0]) await rememberLegacyMedia(key.slice(6), result.media[0].url); } else if (result.status !== 'aborted') throw new Error('The unfinished import could not be closed safely.'); importSubmissions.current.delete(key); await saveLegacySubmission(key, null); } setImportProgress('Interrupted submissions checked. Retry import to verify and continue the remaining items.'); }
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
        const existing = remote.find(item => legacyRecordKey(item) === legacyRecordKey(record)); if (existing) continue;
        setImportProgress('Importing new record: ' + record.title); const translated = await translateLegacyRecord(record, library, snapshot); const validated = recordSchema.safeParse(translated); if (!validated.success) throw new Error(validationMessages(validated.error.issues));
        const saved = await importAttempt('record:' + legacyRecordKey(record), async submission => (await cmsRequest<{ record: ContentRecord }>('/api/cms/content', { method: 'POST', body: JSON.stringify({ record: validated.data, expectedRevision: null, submissionId: submission.id }) })).record, result => result.record);
        await rememberLegacyRecord(record, saved); await saveLegacySubmission('record:' + legacyRecordKey(record), null); acceptRecord(saved); remote = [...remote, saved]; imported++;
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

  const targetedTrash = section === 'trash' ? searchParams.get('item') : null;
  const filtered = collectionPage.records;
  const contentTotal = collectionPage.total ?? 0;
  const contentShown = filtered.length;
  const contentLoading = collectionPage.loading;
  const hasContentFilters = Boolean(search.trim());
  const hasInboxFilters = Boolean(search.trim() || enquiryStatus !== 'All');
  const pages = records.filter(record => record.type === 'Page' && !record.deletedAt);
  const pageLabel = (id?: string) => id === 'shared' ? t('Shared across pages') : pages.find(page => page.id === id) ? localizedPageLabel(pages.find(page => page.id === id)!) : id || t('No parent page');
  const trashCount = summary.trashCount;
  const newEnquiries = inbox.newCount;
  const inboxItems = inbox.enquiries;
  const title = section === 'slides' ? 'Homepage slides' : section === 'trash' ? 'Trash' : section === 'inbox' ? 'Enquiries' : section === 'media' ? 'Media library' : section === 'usage' ? 'Data usage' : section === 'logs' ? 'Logs' : section === 'users' ? 'Users' : section === 'setting' ? 'Settings' : type === 'All' ? 'Dashboard' : typeOptions.find(option => option.type === type)?.title || 'Content';

  if (!sessionReady) return <LoadingScreen variant="cms" locale={locale} stage="session" />;
  if (user && !workspaceReady) return <LoadingScreen variant="cms" locale={locale} stage="workspace" />;
  if (!user) return <div className={styles.cms} lang={locale}><header className={styles.header}><Brand /><span className={styles.cmsLabel}>CMS</span><Link href={href(locale)} target="_blank" rel="noopener noreferrer" className={`button secondary ${styles.viewSite}`} aria-label={t("View website in a new tab")}>{t("View website")} </Link><CmsLanguageSwitch /></header><main className={styles.loginMain}><CmsLoginForm busy={Boolean(busy)} error={loginError} onSignIn={login} /></main></div>;

  return <div className={styles.cms} lang={locale} data-cms-root>
    <a className="skip-link" href="#cms-content">{t("Skip to content")}</a>
    <header className={`${styles.header} ${styles.workspaceHeader}`}><button className={styles.menuButton} type="button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setDrawerOpen(true); }} aria-label={t("Open CMS navigation")} aria-haspopup="dialog"><Menu /></button><Brand /><span className={styles.cmsLabel}>CMS</span><CmsLanguageSwitch /><button type="button" className={styles.avatar} title={t("Account: {name}", { name: user.username })} aria-label={t("Open user settings")} onClick={event => { event.currentTarget.focus({ preventScroll: true }); navigate('users'); setUserSettingsOpen(true); }}><CmsAvatar username={user.username} avatar={user.avatar} /></button></header>
    <main className={styles.main} id="cms-content">
      <div className={styles.intro}><div><span className="eyebrow">{t("Website workspace")}</span><h1>{t(title)}</h1><p>{section === 'slides' ? t('Arrange the banners that welcome visitors to your homepage.') : section === 'trash' ? t("Restore removed content, images, and user accounts.") : section === 'inbox' ? t("Keep track of messages from your website visitors.") : section === 'media' ? t("Upload and organize images for your website.") : section === 'usage' ? t("Check usage and remaining allowances for your website services.") : section === 'logs' ? t("Review CMS activity and account security.") : section === 'users' ? t("Manage who can sign in to the CMS.") : section === 'setting' ? t("Manage website details and content tools.") : t("Keep your website current, in English and Thai.")}</p></div><div className={styles.introActions}>{section !== 'usage' && section !== 'slides' && <button type="button" className={`button secondary ${styles.refreshButton}`} aria-label={t("Refresh workspace")} disabled={loading || Boolean(busy) || searchedMedia.loadingMore || refreshCoolingDown} onClick={refreshWorkspace}><RefreshCw className={loading ? styles.spinner : ''} size={20} /><span className={styles.refreshLabel}>{t("Refresh")}</span></button>}{section === 'media' && <button type="button" className="button" aria-haspopup="dialog" disabled={Boolean(busy) || mediaPreparing} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setMediaUploadOpen(true); }}><ImagePlus size={20} />{t("Add an image")}</button>}{section === 'content' && !['All', 'Page', 'Section'].includes(type) && <button type="button" className="button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); openEditor(); }} disabled={loading || Boolean(busy)}><Plus size={21} />{t(collectionEditorTitle(type as ContentRecord['type'], false))}</button>}</div></div>
      {loading && <div className={styles.refreshStatus} role="status"><span className={styles.refreshStatusIcon}><RefreshCw className={styles.spinner} size={19} aria-hidden="true" /></span><div><strong>{t("Refreshing workspace")}</strong><p>{t("Your current content stays available while the latest updates load.")}</p></div></div>}
      {refreshFailures.length > 0 && <div className={styles.error} role="alert"><strong>{t("Some areas could not be refreshed. Previous information remains visible.")}</strong><ul>{refreshFailures.map(failure => <li key={failure.area}><strong>{t(failure.area)}:</strong> {t(failure.message)}</li>)}</ul></div>}{error && <div className={styles.error} role="alert">{t(error)}</div>}{notice && <div className={styles.success} role="status"><Check size={19} /><span>{t(notice)}</span><button type="button" className={styles.iconButton} onClick={() => setNotice('')} aria-label={t("Dismiss notification")}><X size={18} /></button></div>}
      {section === 'content' && type === 'All' && <CmsDashboard summary={summary} newEnquiries={newEnquiries} revision={contentRevision + dashboardRevision} onNavigate={navigate} onOpenEnquiry={openEnquiry} onEdit={openEditor} disabled={Boolean(busy)} />}
      {section === 'content' && (type === 'Page' || type === 'Section') && <CmsPageManager records={records} selectedPage={searchParams.get('page') || ''} onSelect={id => router.push(id ? `/cms/pages?page=${encodeURIComponent(id)}` : '/cms/pages', { scroll: false })} onEdit={openEditor} onCollection={nextType => navigate('content', nextType)} onSettings={() => navigate('setting')} onSlides={() => navigate('slides')} disabled={loading || Boolean(busy)} />}
      {section === 'trash' && <CmsTrashManager key={user.id + ':' + (searchParams.get('kind') || '')} role={user.role} target={targetedTrash} initialKind={searchParams.get('kind')} revision={contentRevision} onClearTarget={() => router.replace('/cms/trash', { scroll: false })} onBusyChange={pending => setBusy(pending ? 'Updating Trash…' : '')} onChanged={handleTrashChange} />}
      {section === 'content' && !['All', 'Page', 'Section'].includes(type) && <div className={styles.workspace}><section className={styles.panel} aria-labelledby="content-heading">
        <div className={styles.panelHeading}><h2 id="content-heading">{t(title)}</h2><button className={styles.textButton} type="button" onClick={clearFilters}>{t("Clear filters")}</button></div>
        <div className={styles.filters}><label className={styles.search}><Search size={20} /><input ref={workspaceSearchRef} type="search" placeholder={t("Search content…")} aria-label={t("Search content")} maxLength={160} value={search} onChange={event => setSearch(event.target.value)} /></label></div>
        <div className={styles.resultBar}><span role="status">{loading ? t("Refreshing content…") : contentLoading ? t("Loading your content") : t(hasContentFilters ? "Showing {shown} of {total} items matching your filters" : "Showing {shown} of {total} items", { shown: contentShown, total: contentTotal })}</span>{hasContentFilters && <button className={styles.textButton} type="button" onClick={clearFilters}><X size={16} />{t("Clear filters")}</button>}</div>
        {collectionPage.error && <div className={styles.error} role="alert">{t(collectionPage.error)} <button type="button" className="button secondary" onClick={collectionPage.retry}>{t("Retry loading content")}</button></div>}
        {contentLoading ? <LoadingPanel title={t("Loading your content")} description={t("Bringing your pages and updates into view.")} kind="content" /> : !filtered.length ? <div className={styles.empty}><FileText size={34} /><h3>{t(hasContentFilters ? "No matching content" : "No content yet")}</h3><p>{t(hasContentFilters ? "Try another search or clear your filters." : "Create your first item to get started.")}</p></div> : <table className={styles.contentTable}><thead><tr><th>{t("Title")}</th><th>{t("Type")}</th><th>{t("Action")}</th></tr></thead><tbody>{filtered.map(record => <tr key={legacyRecordKey(record)}><td className={styles.titleCell}>{record.image ? <img src={record.image} alt="" width={140} height={83} /> : <span className={styles.contentThumbEmpty}><FileText size={24} aria-hidden="true" /></span>}<div><strong>{recordTitle(record)}</strong><span className={styles.mobileType}>{t(record.type)}</span>{record.type === 'Section' && <span className={styles.recordContext}>{pageLabel(record.parentId)} {t("· Order")} {record.order ?? 0}</span>}</div></td><td className={styles.typeCell}>{t(record.type)}</td><td className={styles.actionCell}><button type="button" className={styles.textButton} aria-label={t("Edit {name}", { name: recordTitle(record) })} onClick={event => { event.currentTarget.focus({ preventScroll: true }); openEditor(record); }} disabled={Boolean(busy)}>{t("Edit")}</button><button type="button" className={styles.deleteButton} aria-label={t("Move {name} to Trash", { name: recordTitle(record) })} title={corePage(record) ? t("This core page must remain available.") : undefined} disabled={Boolean(busy) || corePage(record)} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setDeleteRecord(record); }}><Trash2 size={18} /></button></td></tr>)}</tbody></table>}
        {collectionPage.nextCursor && <button className={styles.showMore} type="button" disabled={collectionPage.loadingMore || Boolean(busy)} onClick={() => void collectionPage.loadMore()}>{t("Show more (")}{contentTotal - contentShown} {t("remaining)")}</button>}
      </section></div>}
      {section === 'media' && <div className={styles.mediaPageLayout}>
        <section className={`${styles.panel} ${styles.mediaLibraryCard}`} aria-labelledby="media-library-heading">
          <div className={styles.panelHeading}><h2 id="media-library-heading">{t("Saved images")}</h2><Link className={styles.textButton} href="/cms/trash?kind=Image" prefetch={false}><Trash2 size={18} />{t("Media Trash")}</Link></div>
          {mediaNotice && <div className={styles.success} role="status"><Check size={19} />{t(mediaNotice)}</div>}
          {mediaError && <div className={styles.error} role="alert">{t(mediaError)}</div>}
          <div className={styles.librarySearch}><label className={styles.search}><Search size={20} /><input ref={mediaSearchRef} type="search" aria-label={t("Search media library")} maxLength={160} placeholder={t("Search image names…")} value={mediaSearch} onChange={event => { setMediaSearch(event.target.value); setMediaPage(0); }} /></label>{mediaSearch && <button type="button" className={styles.textButton} onClick={() => { setMediaSearch(''); setMediaPage(0); mediaSearchRef.current?.focus({ preventScroll: true }); }}><X size={16} />{t("Clear search")}</button>}</div><div className={styles.resultBar}><span role="status">{searchedMedia.loading ? t("Searching image library…") : filteredMedia.length ? t(activeMediaCursor ? "Showing {start}–{end} of {total} loaded images" : "Showing {start}–{end} of {total} images", { start: mediaPageStart + 1, end: mediaPageStart + visibleMedia.length, total: filteredMedia.length }) : t(activeMediaCursor ? "{count} of {total} loaded images" : "{count} of {total} images", { count: 0, total: media.length })}</span></div>{(loading && !media.length || searchedMedia.loading) ? <LoadingPanel title={t("Loading your images")} description={t("Preparing your media library.")} kind="media" /> : !searchedMedia.error && !filteredMedia.length && <div className={styles.empty}><ImagePlus size={32} /><h3>{mediaSearch.trim() ? t("No matching images") : t("Your library is empty")}</h3><p>{mediaSearch.trim() ? t("Try another image name or clear your search.") : t("Choose a device image to get started.")}</p></div>}{searchedMedia.error && <div className={styles.error} role="alert">{t(searchedMedia.error)} <button type="button" className="button secondary" onClick={searchedMedia.retry}>{t("Try search again")}</button></div>}<div className={styles.libraryGrid}>{visibleMedia.map(item => <div key={item.id}><img src={item.url} alt="" width={260} height={160} loading="lazy" /><strong>{item.title}</strong><div className={styles.mediaCardActions}><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={event => { event.currentTarget.focus({ preventScroll: true }); void showMediaUsage(item); }} aria-label={t("Usage for {name}", { name: item.title })}><Link2 size={16} />{t("Used")}</button><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void moveMediaToTrash(item)} aria-label={t("Move {name} to Media Trash", { name: item.title })}><Trash2 size={16} />{t("Trash")}</button></div></div>)}</div>{mediaPageCount > 1 && <div className={styles.pickerPagination}><button type="button" className="button secondary" disabled={currentMediaPage === 0} onClick={() => setMediaPage(currentMediaPage - 1)}>{t("Previous images")}</button><span aria-live="polite">{t("Page {page} of {total}", { page: currentMediaPage + 1, total: mediaPageCount })}</span><button type="button" className="button secondary" disabled={currentMediaPage === mediaPageCount - 1} onClick={() => setMediaPage(currentMediaPage + 1)}>{t("Next images")}</button></div>}{activeMediaCursor && currentMediaPage === mediaPageCount - 1 && <button type="button" className={styles.showMore} disabled={Boolean(busy) || loading || searchedMedia.loadingMore} onClick={() => { if (mediaSearching) void searchedMedia.loadMore(); else void loadMoreMedia(); }}>{t(busy === "Loading more images…" || searchedMedia.loadingMore ? "Loading more images…" : "Load more images")}</button>}<div className={styles.cleanup}><p>{t("Unused saved images older than one hour move to Media Trash. Images used by content or content in Trash stay in the library. Old unfinished uploads are removed.")}</p><button type="button" className={styles.textButton} onClick={event => { event.currentTarget.focus({ preventScroll: true }); void cleanupMedia(); }} disabled={Boolean(busy) || Boolean(preparedMedia) || Object.keys(editorImages).length > 0}><Trash2 size={18} />{t("Clean unused images")}</button></div>
        </section>
      </div>}
      {section === 'inbox' && <section className={styles.panel} aria-label={t("Enquiry inbox")}>
        {user && <CmsEnquiryRecipients key={user.id} role={user.role} onSaved={() => void emailSetup.refresh(true)} />}
        <CmsEmailSetupNotice setup={emailSetup} />
        <div className={styles.inboxFilters}>
          <label className={styles.search}><Search size={20} /><input ref={workspaceSearchRef} type="search" aria-label={t("Search all enquiries")} placeholder={t("Search all enquiries…")} maxLength={200} value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label className={styles.select}><span className={styles.srOnly}>{t("Enquiry status")}</span><select value={enquiryStatus} onChange={event => setEnquiryStatus(event.target.value as InboxStatus)}><option value="All">{t("All statuses")}</option>{enquiryStatuses.map(value => <option key={value} value={value}>{t(value)}</option>)}</select><ChevronDown size={17} /></label>
        </div>
        <div className={styles.resultBar}><span role={inbox.searching ? undefined : 'status'}>{inbox.searching ? t("Searching all enquiries…") : inbox.total !== null ? t("Showing {shown} of {total} enquiries", { shown: inboxItems.length, total: inbox.total }) : t("Enquiries could not be loaded")}</span>{hasInboxFilters && <button type="button" className={styles.textButton} onClick={clearFilters}><X size={16} />{t("Clear filters")}</button>}</div>
        {inbox.totalAll !== null && !inbox.searching && <p className={styles.fieldHint}>{t("{total} enquiries in your inbox · {new} new. Search covers all saved enquiries.", { total: inbox.totalAll, new: inbox.newCount ?? 0 })}</p>}
        {inbox.error && <div className={styles.error} role="alert"><p>{t(inbox.error)}</p><button type="button" className="button secondary" disabled={inbox.loadingMore || Boolean(busy)} onClick={() => inboxItems.length ? void inbox.loadMore() : refreshInbox()}><RefreshCw size={18} />{inboxItems.length ? t("Retry loading more") : t("Retry enquiry search")}</button></div>}
        <div id="enquiry-results" aria-busy={inbox.searching || inbox.loadingMore}>
          {inbox.searching ? <LoadingPanel title={hasInboxFilters ? t("Finding matching enquiries") : t("Loading your enquiries")} description={hasInboxFilters ? t("Searching every saved message for your selection.") : t("Bringing your latest website messages into view.")} kind="inbox" /> : !inbox.error && !inboxItems.length ? <div className={styles.empty}><Inbox size={36} /><h3>{hasInboxFilters ? t("No matching enquiries") : t("Your inbox is clear")}</h3><p>{hasInboxFilters ? t("Try another search or clear your filters.") : t("Messages submitted through the contact form appear here.")}</p></div> : <div className={styles.inboxList}>{inboxItems.map(item => <button type="button" key={item.id} className={styles.enquiryRow} disabled={Boolean(busy)} onClick={event => { event.currentTarget.focus({ preventScroll: true }); openEnquiry(item); }}><div><strong>{item.subject}</strong><span>{item.name}{item.company ? ` · ${item.company}` : ''}</span><p>{item.message}</p></div><div className={styles.enquiryMeta}><span className={`${styles.badge} ${item.status === 'Resolved' ? styles.resolved : styles.pending}`}>{t(item.status)}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div></button>)}</div>}
          {inbox.nextCursor && !inbox.error && <button type="button" className={styles.showMore} disabled={inbox.loadingMore || Boolean(busy)} onClick={() => void inbox.loadMore()}>{inbox.loadingMore ? <><LoaderCircle className={styles.spinner} size={18} />{t("Loading more enquiries…")}</> : <>{t("Load more enquiries")}</>}</button>}
        </div>
      </section>}
      {section === 'logs' && <CmsActivityLog revision={contentRevision} />}
      <CmsHomeSlides key={user.id} ownerId={user.id} store={slidesDraft} active={section === 'slides'} onDirtyChange={setSlidesDirty} onBusyChange={setSlidesBusy} onSaved={record => { invalidateWorkspaceRefresh(); setRecords(current => current.map(item => item.type === 'Page' && item.id === 'home' ? record : item)); setContentRevision(value => value + 1); }} />
      {section === 'usage' && (user.role === 'Dev' || user.role === 'Admin' ? <CmsUsageDashboard /> : <p className={styles.editorNotice}>{t("Only Dev and Admin can view data usage.")}</p>)}
      {section === 'users' && <CmsUsersManager targetUserId={searchParams.get('edit')?.startsWith('User:') ? searchParams.get('edit')!.slice(5) : null} onPhotoLinkClosed={() => router.replace('/cms/users', { scroll: false })} username={user.username} role={user.role} onCurrentUserChange={setUser} onUserTrashed={() => { invalidateWorkspaceRefresh(); refreshContentOverview(); }} settingsOpen={userSettingsOpen} onSettingsOpenChange={setUserSettingsOpen} />}
      {section === 'setting' && <div className={styles.settingsGrid}><section className={`${styles.panel} ${styles.websiteSettings}`}><div className={styles.panelHeading}><h2>{t("Website details")}</h2><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={event => { event.currentTarget.focus({ preventScroll: true }); void refreshWebsiteDetails(); }}><RefreshCw size={17} />{t("Refresh details")}</button></div><p className={styles.settingsDescription}>{t("Use verified company information. Leave contact fields blank until the details are ready.")}</p>{websiteDetails ? <form className={styles.editor} onSubmit={saveWebsiteDetails}><fieldset className={styles.formFields} disabled={Boolean(busy)}><div className={styles.twoColumns}><label>{t("Company name · English")}<input required lang="en" maxLength={150} value={websiteDetails.draft.companyName} onChange={event => updateWebsiteDetails('companyName', event.target.value)} /></label><label>{t("Company name · Thai")}<input required lang="th" maxLength={150} value={websiteDetails.draft.companyNameTh} onChange={event => updateWebsiteDetails('companyNameTh', event.target.value)} /></label></div><div className={styles.twoColumns}><label>{t("Office address · English")}<textarea lang="en" rows={3} maxLength={1000} value={websiteDetails.draft.officeAddress} onChange={event => updateWebsiteDetails('officeAddress', event.target.value)} /></label><label>{t("Office address · Thai")}<textarea lang="th" rows={3} maxLength={1000} value={websiteDetails.draft.officeAddressTh} onChange={event => updateWebsiteDetails('officeAddressTh', event.target.value)} /></label></div><div className={styles.twoColumns}><label>{t("Public phone number")}<input type="tel" maxLength={40} value={websiteDetails.draft.phone} onChange={event => updateWebsiteDetails('phone', event.target.value)} autoComplete="tel" /></label><label>{t("Public email address")}<input type="email" maxLength={254} value={websiteDetails.draft.email} onChange={event => updateWebsiteDetails('email', event.target.value)} autoComplete="email" /></label></div><label>{t("Map link")}<input type="url" maxLength={1500} placeholder="https://" value={websiteDetails.draft.mapUrl} onChange={event => updateWebsiteDetails('mapUrl', event.target.value)} /><span className={styles.fieldHint}>{t("Paste the HTTPS link to your office location.")}</span></label></fieldset>{settingsError && <div className={styles.error} role="alert">{t(settingsError)}<p>{t("Your input is preserved. Refresh details only when you want to discard the unsaved version.")}</p></div>}{settingsNotice && <div className={styles.success} role="status"><Check size={18} />{t(settingsNotice)}</div>}<div className={styles.editorFooter}><button type="submit" className="button" disabled={Boolean(busy) || !settingsDirty}><Check size={18} />{busy === 'Saving website details…' ? t(busy) : t("Save website details")}</button></div></form> : <p className={styles.editorNotice}>{t("Website details could not be loaded. Use Refresh details to try again.")}</p>}</section><CmsEmailSetupCard setup={emailSetup} /><section className={styles.panel}><h2>{t("Content tools")}</h2><div className={styles.toolCard}><Download size={24} /><div><h3>{t("Export website data")}</h3><p>{t("Download content, media references and enquiries as JSON. Image files and administrator accounts are stored separately.")}</p><button type="button" className="button secondary" onClick={() => void exportContent()} disabled={loading || Boolean(busy)}><Download size={18} />{busy === 'Preparing export…' ? t("Preparing export…") : t("Export data")}</button></div></div><button type="button" className={styles.textButton} onClick={event => { event.currentTarget.focus({ preventScroll: true }); void logout(); }} disabled={Boolean(busy)}><LogOut size={19} />{t("Sign out")}</button></section></div>}
    </main>
    <Modal open={section === 'media' && mediaUploadOpen} onClose={() => setMediaUploadOpen(false)} title={t("Add an image")} busy={Boolean(busy) || mediaPreparing} compact actions={<div className={`${styles.editorActionRow} ${styles.mediaUploadActions}`}>
      <button type="button" className="button secondary" disabled={Boolean(busy) || mediaPreparing} onClick={() => setMediaUploadOpen(false)}>{t("Close")}</button>
      <button type="submit" form="cms-media-upload" className="button" disabled={!preparedMedia || mediaPreparing || !mediaTitle.trim() || Boolean(busy) || mediaAttempts >= MAX_ATTEMPTS}>{busy && <LoaderCircle className={styles.spinner} size={18} />}{t(busy) || t("Save image")}</button>
    </div>}>
      <form id="cms-media-upload" className={styles.mediaUploadForm} onSubmit={saveMedia} aria-busy={Boolean(busy) || mediaPreparing}>
        <p className={styles.editorNotice}>{t("Prepare an image first. Upload starts only when you choose Save image.")}</p>
        <div className={styles.mediaUpload}>
          <label className={`button secondary ${styles.fileButton}`}><UploadCloud size={20} />{mediaPreparing ? t("Preparing image…") : t("Choose device image")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={mediaPreparing || Boolean(busy)} aria-label={t("Choose media library image")} onChange={event => { void chooseLibraryImage(event.target.files?.[0]); event.target.value = ''; }} /></label>
          <p>{t("JPEG, PNG or WebP · up to 8 MB before preparation")}</p>
        </div>
        {preparedMedia && <div className={styles.preparedImage}>
          <img src={preparedMedia.preview} alt={t("Prepared media preview")} width={240} height={150} />
          <label>{t("Image name")}<input required maxLength={100} value={mediaTitle} disabled={Boolean(busy)} onChange={event => setMediaTitle(event.target.value)} /><span className={styles.fieldHint}>{preparedMedia.width} × {preparedMedia.height} · {(preparedMedia.blob.size / 1024).toFixed(0)} KB</span></label>
        </div>}
        {mediaUploadError && <div className={styles.error} role="alert">{t(mediaUploadError)}{mediaAttempts >= MAX_ATTEMPTS && <div className={styles.recoveryActions}><p>{t("Three attempts failed. Your prepared image is preserved.")}</p><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void recoverMedia()}>{t("Check saved media")}</button></div>}</div>}
      </form>
    </Modal>
     <NavigationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
      <nav className={styles.drawerLinks}>
        <button type="button" aria-current={section === 'content' && (type === 'All' || type === 'Section') ? 'page' : undefined} onClick={() => navigate('content')}><FileText size={20} />{t("Dashboard")}</button>
        {typeOptions.filter(option => option.type !== 'Section').map(option => <button key={option.type} type="button" aria-current={section === 'content' && type === option.type ? 'page' : undefined} onClick={() => navigate('content', option.type)}><option.icon size={20} />{t(option.title)}</button>)}
        <button type="button" aria-current={section === 'slides' ? 'page' : undefined} onClick={() => navigate('slides')}><ImagePlus size={20} />{t("Homepage slides")}</button>
        <button type="button" aria-current={section === 'inbox' ? 'page' : undefined} onClick={() => navigate('inbox')}><Inbox size={20} />{t("Enquiries")} {newEnquiries !== null && newEnquiries > 0 && <span className={styles.navCount}>{newEnquiries}</span>}</button>
        <button type="button" aria-current={section === 'media' ? 'page' : undefined} onClick={() => navigate('media')}><ImagePlus size={20} />{t("Media library")}</button>
        <button type="button" aria-current={section === 'trash' ? 'page' : undefined} onClick={() => navigate('trash')}><Trash2 size={20} />{t("Trash (")}{trashCount})</button>
        {(user.role === 'Dev' || user.role === 'Admin') && <button type="button" aria-current={section === 'usage' ? 'page' : undefined} onClick={() => navigate('usage')}><BarChart3 size={20} />{t("Data usage")}</button>}
        <button type="button" aria-current={section === 'logs' ? 'page' : undefined} onClick={() => navigate('logs')}><History size={20} />{t("Logs")}</button>
        <button type="button" aria-current={section === 'users' ? 'page' : undefined} onClick={() => navigate('users')}><UserRound size={20} />{t("Users")}</button>
        <button type="button" aria-current={section === 'setting' ? 'page' : undefined} onClick={() => navigate('setting')}><Settings size={20} />{t("Settings")}</button>
      </nav>
      <div className={styles.drawerFoot}>
        <Link href={href(locale)} target="_blank" rel="noopener noreferrer" className={`button secondary ${styles.drawerViewSite}`} aria-label={t("View website in a new tab")} onClick={() => setDrawerOpen(false)}><Globe2 size={19} aria-hidden="true" />{t("View website")}</Link>
        <div className={styles.drawerUser}>
          <span className={styles.drawerUserAvatar} aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
          <div className={styles.drawerUserText}><span>{t("Signed in as")}</span><strong title={user.username}>{user.username}</strong></div>
          <button type="button" className={styles.drawerSignOut} aria-label={t("Sign out")} title={t("Sign out")} onClick={event => { event.currentTarget.focus({ preventScroll: true }); void logout(); }} disabled={Boolean(busy)}><LogOut size={19} aria-hidden="true" /><span>{t("Sign out")}</span></button>
        </div>
      </div>
    </NavigationDrawer>
    <Modal open={mediaUsage !== null} onClose={closeMediaUsage} title={t("Where this image is used")} compact>
      {mediaUsage && <div className={styles.mediaUsage}>
        <div className={styles.mediaUsageIntro}><img src={mediaUsage.item.url} alt="" width={640} height={400} /><strong>{mediaUsage.item.title}</strong></div>
        {mediaUsage.loading && <p role="status">{t("Checking where this image is used…")}</p>}
        {mediaUsage.error && <div className={styles.error} role="alert">{t(mediaUsage.error)} <button type="button" className="button secondary" onClick={() => void showMediaUsage(mediaUsage.item)}>{t("Try again")}</button></div>}
        {mediaUsage.result && (mediaUsage.result.usages.length ? <><p>{t("Used in {count} item(s).", { count: mediaUsage.result.usages.length })}</p><ul className={styles.mediaUsageList}>{mediaUsage.result.usages.map(usage => <li key={`${usage.type}:${usage.id}`}><Link href={mediaUsageHref(usage)} onClick={closeMediaUsage}><span className={styles.mediaUsageLinkHeading}><strong>{recordTitle(usage)}</strong><ArrowRight size={18} aria-hidden="true" /></span><span>{t(usage.type)}{usage.deletedAt && <> · {t("In Trash")}</>}</span><span>{usage.fields.map(field => t(field === 'avatar' ? "Profile photo" : field === 'image' ? "Main image" : field === 'mobileImage' ? "Mobile image" : field === 'heroSlides' ? "Homepage slides" : "Gallery image")).join(', ')}</span></Link></li>)}</ul></> : <p>{t("This image is not used by content or a user profile.")}</p>)}
        <div className={styles.editorFooter}><button type="button" className="button secondary" onClick={closeMediaUsage}>{t("Close")}</button></div>
      </div>}
    </Modal>
    <Modal open={editing !== null} onClose={closeEditor} title={editing ? collectionEditorTitle(editing.type, Boolean(original)) : "Edit content"} busy={Boolean(busy)} actions={<div className={styles.editorActionRow}><span className={styles.saveState} role="status">{editorDirty ? t("Unsaved changes") : original ? t("Showing the saved version") : t("New content")}</span>{editorDirty && <button type="button" className={styles.textButton} onClick={downloadDraft} disabled={Boolean(busy)}><Download size={18} />{t("Download unsaved text")}</button>}<button type="button" className="button secondary" onClick={closeEditor} disabled={Boolean(busy)}>{t("Cancel")}</button><button type="submit" form="cms-content-editor" className="button" disabled={preparing || Boolean(busy) || editorAttempts >= MAX_ATTEMPTS || editorConflict}>{busy ? <LoaderCircle className={styles.spinner} size={19} /> : <Check size={19} />}{t(busy) || (preparing ? t("Preparing image…") : t("Save"))}</button></div>}>{editing && <form id="cms-content-editor" className={styles.editor} aria-busy={Boolean(busy)} onSubmit={saveEditor} onInvalidCapture={event => { let group = (event.target as HTMLElement).closest('details'); while (group) { group.open = true; group = group.parentElement?.closest('details') || null; } }}><p className={styles.editorNotice}>{t("Save makes your changes available on the website immediately.")}{publishedPreview && original && <span className={styles.previewLinks}><a className={styles.previewLink} href={publishedPreview} target="_blank" rel="noopener noreferrer">{t("View website · Thai")}</a><a className={styles.previewLink} href={publishedContentUrl(original, records, 'en')!} target="_blank" rel="noopener noreferrer">{t("View website · English")}</a></span>}</p><CmsContentFields record={editing} existing={Boolean(original)} records={records} media={media} images={editorImages} disabled={Boolean(busy)} preparing={preparing} hasMore={Boolean(mediaCursor)} loadingMore={busy === "Loading more images…"} moreDisabled={loading} categories={summary.categories} onChange={updateEditor} onImage={(file, target) => void chooseEditorImage(file, target)} onMore={() => void loadMoreMedia()} routeText={routeText} onRouteText={setRouteText} />{editorError && <div ref={editorErrorRef} className={styles.error} role="alert" tabIndex={-1}>{t(editorError)}<p>{t("Your input is preserved.")}{editorAttempts >= MAX_ATTEMPTS ? t(" Three attempts failed. Check the saved content before retrying.") : editorConflict ? t(" Load the latest version before editing again.") : t(" Retry after checking the issue.")}</p>{(editorConflict || editorAttempts >= MAX_ATTEMPTS) && <div className={styles.recoveryActions}><button type="button" className="button secondary" onClick={() => void recoverEditor()} disabled={Boolean(busy)}>{editorConflict ? t("Load latest saved version") : t("Check saved content")}</button><button type="button" className={styles.textButton} onClick={downloadDraft}><Download size={18} />{t("Download unsaved text")}</button></div>}</div>}</form>}</Modal>
    <Modal open={deleteRecord !== null} onClose={() => setDeleteRecord(null)} title={t("Move to Trash?")} busy={Boolean(busy)}><p className={styles.confirmText}>{t("“{name}” will be hidden from the website. You can restore it for 30 days.", { name: deleteRecord ? recordTitle(deleteRecord) : '' })}</p><div className={styles.editorFooter}><button type="button" className="button secondary" onClick={() => setDeleteRecord(null)} disabled={Boolean(busy)}>{t("Cancel")}</button><button type="button" className="button" disabled={Boolean(busy)} onClick={() => { if (deleteRecord) void changeRecord(deleteRecord, 'trash'); }}><Trash2 size={18} />{busy === 'trash' ? t("Moving…") : t("Move to Trash")}</button></div></Modal>

    <Modal open={selectedEnquiry !== null} onClose={() => setSelectedEnquiry(null)} title={t("Enquiry details")} busy={Boolean(busy)}>{selectedEnquiry && <div className={styles.enquiryDetails}><div className={styles.enquiryToolbar}><span className={styles.fieldHint}>{t("Received")} {formatDate(selectedEnquiry.createdAt)}</span><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void refreshEnquiry(selectedEnquiry)}><RefreshCw size={18} />{busy === 'Refreshing enquiry…' ? t("Refreshing…") : t("Refresh enquiry")}</button></div>{enquiryNotice && <p className={styles.fieldHint} role="status">{t(enquiryNotice)}</p>}<h3>{selectedEnquiry.subject}</h3><dl><div><dt>{t("Name")}</dt><dd>{selectedEnquiry.name}</dd></div><div><dt>{t("Email")}</dt><dd><a href={`mailto:${selectedEnquiry.email}`}>{selectedEnquiry.email}</a></dd></div>{selectedEnquiry.company && <div><dt>{t("Company")}</dt><dd>{selectedEnquiry.company}</dd></div>}</dl><p className={styles.messageBody}>{selectedEnquiry.message}</p><section className={styles.notification} aria-label={t("Email notification")}><strong>{selectedEnquiry.notification ? t(notificationLabels[selectedEnquiry.notification.status]) : t("Email status unavailable")}</strong><p className={styles.fieldHint}>{t(selectedEnquiry.notification?.message || "") || (selectedEnquiry.notification?.status === 'sent' ? t("The email provider accepted the notification. Inbox delivery is not guaranteed.") : selectedEnquiry.notification?.status === 'sending' ? t("A notification is being processed. Refresh the enquiry to check the outcome.") : selectedEnquiry.notification?.status === 'review' ? t("Check the email provider before sending again to avoid a duplicate notification.") : t("The enquiry remains saved here regardless of email status."))}</p>{selectedEnquiry.notification?.sentAt && <span className={styles.fieldHint}>{t("Accepted")} {formatDate(selectedEnquiry.notification.sentAt)}</span>}<CmsNotificationSend notification={selectedEnquiry.notification} setup={emailSetup} busy={Boolean(busy)} sending={busy === 'Sending notification…'} onSend={() => void retryNotification(selectedEnquiry)} onOpenSetup={() => setSelectedEnquiry(null)} />{selectedEnquiry.notification && selectedEnquiry.notification.attempts >= 3 && selectedEnquiry.notification.status !== 'sent' && <p className={styles.fieldHint}>{t("The automatic retry limit has been reached. Review the provider before taking further action.")}</p>}</section>{enquiryError && <div className={styles.error} role="alert">{t(enquiryError)}</div>}<div className={styles.enquiryStatus}><span id="enquiry-status-label" className={styles.enquiryStatusLabel}>{t("Status")}</span><div className={styles.statusPills} role="group" aria-labelledby="enquiry-status-label" aria-busy={busy === 'Updating enquiry…'}>{enquiryStatuses.map(value => <button key={value} type="button" className={styles.statusPill} aria-pressed={selectedEnquiry.status === value} disabled={Boolean(busy)} onClick={() => void changeEnquiry(selectedEnquiry, value)}><Check size={16} aria-hidden="true" />{t(value)}</button>)}</div></div><a className="button secondary" href={`mailto:${selectedEnquiry.email}?subject=${encodeURIComponent(`Re: ${selectedEnquiry.subject}`)}`}>{t("Reply by email")}</a></div>}</Modal>
    <Modal open={importOpen} onClose={() => setImportOpen(false)} title={t("Review local content")} busy={Boolean(busy)}>
      <p className={styles.editorNotice}>{t("Import new records and local images. Review changed versions individually before saving. Local Trash is never added to the website automatically.")}</p>
      <div className={styles.importStats}><strong>{newImports.length} {t("new records ·")} {importSnapshot?.media.length || 0} {t("local library images")}</strong><span>{verifiedLocal.length} {t("of")} {importRecords.length} {t("retained records verified ·")} {verifiedLocalMedia} {t("local library images verified")}</span></div>
      {newImports.length > 0 && <ul className={styles.importList}>{newImports.map(record => <li key={legacyRecordKey(record)}><span>{recordTitle(record)}</span><span>{t(record.type)} · {t(record.status)}</span><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void reviewLocal(record)}>{t("Review before import")}</button></li>)}</ul>}
      {changedImports.length > 0 && <><h3>{t("Versions needing review")}</h3><p className={styles.fieldHint}>{t("Existing website content is preserved until you review and save each local version.")}</p><ul className={styles.importList}>{changedImports.map(record => <li key={legacyRecordKey(record)}><span>{recordTitle(record)}{record.deletedAt ? t(" · Local Trash") : ''}</span><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void reviewLocal(record)}>{t("Review local version")}</button></li>)}</ul></>}
      {!importRecords.length && !importSnapshot?.media.length && !importError && <p className={styles.empty}>{t("No retained local content or media was found.")}</p>}
      {Boolean(importSnapshot?.expired) && <p className={styles.fieldHint}>{importSnapshot?.expired} {t("expired Trash item(s) are excluded from import. Export local data to keep an archive before clearing.")}</p>}
      {importError && <div className={styles.error} role="alert">{t(importError)}</div>}{importProgress && <p className={styles.editorNotice} role="status">{t(importProgress)}</p>}
      <div className={styles.recoveryActions}><button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={exportLocalData}><Download size={18} />{t("Export local data")}</button>{localArchive && <button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void restoreLocalData()}><RotateCcw size={18} />{t("Restore archived browser data")}</button>}{<button type="button" className={styles.textButton} disabled={Boolean(busy)} onClick={() => void recoverImport()}>{t("Check interrupted import")}</button>}<button type="button" className={styles.textButton} disabled={Boolean(busy) || !importSnapshot || verifiedLocal.length !== importRecords.length || verifiedLocalMedia !== importSnapshot.media.length || !Object.values(importSnapshot.raw).some(Boolean)} onClick={() => void clearLocalData()}><Trash2 size={18} />{t("Clear verified local data")}</button></div>
      <div className={styles.editorFooter}><button type="button" className="button secondary" onClick={() => setImportOpen(false)} disabled={Boolean(busy)}>{t("Close")}</button><button type="button" className="button" disabled={Boolean(busy) || !importSnapshot || (!newImports.length && verifiedLocal.length === importRecords.length && verifiedLocalMedia === importSnapshot.media.length)} onClick={() => void importLocal()}><UploadCloud size={19} />{t(busy) || t("Import new records & images")}</button></div>
    </Modal>
    <Modal open={confirmation !== null} onClose={() => settleConfirmation(false)} title={t(confirmation?.action || "") || t("Confirm action")} compact><p className={styles.confirmText}>{t(confirmation?.message || "", confirmation?.action === 'Change content type' && confirmation.params ? { type: t(String(confirmation.params.type)), fields: String(confirmation.params.fields).split(' and ').map(field => t(field)).join(locale === 'th' ? 'และ' : ' and ') } : confirmation?.params)}</p><div className={styles.editorFooter}><button type="button" className="button secondary" onClick={() => settleConfirmation(false)}>{t("Cancel")}</button><button type="button" className="button" onClick={() => settleConfirmation(true)}>{t(confirmation?.action || "")}</button></div></Modal>
  </div>;
}
