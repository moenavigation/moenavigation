'use client';

import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ClipboardList, ImagePlus, Languages, MapPin, Plus, Ship, Trash2 } from 'lucide-react';
import type { CmsCategorySuggestions, ContentImage, ContentRecord, RouteSpecs, VesselSpecs } from '@/lib/cms-types';
import { useCmsLocale } from '@/lib/cms-locale';
import { cmsContentPlaceholder } from '@/lib/cms-content-placeholders';
import { technicalSections, technicalTextLimit } from '@/lib/vessel-technical-sections';
import CmsRouteFields from './CmsRouteFields';
import CmsServiceIconPicker from './CmsServiceIconPicker';
import SelectionDialog from './SelectionDialog';
import styles from './CmsCollectionFields.module.css';
import workspace from './CmsWorkspace.module.css';

type TextField = 'title' | 'description' | 'bodyHeading' | 'body' | 'imageAlt';
const textLabels: Record<TextField, string> = { title: 'Title', description: 'Summary', bodyHeading: 'Content heading', body: 'Content', imageAlt: 'Image description' };
const textLimits: Record<TextField, number> = { title: 200, description: 2000, bodyHeading: 200, body: 30000, imageAlt: 250 };
const vesselDetailGroups = [
  { label: 'Dimension', fields: [
    { key: 'lengthM', label: 'LOA (m)', max: 1000, whole: false },
    { key: 'lbpM', label: 'Length between perpendiculars (m)', max: 1000, whole: false },
    { key: 'beamM', label: 'Breadth (m)', max: 500, whole: false },
    { key: 'depthM', label: 'Depth (m)', max: 100, whole: false },
    { key: 'draftM', label: 'Draft (m)', max: 100, whole: false },
  ] },
  { label: 'Container Capacity', fields: [
    { key: 'capacityTeu', label: 'Nominal (TEU)', max: 100000, whole: true },
    { key: 'reeferPlugs', label: 'Reefer Plug (units)', max: 100000, whole: true },
  ] },
  { label: 'Tonnage', fields: [
    { key: 'grossTonnage', label: 'GRT', max: 2000000, whole: false },
    { key: 'netTonnage', label: 'NRT', max: 2000000, whole: false },
    { key: 'deadweightT', label: 'DWT (tonnes)', max: 2000000, whole: false },
    { key: 'cargoCapacityT', label: 'DWCC (tonnes)', max: 2000000, whole: false },
  ] },
  { label: 'Cargo equipment', fields: [
    { key: 'craneSwlT', label: 'Crane safe working load (tonnes)', max: 2000000, whole: false },
    { key: 'cargoVolumeM3', label: 'Cargo volume at 100% (m³)', max: 2000000, whole: false },
    { key: 'cargoTanks', label: 'Number of cargo tanks', max: 1000, whole: true },
  ] },
] as const;

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
  const fieldId = useId();
  const languages: ('th' | 'en')[] = locale === 'th' ? ['th', 'en'] : ['en', 'th'];
  const hasCategory = ['Vessel', 'Project', 'News'].includes(record.type);
  const hasHeading = ['Service', 'Project', 'News'].includes(record.type);
  const categoryLabel = record.type === 'Vessel' ? 'Vessel type' : 'Category';
  const gallery = record.gallery || [];
  const languageName = (language: 'th' | 'en') => t(language === 'th' ? 'Thai' : 'English');
  const bilingualLabel = (label: string, language: 'th' | 'en') => t(`${label} · ${language === 'th' ? 'Thai' : 'English'}`);

  function textField(field: TextField, language: 'th' | 'en') {
    const key = (language === 'th' ? `${field}Th` : field) as TextField | `${TextField}Th`;
    const common = { lang: language, placeholder: cmsContentPlaceholder(field, language, record.type), required: field === 'title' || field === 'description', maxLength: textLimits[field], value: record[key] || '', onChange: (event: { target: { value: string } }) => onChange({ [key]: event.target.value }) };
    return <label className={styles.field} key={field}>{bilingualLabel(textLabels[field], language)}
      {field === 'body' || field === 'description' ? <textarea {...common} rows={field === 'body' ? 6 : 3} /> : <input {...common} />}
      {field === 'body' && <span className={styles.hint}>{t('Separate paragraphs with a blank line.')}</span>}
    </label>;
  }

  function categoryField(language: 'th' | 'en') {
    const key = language === 'th' ? 'categoryTh' : 'category';
    const suggestions = categories?.[record.type]?.[language] ?? [...new Set(records.filter(item => !item.deletedAt && item.type === record.type).map(item => item[key]).filter((value): value is string => Boolean(value?.trim())))];
    const label = `${t(categoryLabel)} · ${languageName(language)}`;
    const chooseExisting = locale === 'th' ? 'เลือกที่มีอยู่' : 'Choose existing';
    return <div className={styles.field}><label htmlFor={`${fieldId}-${language}`}>{label}</label><div className={styles.categoryInput}>
      <input id={`${fieldId}-${language}`} lang={language} placeholder={cmsContentPlaceholder(record.type === 'Vessel' ? 'vesselType' : record.type === 'Project' ? 'projectCategory' : 'newsCategory', language)} required={language === 'en'} maxLength={100} value={record[key] || ''} onChange={event => onChange({ [key]: event.target.value })} />
      {suggestions.length > 0 && <SelectionDialog label={`${chooseExisting}: ${label}`} triggerLabel={chooseExisting} value={record[key] || ''} options={suggestions.map(value => ({ value, label: value }))} onChange={value => onChange({ [key]: value })} disabled={disabled} closeLabel={locale === 'th' ? 'ปิดตัวเลือก' : 'Close choices'} searchPlaceholder={locale === 'th' ? 'ค้นหาตัวเลือก' : 'Search choices'} className={styles.categoryChoices} />}
    </div></div>;
  }

  function updateSpec(key: keyof VesselSpecs, value: string | number | undefined) {
    const specs = { ...record.vesselSpecs, [key]: value };
    if (value === undefined || value === '') delete specs[key];
    onChange({ vesselSpecs: Object.keys(specs).length ? specs : undefined });
  }

  function routeNumberField(key: keyof RouteSpecs, label: string, whole = false) {
    return <label className={styles.field}>{t(label)}<input type="number" placeholder={cmsContentPlaceholder(key, locale)} min={whole ? 1 : 0.01} max={whole ? 100000 : undefined} step={whole ? 1 : 'any'} value={record.routeSpecs?.[key] ?? ''} onChange={event => {
      const specs = { ...record.routeSpecs };
      if (event.target.value === '') delete specs[key];
      else specs[key] = Number(event.target.value);
      onChange({ routeSpecs: Object.keys(specs).length ? specs : undefined });
    }} /></label>;
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
    {record.type === 'Service' && <CmsServiceIconPicker value={record.icon} disabled={disabled} onChange={icon => onChange({ icon })} />}
    <section className={styles.pictures} aria-label={t('Pictures')}><div className={styles.cardTitle}><ImagePlus size={21} aria-hidden="true" /><h3>{t('Pictures')}</h3></div>
      {imageField(t('Main image'), 'image', record.image, record.type === 'Vessel')}
      <div className={styles.twoColumns}>{languages.map(language => <div key={language}>{textField('imageAlt', language)}</div>)}</div>
    </section>
    {record.type === 'Route' && <details className={styles.card}>
      <summary><span className={styles.cardTitle}><ClipboardList size={20} aria-hidden="true" />{t('Route details')}</span><span className={styles.hint}>{t('Optional')}</span></summary>
      <div className={styles.cardBody}>
        <p className={styles.hint}>{t('Enter confirmed route information only. Leave missing or conflicting values blank.')}</p>
        {routeNumberField('distanceNm', 'Distance (NM)')}
        <p className={styles.hint}>{t('Enter both ends of a range, or leave both blank. For a single value, use the same number in both fields.')}</p>
        <fieldset className={styles.detailsGroup}><legend>{t('Container capacity')}</legend><div className={styles.twoColumns}>{routeNumberField('capacityMinTeu', 'Capacity from (TEU)', true)}{routeNumberField('capacityMaxTeu', 'Capacity to (TEU)', true)}</div></fieldset>
        <fieldset className={styles.detailsGroup}><legend>{t('Sailing time')}</legend><div className={styles.twoColumns}>{routeNumberField('sailingMinHours', 'Sailing time from (hours)')}{routeNumberField('sailingMaxHours', 'Sailing time to (hours)')}</div></fieldset>
      </div>
    </details>}
    {record.type === 'Route' && <details className={styles.card}><summary><span className={styles.cardTitle}><MapPin size={20} aria-hidden="true" />{t('Route map and ports')}</span><span className={styles.hint}>{t('Optional')}</span></summary><div className={styles.cardBody}><CmsRouteFields record={record} disabled={disabled} routeText={routeText} onChange={onChange} onRouteText={onRouteText} /></div></details>}
    {record.type === 'Vessel' && <details className={styles.card}>
      <summary><span className={styles.cardTitle}><Ship size={20} aria-hidden="true" />{t('Vessel details')}</span><span className={styles.hint}>{t('Optional')}</span></summary>
      <div className={styles.cardBody}><p className={styles.hint}>{t('Enter approved vessel information only. Leave unknown values blank.')}</p>
        <fieldset className={styles.detailsGroup}><legend>{t('Vessel identity')}</legend>
          <div className={styles.twoColumns}>{languages.map(language => {
            const key = language === 'th' ? 'designTypeTh' : 'designType';
            return <label className={styles.field} key={key}>{locale === 'th' ? 'ประเภทเรือตามเอกสาร' : 'Vessel type on particulars sheet'} · {languageName(language)}
              <input lang={language} maxLength={160} value={record.vesselSpecs?.[key] ?? ''}
                placeholder={language === 'th' ? 'เช่น เรือบรรทุกน้ำมันและสารเคมี' : 'e.g. Oil/chemical tanker'}
                onChange={event => updateSpec(key, event.target.value)} />
            </label>;
          })}</div>
          <div className={styles.twoColumns}>
            <label className={styles.field}>{t('Official number')}<input maxLength={40} value={record.vesselSpecs?.officialNumber ?? ''} onChange={event => updateSpec('officialNumber', event.target.value)} /></label>
            <label className={styles.field}>{t('Call sign')}<input maxLength={20} value={record.vesselSpecs?.callSign ?? ''} onChange={event => updateSpec('callSign', event.target.value)} /></label>
            <label className={styles.field}>MMSI<input inputMode="numeric" pattern="[0-9]{9}" maxLength={9} value={record.vesselSpecs?.mmsi ?? ''} onChange={event => updateSpec('mmsi', event.target.value)} /></label>
          </div>
          <div className={styles.twoColumns}><label className={styles.field}>{t('IMO ship number')}<input inputMode="numeric" placeholder={cmsContentPlaceholder('imo', locale)} maxLength={7} pattern="[1-9][0-9]{6}" value={record.vesselSpecs?.imo || ''} onChange={event => updateSpec('imo', event.target.value)} /><span className={styles.hint}>{t('Seven digits without the IMO prefix. The check digit is validated when saving.')}</span></label><label className={styles.field}>{t('Year built')}<input type="number" placeholder={cmsContentPlaceholder('yearBuilt', locale)} min={1800} max={new Date().getUTCFullYear()} step={1} value={record.vesselSpecs?.yearBuilt ?? ''} onChange={event => updateSpec('yearBuilt', event.target.value === '' ? undefined : Number(event.target.value))} /></label></div>
          <div className={styles.twoColumns}>{languages.map(language => <label className={styles.field} key={language}>{bilingualLabel('Flag state', language)}<input lang={language} placeholder={cmsContentPlaceholder('flag', language)} maxLength={100} value={record.vesselSpecs?.[language === 'th' ? 'flagTh' : 'flag'] || ''} onChange={event => updateSpec(language === 'th' ? 'flagTh' : 'flag', event.target.value)} /></label>)}</div>
        </fieldset>
        {vesselDetailGroups.map(group => <fieldset className={styles.detailsGroup} key={group.label}><legend>{t(group.label)}</legend>
          {group.label === 'Tonnage' && <label className={styles.field}>{t('Tonnage convention')}
            <select value={record.vesselSpecs?.tonnageBasis ?? 'register'} onChange={event => updateSpec('tonnageBasis', event.target.value)}>
              <option value="register">{t('Register tonnage (GRT / NRT)')}</option>
              <option value="international">{t('International tonnage (GT / NT)')}</option>
            </select>
          </label>}
          <div className={styles.twoColumns}>
          {group.fields.map(field => {
            const label = record.vesselSpecs?.tonnageBasis === 'international' && (field.label === 'GRT' || field.label === 'NRT')
              ? field.label === 'GRT' ? 'GT' : 'NT'
              : t(field.label);
            return <label className={styles.field} key={field.key}>{label}<input type="number" placeholder={cmsContentPlaceholder(field.key, locale)} min={field.whole ? 0 : 0.01} max={field.max} step={field.whole ? 1 : 'any'} value={record.vesselSpecs?.[field.key] ?? ''} onChange={event => updateSpec(field.key, event.target.value === '' ? undefined : Number(event.target.value))} /></label>;
          })}
        </div></fieldset>)}
        {technicalSections.map(section => <details className={styles.moreText} key={section.key}>
          <summary>{section[locale]}</summary>
          <div>{languages.map(language => {
            const key = language === 'th' ? section.keyTh : section.key;
            const id = `${fieldId}-${key}`;
            return <div key={key} className={styles.field}>
              <label htmlFor={id}>{section[locale]} · {languageName(language)}</label>
              <textarea id={id} lang={language} rows={4} maxLength={technicalTextLimit}
                value={record.vesselSpecs?.[key] ?? ''}
                placeholder={language === 'th' ? 'ระบุรายละเอียดที่ยืนยันแล้ว บรรทัดละหนึ่งรายการ' : 'Enter one confirmed detail per line'}
                onChange={event => updateSpec(key, event.target.value)} />
            </div>;
          })}</div>
        </details>)}
      </div>
    </details>}
    {record.type === 'Vessel' && <details className={styles.card}>
      <summary><span className={styles.cardTitle}><ImagePlus size={20} aria-hidden="true" />{t('More photos')}</span><span className={styles.hint}>{gallery.length ? t('{count} photos', { count: gallery.length }) : t('Optional')}</span></summary>
      <div className={styles.cardBody}>{gallery.map((item, index) => <div className={styles.galleryItem} key={index}>
        {imageField(t('Gallery image {number}', { number: index + 1 }), index, item.url)}
        <div className={styles.twoColumns}>{languages.map(language => <label className={styles.field} key={language}>{bilingualLabel('Description', language)}<input lang={language} placeholder={cmsContentPlaceholder('galleryAlt', language)} maxLength={250} value={language === 'th' ? item.altTh : item.alt} onChange={event => onChange({ gallery: gallery.map((image, position) => position === index ? { ...image, [language === 'th' ? 'altTh' : 'alt']: event.target.value } : image) })} /></label>)}</div>
        <div className={styles.galleryActions}><div><button type="button" className={workspace.iconButton} disabled={preparing || index === 0} aria-label={t('Move gallery image {number} earlier', { number: index + 1 })} title={t('Move earlier')} onClick={() => moveImage(index, -1)}><ArrowUp size={19} /></button><button type="button" className={workspace.iconButton} disabled={preparing || index === gallery.length - 1} aria-label={t('Move gallery image {number} later', { number: index + 1 })} title={t('Move later')} onClick={() => moveImage(index, 1)}><ArrowDown size={19} /></button></div><button type="button" className={workspace.textButton} disabled={preparing} aria-label={t('Remove gallery image {number}', { number: index + 1 })} onClick={() => onGalleryChange(gallery.filter((_, position) => position !== index))}><Trash2 size={17} />{t('Remove image')}</button></div>
      </div>)}<button type="button" className="button secondary" disabled={preparing || gallery.length >= 12} onClick={() => onGalleryChange([...gallery, { url: '', alt: '', altTh: '' }])}><Plus size={18} />{t('Add gallery image')}</button><p className={styles.hint}>{t('Up to 12 gallery images for vessel profiles. Use the arrows to set their display order. Images upload one at a time when you save.')}</p></div>
    </details>}
  </fieldset>;
}
