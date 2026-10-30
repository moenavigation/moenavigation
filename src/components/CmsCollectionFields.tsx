'use client';

import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Languages, MapPin, Plus, Ship, Trash2 } from 'lucide-react';
import type { CmsCategorySuggestions, ContentImage, ContentRecord, VesselSpecs } from '@/lib/cms-types';
import { useCmsLocale } from '@/lib/cms-locale';
import CmsRouteFields from './CmsRouteFields';
import styles from './CmsCollectionFields.module.css';
import workspace from './CmsWorkspace.module.css';

type TextField = 'title' | 'description' | 'bodyHeading' | 'body' | 'imageAlt';
const textLabels: Record<TextField, string> = { title: 'Title', description: 'Summary', bodyHeading: 'Content heading', body: 'Content', imageAlt: 'Image description' };
const textLimits: Record<TextField, number> = { title: 200, description: 2000, bodyHeading: 200, body: 30000, imageAlt: 250 };

export default function CmsCollectionFields({ record, records = [], categories, disabled, preparing, onChange, imageField, onGalleryChange, routeText, onRouteText }: {
  record: ContentRecord;
  records?: ContentRecord[];
  categories?: CmsCategorySuggestions;
  disabled: boolean;
  preparing: boolean;
  onChange: (patch: Partial<ContentRecord>) => void;
  imageField: (label: string, target: 'image' | 'mobileImage' | number, url: string, optional?: boolean) => ReactNode;
  onGalleryChange: (gallery: ContentImage[]) => void;
  routeText: string;
  onRouteText: (text: string) => void;
}) {
  const { locale, t } = useCmsLocale();
  const categoryId = useId();
  const languages: ('th' | 'en')[] = locale === 'th' ? ['th', 'en'] : ['en', 'th'];
  const hasCategory = ['Vessel', 'Project', 'News'].includes(record.type);
  const hasHeading = ['Service', 'Project', 'News'].includes(record.type);
  const categoryLabel = record.type === 'Vessel' ? 'Vessel type' : 'Category';
  const gallery = record.gallery || [];
  const languageName = (language: 'th' | 'en') => t(language === 'th' ? 'Thai' : 'English');
  const bilingualLabel = (label: string, language: 'th' | 'en') => t(`${label} · ${language === 'th' ? 'Thai' : 'English'}`);

  function textField(field: TextField, language: 'th' | 'en') {
    const key = (language === 'th' ? `${field}Th` : field) as TextField | `${TextField}Th`;
    const common = { lang: language, required: field === 'title' || field === 'description', maxLength: textLimits[field], value: record[key] || '', onChange: (event: { target: { value: string } }) => onChange({ [key]: event.target.value }) };
    return <label className={styles.field} key={field}>{bilingualLabel(textLabels[field], language)}
      {field === 'body' || field === 'description' ? <textarea {...common} rows={field === 'body' ? 6 : 3} /> : <input {...common} />}
      {field === 'body' && <span className={styles.hint}>{t('Separate paragraphs with a blank line.')}</span>}
    </label>;
  }

  function categoryField(language: 'th' | 'en') {
    const key = language === 'th' ? 'categoryTh' : 'category';
    const suggestions = categories?.[record.type]?.[language] ?? [...new Set(records.filter(item => !item.deletedAt && item.type === record.type).map(item => item[key]).filter((value): value is string => Boolean(value?.trim())))];
    return <label className={styles.field}>{t(categoryLabel)} · {languageName(language)}
      <input lang={language} required={language === 'en'} maxLength={100} value={record[key] || ''} list={suggestions.length ? `${categoryId}-${language}` : undefined} onChange={event => onChange({ [key]: event.target.value })} />
      {suggestions.length > 0 && <datalist id={`${categoryId}-${language}`}>{suggestions.map(value => <option key={value} value={value} />)}</datalist>}
    </label>;
  }

  function updateSpec(key: keyof VesselSpecs, value: string | number | undefined) {
    const specs = { ...record.vesselSpecs, [key]: value };
    if (value === undefined || value === '') delete specs[key];
    onChange({ vesselSpecs: Object.keys(specs).length ? specs : undefined });
  }

  function moveImage(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (disabled || preparing || next < 0 || next >= gallery.length) return;
    const reordered = [...gallery];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    onGalleryChange(reordered);
  }

  return <fieldset className={styles.fields} disabled={disabled}>
    {languages.map(language => <details key={language} className={styles.card} open={locale === language}>
      <summary><span className={styles.cardTitle}><Languages size={20} aria-hidden="true" />{languageName(language)}</span><span className={styles.hint}>{t('Website text')}</span></summary>
      <div className={styles.cardBody}>{textField('title', language)}{textField('description', language)}{hasCategory && categoryField(language)}<details className={styles.moreText}><summary>{t('Detailed content')}</summary><div>{hasHeading && textField('bodyHeading', language)}{textField('body', language)}</div></details></div>
    </details>)}
    {(record.type === 'News' || record.type === 'Project') && <div className={styles.standaloneField}><label className={styles.field}>{t('Date')}<input type="date" value={record.date || ''} onChange={event => onChange({ date: event.target.value })} /></label></div>}
    <section className={styles.pictures} aria-label={t('Pictures')}><div className={styles.cardTitle}><ImagePlus size={21} aria-hidden="true" /><h3>{t('Pictures')}</h3></div>
      {imageField(t('Main image'), 'image', record.image, record.type === 'Vessel')}
      <div className={styles.twoColumns}>{languages.map(language => <div key={language}>{textField('imageAlt', language)}</div>)}</div>
    </section>
    {record.type === 'Route' && <details className={styles.card}><summary><span className={styles.cardTitle}><MapPin size={20} aria-hidden="true" />{t('Route map and ports')}</span><span className={styles.hint}>{t('Optional')}</span></summary><div className={styles.cardBody}><CmsRouteFields record={record} disabled={disabled} routeText={routeText} onChange={onChange} onRouteText={onRouteText} /></div></details>}
    {record.type === 'Vessel' && <details className={styles.card}>
      <summary><span className={styles.cardTitle}><Ship size={20} aria-hidden="true" />{t('Vessel specifications')}</span><span className={styles.hint}>{t('Optional')}</span></summary>
      <div className={styles.cardBody}><p className={styles.hint}>{t('Enter approved vessel information only. Leave unknown values blank; they will not appear as confirmed specifications. Availability is a written statement, not live tracking.')}</p>
        <div className={styles.twoColumns}><label className={styles.field}>{t('IMO ship number')}<input inputMode="numeric" maxLength={7} pattern="[1-9][0-9]{6}" value={record.vesselSpecs?.imo || ''} onChange={event => updateSpec('imo', event.target.value)} /><span className={styles.hint}>{t('Seven digits without the IMO prefix. The check digit is validated when saving.')}</span></label><label className={styles.field}>{t('Year built')}<input type="number" min={1800} max={new Date().getUTCFullYear()} step={1} value={record.vesselSpecs?.yearBuilt ?? ''} onChange={event => updateSpec('yearBuilt', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
          {([{ key: 'lengthM', label: 'Length overall (m)', max: 1000 }, { key: 'beamM', label: 'Beam (m)', max: 500 }, { key: 'draftM', label: 'Draft (m)', max: 100 }, { key: 'deadweightT', label: 'Deadweight (tonnes)', max: 2000000 }, { key: 'capacityTeu', label: 'Container capacity (TEU)', max: 100000 }] as const).map(field => <label className={styles.field} key={field.key}>{t(field.label)}<input type="number" min={field.key === 'capacityTeu' ? 0 : 0.01} max={field.max} step={field.key === 'capacityTeu' ? 1 : 'any'} value={record.vesselSpecs?.[field.key] ?? ''} onChange={event => updateSpec(field.key, event.target.value === '' ? undefined : Number(event.target.value))} /></label>)}
        </div>
        {languages.map(language => <div className={styles.twoColumns} key={language}><label className={styles.field}>{bilingualLabel('Flag state', language)}<input lang={language} maxLength={100} value={record.vesselSpecs?.[language === 'th' ? 'flagTh' : 'flag'] || ''} onChange={event => updateSpec(language === 'th' ? 'flagTh' : 'flag', event.target.value)} /></label><label className={styles.field}>{bilingualLabel('Availability statement', language)}<input lang={language} maxLength={200} value={record.vesselSpecs?.[language === 'th' ? 'availabilityTh' : 'availability'] || ''} onChange={event => updateSpec(language === 'th' ? 'availabilityTh' : 'availability', event.target.value)} /></label></div>)}
      </div>
    </details>}
    {record.type === 'Vessel' && <details className={styles.card}>
      <summary><span className={styles.cardTitle}><ImagePlus size={20} aria-hidden="true" />{t('More photos')}</span><span className={styles.hint}>{gallery.length ? t('{count} photos', { count: gallery.length }) : t('Optional')}</span></summary>
      <div className={styles.cardBody}>{gallery.map((item, index) => <div className={styles.galleryItem} key={index}>
        {imageField(t('Gallery image {number}', { number: index + 1 }), index, item.url)}
        <div className={styles.twoColumns}>{languages.map(language => <label className={styles.field} key={language}>{bilingualLabel('Description', language)}<input lang={language} maxLength={250} value={language === 'th' ? item.altTh : item.alt} onChange={event => onChange({ gallery: gallery.map((image, position) => position === index ? { ...image, [language === 'th' ? 'altTh' : 'alt']: event.target.value } : image) })} /></label>)}</div>
        <div className={styles.galleryActions}><div><button type="button" className={workspace.iconButton} disabled={preparing || index === 0} aria-label={t('Move gallery image {number} earlier', { number: index + 1 })} title={t('Move earlier')} onClick={() => moveImage(index, -1)}><ArrowUp size={19} /></button><button type="button" className={workspace.iconButton} disabled={preparing || index === gallery.length - 1} aria-label={t('Move gallery image {number} later', { number: index + 1 })} title={t('Move later')} onClick={() => moveImage(index, 1)}><ArrowDown size={19} /></button></div><button type="button" className={workspace.textButton} disabled={preparing} aria-label={t('Remove gallery image {number}', { number: index + 1 })} onClick={() => onGalleryChange(gallery.filter((_, position) => position !== index))}><Trash2 size={17} />{t('Remove image')}</button></div>
      </div>)}<button type="button" className="button secondary" disabled={preparing || gallery.length >= 12} onClick={() => onGalleryChange([...gallery, { url: '', alt: '', altTh: '' }])}><Plus size={18} />{t('Add gallery image')}</button><p className={styles.hint}>{t('Up to 12 gallery images for vessel profiles. Use the arrows to set their display order. Images upload one at a time when you save.')}</p></div>
    </details>}
  </fieldset>;
}
