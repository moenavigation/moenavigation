/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useState } from 'react';
import { Check, ImagePlus, Search, X } from 'lucide-react';
import type { CmsCategorySuggestions, ContentRecord, MediaItem } from '@/lib/cms-types';
import { useCmsLocale } from '@/lib/cms-locale';
import type { PreparedImage } from '@/lib/cms-client';
import styles from './CmsWorkspace.module.css';
import CmsPageFields from './CmsPageFields';
import CmsCollectionFields from './CmsCollectionFields';
import useCmsMediaSearch from './useCmsMediaSearch';

export type ImageTarget = 'image' | 'mobileImage' | number;
const PICKER_PAGE_SIZE = 12;

export default function CmsContentFields({ record, existing, records, categories, media, images, disabled, preparing, hasMore, loadingMore, moreDisabled = false, onChange, onImage, onMore, routeText, onRouteText }: {
  record: ContentRecord; existing: boolean; records?: ContentRecord[]; categories?: CmsCategorySuggestions; media: MediaItem[]; images: Record<string, PreparedImage>;
  disabled: boolean; preparing: boolean; hasMore: boolean; loadingMore: boolean; moreDisabled?: boolean; onChange: (patch: Partial<ContentRecord>) => void;
  onImage: (file: File, target: ImageTarget) => void; onMore: () => void; routeText: string; onRouteText: (text: string) => void;
}) {
  const { locale, t } = useCmsLocale();
  const [picker, setPicker] = useState<ImageTarget | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerPage, setPickerPage] = useState(0);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const search = useCmsMediaSearch(pickerSearch, picker !== null);
  const searching = Boolean(pickerSearch.trim());
  const pickerMedia = searching ? search.items : media;
  const pickerHasMore = searching ? Boolean(search.nextCursor) : hasMore;
  const pageCount = Math.max(1, Math.ceil(pickerMedia.length / PICKER_PAGE_SIZE));
  const currentPage = Math.min(pickerPage, pageCount - 1);
  const pageStart = currentPage * PICKER_PAGE_SIZE;
  const visibleMedia = pickerMedia.slice(pageStart, pageStart + PICKER_PAGE_SIZE);
  function selectImage(url: string, target: ImageTarget) {
    if (typeof target === 'number') onChange({ gallery: (record.gallery || []).map((item, index) => index === target ? { ...item, url } : item) });
    else onChange({ [target]: url });
    setPicker(null);
    setPickerSearch('');
    setPickerPage(0);
  }
  function imageField(label: string, target: ImageTarget, url: string, optional = false) {
    const prepared = images[url];
    return <div className={styles.assetField} key={String(target)}><h4>{label}</h4><div className={styles.editorImage}>
      {url ? <img src={url} alt={t('{label} preview', { label })} width={320} height={200} /> : <div className={styles.imageEmpty}><ImagePlus size={30} /><span>{t('No image selected')}</span></div>}
      <div><strong>{t(prepared ? 'Ready to upload' : url ? 'Saved image' : optional ? 'Optional image' : 'Choose an image')}</strong><p>{prepared ? t('{width} × {height} · {size} KB. Upload starts when you save.', { width: prepared.width, height: prepared.height, size: (prepared.blob.size / 1024).toFixed(0) }) : t('Choose from the library or prepare a device image.')}</p>
        <button type="button" className="button secondary" disabled={preparing} aria-expanded={picker === target} aria-label={t('Browse library for {label}', { label: label.toLocaleLowerCase(locale) })} onClick={() => { setPicker(picker === target ? null : target); setPickerSearch(''); setPickerPage(0); }}><ImagePlus size={18} />{t(picker === target ? 'Close library' : 'Browse library')}</button>
        <label className={styles.fileButton}>{t('Choose device image')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={preparing || disabled} aria-label={t('Choose {label}', { label: label.toLocaleLowerCase(locale) })} onChange={event => { const file = event.target.files?.[0]; if (file) onImage(file, target); event.target.value = ''; }} /></label>
        {optional && url && <button type="button" className={styles.textButton} disabled={preparing} onClick={() => selectImage('', target)}>{t('Remove image')}</button>}
      </div></div>
      {picker === target && <div className={styles.pickerPanel}>
        <div className={styles.librarySearch}>
          <label className={styles.search}><Search size={18} /><input ref={pickerSearchRef} type="search" maxLength={160} aria-label={t('Search library for {label}', { label: label.toLocaleLowerCase(locale) })} placeholder={t('Search image names…')} value={pickerSearch} onChange={event => { setPickerSearch(event.target.value); setPickerPage(0); }} /></label>
          {pickerSearch && <button type="button" className={styles.textButton} onClick={() => { setPickerSearch(''); setPickerPage(0); pickerSearchRef.current?.focus({ preventScroll: true }); }}><X size={16} />{t('Clear search')}</button>}
        </div>
        {!search.loading && pickerMedia.length > 0 && <span className={styles.fieldHint} role="status">{t(pickerHasMore ? 'Showing {start}–{end} of {total} loaded images' : 'Showing {start}–{end} of {total} images', { start: pageStart + 1, end: pageStart + visibleMedia.length, total: pickerMedia.length })}</span>}
        {search.loading ? <p className={styles.fieldHint} role="status">{t('Searching image library…')}</p> : search.error ? <div className={styles.error} role="alert">{t(search.error)} <button type="button" className="button secondary" onClick={search.retry}>{t('Try search again')}</button></div> : pickerMedia.length > 0 ? <div className={styles.imagePicker}>{visibleMedia.map(item => <button type="button" key={item.id} disabled={preparing} aria-pressed={url === item.url} onClick={() => selectImage(item.url, target)}><img src={item.url} alt="" width={180} height={110} loading="lazy" /><span>{item.title}</span>{url === item.url && <Check size={18} />}</button>)}</div> : <p className={styles.fieldHint}>{t(searching ? 'No matching images. Try another name or clear your search.' : 'No saved library images yet. Choose a device image to add one.')}</p>}
        {pageCount > 1 && <div className={styles.pickerPagination}>
          <button type="button" className="button secondary" disabled={currentPage === 0} onClick={() => setPickerPage(currentPage - 1)}>{t('Previous images')}</button>
          <span aria-live="polite">{t('Page {page} of {total}', { page: currentPage + 1, total: pageCount })}</span>
          <button type="button" className="button secondary" disabled={currentPage === pageCount - 1} onClick={() => setPickerPage(currentPage + 1)}>{t('Next images')}</button>
        </div>}
        {pickerHasMore && !search.loading && !search.error && currentPage === pageCount - 1 && <button type="button" className="button secondary" disabled={loadingMore || search.loadingMore || moreDisabled} onClick={() => { if (searching) void search.loadMore(); else onMore(); }}>{t(loadingMore || search.loadingMore ? 'Loading more images…' : 'Load more images')}</button>}
      </div>}
    </div>;
  }
  if (record.type === 'Page' || record.type === 'Section') return <CmsPageFields key={`${record.type}:${record.id}`} record={record} disabled={disabled} onChange={onChange} imageField={imageField} />;
  return <CmsCollectionFields key={`${record.type}:${existing ? record.id : 'new'}`} record={record} records={records} categories={categories} disabled={disabled} preparing={preparing} onChange={onChange} imageField={imageField} onGalleryChange={gallery => { setPicker(null); setPickerSearch(''); setPickerPage(0); onChange({ gallery }); }} routeText={routeText} onRouteText={onRouteText} />;
}
