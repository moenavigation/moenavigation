'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react';
import type { ContentImage } from '@/lib/cms-types';
import { useCmsLocale } from '@/lib/cms-locale';
import { cmsContentPlaceholder } from '@/lib/cms-content-placeholders';
import styles from './CmsCollectionFields.module.css';
import workspace from './CmsWorkspace.module.css';

type GalleryProps = {
  title: string;
  gallery: ContentImage[];
  disabled: boolean;
  preparing: boolean;
  imageField: (label: string, target: number, url: string) => ReactNode;
  onGalleryChange: (images: ContentImage[]) => void;
};

export default function CmsGalleryFields({ title, gallery, disabled, preparing, imageField, onGalleryChange }: GalleryProps) {
  const { locale, t } = useCmsLocale();
  const languages: ('en' | 'th')[] = locale === 'th' ? ['th', 'en'] : ['en', 'th'];
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusAfterEdit = useRef<{ index: number; selector: string } | null>(null);

  useLayoutEffect(() => {
    const target = focusAfterEdit.current;
    if (!target) return;
    focusAfterEdit.current = null;
    const row = rows.current[target.index];
    const control = row?.querySelector<HTMLElement>(target.selector) ?? row?.querySelector<HTMLElement>('[data-move]:enabled');
    (control ?? addButton.current)?.focus();
  }, [gallery]);

  function moveImage(index: number, offset: -1 | 1) {
    const destination = index + offset;
    const reordered = [...gallery];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    // Keep keyboard focus with the photograph, even when it reaches an end.
    const direction = offset === 1 ? 'later' : 'earlier';
    focusAfterEdit.current = { index: destination, selector: `[data-move="${direction}"]:enabled` };
    onGalleryChange(reordered);
  }

  function removeImage(index: number) {
    focusAfterEdit.current = { index: Math.min(index, gallery.length - 2), selector: '[data-remove]' };
    onGalleryChange(gallery.filter((_, position) => position !== index));
  }

  function editDescription(index: number, field: 'alt' | 'altTh', value: string) {
    onGalleryChange(gallery.map((photo, position) => position === index ? { ...photo, [field]: value } : photo));
  }

  return <fieldset className={styles.fields} disabled={disabled}>
    <details className={styles.card}>
      <summary>
        <span className={styles.cardTitle}><ImagePlus size={20} aria-hidden="true" />{title}</span>
        <span className={styles.hint}>{gallery.length ? t('{count} photos', { count: gallery.length }) : t('Optional')}</span>
      </summary>
      <div className={styles.cardBody}>
        {gallery.map((photo, index) => {
          const number = index + 1;
          const label = t('Gallery image {number}', { number });
          return <div key={index} ref={row => { rows.current[index] = row; }} className={styles.galleryItem} role="group" aria-label={label}>
            {imageField(label, index, photo.url)}
            <div className={styles.twoColumns}>
              {languages.map(language => {
                const field = language === 'th' ? 'altTh' : 'alt';
                return <label key={language} className={styles.field}>
                  {t(language === 'th' ? 'Description · Thai' : 'Description · English')}
                  <input lang={language} placeholder={cmsContentPlaceholder('galleryAlt', language)} maxLength={250}
                    value={photo[field]} onChange={event => editDescription(index, field, event.target.value)} />
                </label>;
              })}
            </div>
            <div className={styles.galleryActions}>
              <div>
                <button type="button" className={workspace.iconButton} data-move="earlier" disabled={preparing || index === 0}
                  aria-label={t('Move gallery image {number} earlier', { number })} title={t('Move earlier')} onClick={() => moveImage(index, -1)}>
                  <ArrowUp size={19} aria-hidden="true" />
                </button>
                <button type="button" className={workspace.iconButton} data-move="later" disabled={preparing || number === gallery.length}
                  aria-label={t('Move gallery image {number} later', { number })} title={t('Move later')} onClick={() => moveImage(index, 1)}>
                  <ArrowDown size={19} aria-hidden="true" />
                </button>
              </div>
              <button type="button" className={workspace.textButton} data-remove disabled={preparing}
                aria-label={t('Remove gallery image {number}', { number })} onClick={() => removeImage(index)}>
                <Trash2 size={17} aria-hidden="true" />{t('Remove image')}
              </button>
            </div>
          </div>;
        })}
        <button ref={addButton} type="button" className="button secondary" disabled={preparing || gallery.length >= 12} onClick={() => {
          focusAfterEdit.current = { index: gallery.length, selector: 'input[type="file"]' };
          onGalleryChange([...gallery, { url: '', alt: '', altTh: '' }]);
        }}><Plus size={18} aria-hidden="true" />{t('Add gallery image')}</button>
        <p className={styles.hint}>{t('Add up to 12 photos. Images upload when you save.')}</p>
      </div>
    </details>
  </fieldset>;
}
