/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Container, FileText, ImagePlus, Menu, Newspaper, Plus, RotateCcw, Route, Search, Settings, Ship, Trash2, UploadCloud, X } from 'lucide-react';
import { DEMO_CONTENT_EVENT, DEMO_STORAGE_KEY, demoRecordKey, demoSeed, getDemoRecords, reconcileDemoTrash, saveDemoRecords, type DemoRecord } from '../lib/demo-store';
import BrandMark from './BrandMark';
import styles from './CmsDemo.module.css';

type MediaItem = { id: string; title: string; image: string };
const mediaKey = 'moe-media-v1';
const generatedMedia: MediaItem[] = [
  { id: 'hero', title: 'Home hero', image: '/images/hero.webp' },
  { id: 'fleet', title: 'Fleet', image: '/images/container-vessel.webp' },
  { id: 'bunkering', title: 'Bunkering', image: '/images/bunkering.webp' },
  { id: 'port', title: 'Port operations', image: '/images/port.webp' },
  { id: 'tanker', title: 'Tanker', image: '/images/tanker.webp' },
  { id: 'logistics', title: 'Logistics', image: '/images/logistics.webp' },
  { id: 'bridge', title: 'Vessel bridge', image: '/images/bridge.webp' },
  { id: 'consulting', title: 'Marine consulting', image: '/images/consulting.webp' },
  { id: 'tugboat', title: 'Marine support', image: '/images/tugboat.webp' },
  { id: 'crane', title: 'Crane operations', image: '/images/crane.webp' },
  { id: 'deck', title: 'Vessel deck', image: '/images/vessel-deck.webp' },
];
const typeOptions: { title: string; type: DemoRecord['type']; icon: typeof Ship }[] = [
  { title: 'Pages', type: 'Page', icon: FileText },
  { title: 'Fleet', type: 'Vessel', icon: Ship },
  { title: 'Routes', type: 'Route', icon: Route },
  { title: 'Projects', type: 'Project', icon: Container },
  { title: 'Services', type: 'Service', icon: Settings },
  { title: 'News', type: 'News', icon: Newspaper },
];

function readMedia(): MediaItem[] {
  const raw = window.localStorage.getItem(mediaKey);
  if (!raw) return [];
  const result: unknown = JSON.parse(raw);
  if (!Array.isArray(result) || !result.every(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.image === 'string' && /^data:image\/(webp|png|jpeg);base64,/.test(item.image))) {
    throw new Error('Saved local media could not be read. Existing media has been preserved.');
  }
  return result;
}

function Modal({ open, onClose, title, children, drawer = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return (
    <dialog ref={ref} aria-label={title} className={`${styles.dialog} ${drawer ? styles.drawer : ''}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      {open && <div className={styles.dialogBody}>
        <div className={styles.dialogHeading}><h2>{title}</h2><button ref={closeRef} type="button" className={styles.iconButton} aria-label={`Close ${title}`} onClick={onClose}><X size={22} /></button></div>
        {children}
      </div>}
    </dialog>
  );
}

async function prepareImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image could not be opened.');
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
    // Preserve the source format when WebP offers no benefit. Oversized images
    // still use the resized canvas, including transparent PNGs.
    const fallback = scale < 1 ? await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, file.type, 0.9)) : file;
    const retained = fallback || file;
    const selected = webp?.type === 'image/webp' && webp.size < retained.size ? webp : retained;
    if (selected.size > 2 * 1024 * 1024) throw new Error('This image is too large for the local demo. Choose a smaller image (under 2 MB after preparation).');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be prepared.'));
      reader.onerror = () => reject(new Error('The image could not be read.'));
      reader.readAsDataURL(selected);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function errorText(error: unknown): string { return error instanceof Error ? error.message : 'This change could not be saved. Please try again.'; }

export default function CmsDemo() {
  const [records, setRecords] = useState<DemoRecord[]>(demoSeed);
  const [localMedia, setLocalMedia] = useState<MediaItem[]>([]);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [storageOkay, setStorageOkay] = useState(false);
  const [mediaOkay, setMediaOkay] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<'content' | 'trash'>('content');
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DemoRecord | null>(null);
  const [originalKey, setOriginalKey] = useState<string | null>(null);
  const originalRecord = useRef<string | null>(null);
  const [editorError, setEditorError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<DemoRecord | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [preparedMedia, setPreparedMedia] = useState<MediaItem | null>(null);
  const [mediaPreparing, setMediaPreparing] = useState(false);
  const media = useMemo(() => [...generatedMedia, ...localMedia], [localMedia]);
  const uploadVersion = useRef(0);
  const mediaUploadVersion = useRef(0);

  useEffect(() => {
    function loadRecords() {
      try { reconcileDemoTrash(); setRecords(getDemoRecords()); setStorageOkay(true); setNow(Date.now()); }
      catch (cause) { setError(errorText(cause)); setStorageOkay(false); }
    }
    function loadLocalMedia() {
      try { setLocalMedia(readMedia()); setMediaOkay(true); }
      catch (cause) { setError(errorText(cause)); setMediaOkay(false); }
    }
    function storageChanged(event: StorageEvent) {
      if (event.key === DEMO_STORAGE_KEY || event.key === null) loadRecords();
      if (event.key === mediaKey || event.key === null) loadLocalMedia();
    }
    let canceled = false;
    queueMicrotask(() => { if (!canceled) { loadRecords(); loadLocalMedia(); setReady(true); } });
    window.addEventListener(DEMO_CONTENT_EVENT, loadRecords);
    window.addEventListener('storage', storageChanged);
    const expiryTimer = window.setInterval(loadRecords, 60_000);
    return () => { canceled = true; window.clearInterval(expiryTimer); window.removeEventListener(DEMO_CONTENT_EVENT, loadRecords); window.removeEventListener('storage', storageChanged); };
  }, []);

  const filtered = records.filter(record => {
    const visible = tab === 'trash' ? Boolean(record.deletedAt) : !record.deletedAt;
    return visible && (type === 'All' || record.type === type) && (status === 'All' || record.status === status)
      && `${record.title} ${record.titleTh} ${record.category} ${record.categoryTh || ''}`.toLowerCase().includes(search.toLowerCase());
  });
  const limited = showAll || tab === 'trash' || search || type !== 'All' || status !== 'All' ? filtered : filtered.slice(0, 4);
  const trashCount = records.filter(record => record.deletedAt).length;

  function filterType(nextType: string) { setType(nextType); setTab('content'); setStatus('All'); setShowAll(true); setSearch(''); }
  function openEditor(record?: DemoRecord) {
    setOriginalKey(record ? demoRecordKey(record) : null);
    originalRecord.current = record ? JSON.stringify(record) : null;
    setEditing(record ? { ...record } : { id: crypto.randomUUID(), type: type === 'All' ? 'Page' : type as DemoRecord['type'], title: '', titleTh: '', description: '', descriptionTh: '', image: '/images/hero.webp', category: '', status: 'Draft' });
    setEditorError(''); setPickerOpen(false);
  }
  function closeEditor() { uploadVersion.current++; setPreparing(false); setEditing(null); }
  function updateEditor(key: keyof DemoRecord, value: string) { setEditing(current => current ? { ...current, [key]: value } : current); }
  function commit(next: DemoRecord[], message: string) {
    saveDemoRecords(next); setRecords(next); setError(''); setNotice(message);
  }
  function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || preparing) return;
    try {
      const latest = getDemoRecords();
      const currentRecord = originalKey ? latest.find(record => demoRecordKey(record) === originalKey && !record.deletedAt) : null;
      if (originalKey && !currentRecord) throw new Error('This item was removed in another tab. Close the editor and review your content.');
      if (currentRecord && JSON.stringify(currentRecord) !== originalRecord.current) throw new Error('This item changed in another tab. Close the editor and review the latest content before saving. Your unsaved changes are still here.');
      const clean = { ...editing, title: editing.title.trim(), titleTh: editing.titleTh.trim(), description: editing.description.trim(), descriptionTh: editing.descriptionTh.trim(), category: editing.category.trim(), categoryTh: editing.categoryTh?.trim() || undefined };
      if (!clean.title || !clean.titleTh) throw new Error('Add a title in both English and Thai.');
      const next = originalKey ? latest.map(record => demoRecordKey(record) === originalKey ? clean : record) : [clean, ...latest];
      commit(next, `“${clean.title}” saved in this browser as ${clean.status.toLowerCase()}.`);
      closeEditor(); setTab('content'); setType('All'); setStatus('All'); setSearch(''); setShowAll(true);
    } catch (cause) { setEditorError(errorText(cause)); }
  }
  function moveToTrash() {
    if (!deleteRecord) return;
    try {
      const key = demoRecordKey(deleteRecord);
      const latest = getDemoRecords();
      const currentRecord = latest.find(record => demoRecordKey(record) === key && !record.deletedAt);
      if (!currentRecord) throw new Error('This item is already in Trash or was removed in another tab. Review the current content list.');
      if (JSON.stringify(currentRecord) !== JSON.stringify(deleteRecord)) throw new Error('This item changed in another tab. Review the latest version before moving it to Trash.');
      commit(latest.map(record => demoRecordKey(record) === key ? { ...record, deletedAt: new Date().toISOString() } : record), `“${deleteRecord.title}” moved to Trash. You can restore it within 30 days.`);
      setDeleteRecord(null);
    } catch (cause) { setError(errorText(cause)); setDeleteRecord(null); }
  }
  function restore(record: DemoRecord) {
    try {
      const latest = getDemoRecords();
      const currentRecord = latest.find(item => demoRecordKey(item) === demoRecordKey(record));
      if (!currentRecord?.deletedAt) throw new Error('This item has already been restored or has expired from Trash.');
      if (JSON.stringify(currentRecord) !== JSON.stringify(record)) throw new Error('This item changed in another tab. Review the latest version before restoring it.');
      commit(latest.map(item => {
        if (demoRecordKey(item) !== demoRecordKey(record)) return item;
        const restored = { ...item }; delete restored.deletedAt; return restored;
      }), `“${record.title}” restored in this browser.`);
    } catch (cause) { setError(errorText(cause)); }
  }
  async function editorUpload(file?: File) {
    if (!file) return;
    const version = ++uploadVersion.current;
    setPreparing(true); setEditorError('');
    try {
      const image = await prepareImage(file);
      if (uploadVersion.current === version) updateEditor('image', image);
    } catch (cause) { if (uploadVersion.current === version) setEditorError(errorText(cause)); }
    finally { if (uploadVersion.current === version) setPreparing(false); }
  }
  async function libraryUpload(file?: File) {
    if (!file) return;
    const version = ++mediaUploadVersion.current;
    setMediaPreparing(true); setMediaError('');
    try {
      const image = await prepareImage(file);
      if (mediaUploadVersion.current === version) setPreparedMedia({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), image });
    } catch (cause) { if (mediaUploadVersion.current === version) setMediaError(errorText(cause)); }
    finally { if (mediaUploadVersion.current === version) setMediaPreparing(false); }
  }
  function saveMedia() {
    if (!preparedMedia || mediaPreparing) return;
    try {
      const next = [...readMedia(), preparedMedia];
      window.localStorage.setItem(mediaKey, JSON.stringify(next));
      setLocalMedia(next); setPreparedMedia(null); setMediaError(''); setNotice('Image saved to the media library in this browser.');
    } catch { setMediaError('The image could not be saved. Browser storage may be full or disabled. Your prepared image is still here; choose a smaller image or try again.'); }
  }
  function closeMedia() { mediaUploadVersion.current++; setMediaPreparing(false); setMediaOpen(false); }

  return <div className={styles.cms}>
    <header className={styles.header}>
      <button className={styles.menuButton} type="button" onClick={() => setDrawerOpen(true)} aria-label="Open CMS navigation" aria-haspopup="dialog"><Menu /><span>Menu</span></button>
      <Link href="/" className={styles.logo} aria-label="MOE Navigation home"><span className={styles.brandMark}><BrandMark /></span><span className={styles.logoText}><strong>MOE</strong><span>NAVIGATION</span></span></Link>
      <span className={styles.cmsLabel}>CMS</span>
      <Link href="/" className={`button secondary ${styles.viewSite}`} aria-label="View website"><span className={styles.viewSiteLong}>View website</span><span className={styles.viewSiteShort}>Site</span><ArrowUpRight size={19} /></Link>
      <span className={styles.avatar} title="Demo workspace">D</span>
    </header>
    <main className={styles.main}>
      <div className={styles.intro}>
        <div><span className="eyebrow">CMS demo sandbox</span><h1>{tab === 'trash' ? 'Trash' : 'Content overview'}</h1><p>{tab === 'trash' ? 'Restore deleted content within 30 days.' : 'Manage your website pages and content.'}</p></div>
        <button type="button" className="button" onClick={() => openEditor()} disabled={!ready || !storageOkay}><Plus size={21} /> Create content</button>
      </div>
      <div className={styles.demoNotice}><span className={styles.demoDot} /> Local browser demo. Content is saved on this device. APIs and production access will be connected later.</div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.success} role="status"><Check size={19} /><span>{notice}</span><button type="button" className={styles.iconButton} onClick={() => setNotice('')} aria-label="Dismiss saved notice"><X size={18} /></button></div>}
      <div className={styles.categoryHeading}><div><h2>Content areas</h2><p>Choose a type to focus the list.</p></div><button type="button" className={styles.textButton} onClick={() => filterType('All')} aria-pressed={tab === 'content' && type === 'All'}>All content <ArrowRight size={18} /></button></div>
      <nav className={styles.categories} aria-label="Content categories">{typeOptions.map(option => <button key={option.type} type="button" aria-pressed={type === option.type && tab === 'content'} className={type === option.type && tab === 'content' ? styles.categorySelected : ''} onClick={() => filterType(option.type)}><option.icon size={34} strokeWidth={1.7} /><span>{option.title}</span><ArrowRight className={styles.categoryArrow} size={19} /></button>)}</nav>
      <div className={styles.workspace}>
        <section className={styles.panel} aria-labelledby="content-heading">
          <div className={styles.panelHeading}><h2 id="content-heading">{tab === 'trash' ? 'Deleted content' : 'Website content'}</h2><button className={styles.textButton} type="button" onClick={() => { setShowAll(true); setSearch(''); setType('All'); setStatus('All'); }}>View all <ArrowRight size={20} /></button></div>
          <div className={styles.tabs}><button type="button" aria-pressed={tab === 'content'} className={tab === 'content' ? styles.tabActive : ''} onClick={() => { setTab('content'); setSearch(''); }}>Content <span>{records.length - trashCount}</span></button><button type="button" aria-pressed={tab === 'trash'} className={tab === 'trash' ? styles.tabActive : ''} onClick={() => { setTab('trash'); setType('All'); setStatus('All'); setSearch(''); }}>Trash <span>{trashCount}</span></button></div>
          <div className={styles.filters}>
            <label className={styles.search}><Search size={21} /><input type="search" placeholder="Search content..." aria-label="Search content" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label className={styles.select}><span className={styles.srOnly}>Content type</span><select value={type} onChange={event => setType(event.target.value)}><option value="All">All types</option>{typeOptions.map(option => <option key={option.type}>{option.type}</option>)}</select><ChevronDown size={17} /></label>
            <label className={styles.select}><span className={styles.srOnly}>Publication status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="All">All statuses</option><option>Published</option><option>Draft</option></select><ChevronDown size={17} /></label>
          </div>
          {!ready ? <p className={styles.empty}>Loading local content...</p> : limited.length === 0 ? <div className={styles.empty}><FileText size={34} /><h3>{tab === 'trash' ? 'No deleted content' : 'No matching content'}</h3><p>{tab === 'trash' ? 'Items you delete will appear here for 30 days.' : 'Try another search or create a new item.'}</p></div> : <table className={styles.contentTable}>
            <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{limited.map(record => <tr key={demoRecordKey(record)}>
              <td className={styles.titleCell}><img src={record.image} alt="" width={140} height={83} /><div><strong>{record.title}</strong><span className={styles.mobileType}>{record.type}</span>{record.deletedAt && <span className={styles.expiry}>{Math.max(0, Math.ceil((Date.parse(record.deletedAt) + 30 * 86400000 - now) / 86400000))} days to restore</span>}</div></td>
              <td className={styles.typeCell}>{record.type}</td>
              <td className={styles.statusCell}><span className={`${styles.badge} ${record.status === 'Published' ? styles.published : styles.draft}`}>{record.status}</span></td>
              <td className={styles.actionCell}>{tab === 'trash' ? <button type="button" className={styles.textButton} aria-label={`Restore ${record.title}`} disabled={!storageOkay} onClick={() => restore(record)}><RotateCcw size={18} /> Restore</button> : <><button type="button" className={styles.textButton} aria-label={`Edit ${record.title}`} disabled={!storageOkay} onClick={() => openEditor(record)}>Edit <ArrowRight size={18} /></button><button type="button" className={styles.deleteButton} aria-label={`Move ${record.title} to Trash`} disabled={!storageOkay} onClick={() => setDeleteRecord(record)}><Trash2 size={18} /></button></>}</td>
            </tr>)}</tbody>
          </table>}
          {filtered.length > limited.length && <button type="button" className={styles.showMore} onClick={() => setShowAll(true)}>Show all {filtered.length} items <ArrowRight size={18} /></button>}
          {tab === 'trash' && <p className={styles.retentionNote}>Expired items are removed from this browser automatically after 30 days. Media remains available for other content.</p>}
        </section>
        <aside className={`${styles.panel} ${styles.mediaPanel}`} aria-labelledby="media-heading">
          <div className={styles.panelHeading}><h2 id="media-heading">Media library</h2><button type="button" className={styles.textButton} onClick={() => { setMediaOpen(true); setMediaError(''); }}>View all <ArrowRight size={20} /></button></div>
          <p>Images for your website</p>
          <div className={styles.mediaGrid}>{media.slice(0, 4).map(item => <button type="button" key={item.id} onClick={() => setMediaOpen(true)}><img src={item.image} alt={item.title} width={300} height={180} /><strong>{item.title}</strong></button>)}</div>
          <button type="button" className={`button secondary ${styles.uploadButton}`} onClick={() => { setMediaOpen(true); setMediaError(''); }} disabled={!ready || !mediaOkay}><UploadCloud size={23} /> Upload media</button>
          <span className={styles.localLabel}>Generated demo imagery · local storage only</span>
        </aside>
      </div>
    </main>
    <Modal open={drawerOpen} onClose={() => setDrawerOpen(false)} title="CMS navigation" drawer>
      <p className={styles.drawerDescription}>MOE Navigation · Demo workspace</p>
      <nav className={styles.drawerLinks}><button type="button" onClick={() => { filterType('All'); setDrawerOpen(false); }}><FileText size={20} /> Content overview <ArrowRight size={18} /></button>{typeOptions.map(option => <button key={option.type} type="button" onClick={() => { filterType(option.type); setDrawerOpen(false); }}><option.icon size={20} />{option.title}<ArrowRight size={18} /></button>)}<button type="button" onClick={() => { setTab('trash'); setType('All'); setStatus('All'); setSearch(''); setDrawerOpen(false); }}><Trash2 size={20} /> Trash ({trashCount}) <ArrowRight size={18} /></button></nav>
      <div className={styles.drawerFoot}><p>Changes are saved on this device. Production login and connected APIs are not configured.</p><Link href="/" className="button secondary">View website <ArrowUpRight size={18} /></Link></div>
    </Modal>
    <Modal open={editing !== null} onClose={closeEditor} title={originalKey ? 'Edit content' : 'Create content'}>
      {editing && <form className={styles.editor} onSubmit={saveEditor}>
        <p className={styles.editorNotice}>{editing.type === 'Page' ? 'Saved in this browser. Existing page records update their matching website sections. New pages need a route before they appear in the preview.' : 'This sandbox saves to your browser. Published content is visible in your local website preview.'}</p>
        <div className={styles.twoColumns}><label>Content type<select value={editing.type} onChange={event => updateEditor('type', event.target.value)}>{typeOptions.map(option => <option key={option.type}>{option.type}</option>)}</select></label><label>Status<select value={editing.status} onChange={event => updateEditor('status', event.target.value)}><option>Draft</option><option>Published</option></select></label></div>
        <div className={styles.twoColumns}><label>Title · English<input required maxLength={160} value={editing.title} onChange={event => updateEditor('title', event.target.value)} /></label><label>Title · Thai<input required lang="th" maxLength={160} value={editing.titleTh} onChange={event => updateEditor('titleTh', event.target.value)} /></label></div>
        <div className={styles.twoColumns}><label>Description · English<textarea rows={4} maxLength={2000} value={editing.description} onChange={event => updateEditor('description', event.target.value)} /></label><label>Description · Thai<textarea lang="th" rows={4} maxLength={2000} value={editing.descriptionTh} onChange={event => updateEditor('descriptionTh', event.target.value)} /></label></div>
        <div className={styles.twoColumns}><label>Category · English<input maxLength={80} value={editing.category} placeholder="e.g. Container, Marine support" onChange={event => updateEditor('category', event.target.value)} /></label><label>Category · Thai (optional)<input lang="th" maxLength={80} value={editing.categoryTh || ''} placeholder="e.g. เรือคอนเทนเนอร์" onChange={event => updateEditor('categoryTh', event.target.value)} /></label></div>
        <div className={styles.editorImage}><img src={editing.image} alt="Selected content image" width={480} height={260} /><div><strong>Content image</strong><p>{preparing ? 'Preparing image in your browser...' : 'Choose a generated image or prepare one from your device.'}</p><button type="button" className="button secondary" onClick={() => setPickerOpen(!pickerOpen)} disabled={preparing}><ImagePlus size={19} /> Choose image</button><label className={styles.fileButton}>Upload from device<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload content image from device" disabled={preparing} onChange={event => { void editorUpload(event.target.files?.[0]); event.target.value = ''; }} /></label></div></div>
        {pickerOpen && <div className={styles.imagePicker}>{media.map(item => <button type="button" key={item.id} aria-pressed={editing.image === item.image} onClick={() => { updateEditor('image', item.image); setPickerOpen(false); }}><img src={item.image} alt="" width={180} height={110} /><span>{item.title}</span>{editing.image === item.image && <Check size={18} />}</button>)}</div>}
        {editorError && <div className={styles.error} role="alert">{editorError}</div>}
        <div className={styles.editorFooter}><button type="button" className="button secondary" onClick={closeEditor}>Cancel</button><button type="submit" className="button" disabled={preparing || !storageOkay}><Check size={19} />{preparing ? 'Preparing image...' : 'Save locally'}</button></div>
      </form>}
    </Modal>
    <Modal open={deleteRecord !== null} onClose={() => setDeleteRecord(null)} title="Move to Trash?">
      <p className={styles.confirmText}>“{deleteRecord?.title}” will be hidden from the website preview. You can restore it for 30 days.</p><div className={styles.editorFooter}><button type="button" className="button secondary" onClick={() => setDeleteRecord(null)}>Cancel</button><button type="button" className="button" onClick={moveToTrash}><Trash2 size={18} /> Move to Trash</button></div>
    </Modal>
    <Modal open={mediaOpen} onClose={closeMedia} title="Media library">
      <p className={styles.editorNotice}>Generated imagery and your device images. New images are prepared in your browser before you save them locally.</p>
      <div className={styles.libraryGrid}>{media.map(item => <div key={item.id}><img src={item.image} alt={item.title} width={260} height={160} /><strong>{item.title}</strong></div>)}</div>
      <div className={styles.mediaUpload}><label className={`button secondary ${styles.fileButton}`}><UploadCloud size={20} />{mediaPreparing ? 'Preparing image...' : 'Choose device image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={mediaPreparing || !mediaOkay} aria-label="Choose media library image" onChange={event => { void libraryUpload(event.target.files?.[0]); event.target.value = ''; }} /></label><p>JPEG, PNG or WebP · up to 8 MB before preparation</p></div>
      {preparedMedia && <div className={styles.preparedImage}><img src={preparedMedia.image} alt="Prepared media preview" width={240} height={150} /><label>Image name<input maxLength={100} value={preparedMedia.title} onChange={event => setPreparedMedia({ ...preparedMedia, title: event.target.value })} /></label><button type="button" className="button" onClick={saveMedia} disabled={mediaPreparing || !preparedMedia.title.trim() || !mediaOkay}><Check size={18} /> Save locally</button></div>}
      {mediaError && <div className={styles.error} role="alert">{mediaError}</div>}
    </Modal>
  </div>;
}
