'use client';

import type { ReactNode } from 'react';
import { ImagePlus, Languages } from 'lucide-react';
import type { ContentRecord } from '@/lib/cms-types';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsPageFields.module.css';

type TextField = 'title' | 'description' | 'eyebrow' | 'body' | 'caption' | 'imageAlt';
type ThaiTextField = 'titleTh' | 'descriptionTh' | 'eyebrowTh' | 'bodyTh' | 'captionTh' | 'imageAltTh';
type PageFields = { text: TextField[]; mainImage: boolean; mobileImage: boolean };

/** Existing page layouts own their slots. Only expose fields those layouts read. */
function editableFields(record: ContentRecord): PageFields {
  if (record.type === 'Page') {
    const hasImage = !['home', 'services', 'fleet', 'routes', 'projects', 'news', 'privacy'].includes(record.id);
    return {
      text: ['title', 'description', 'eyebrow', 'body', ...(record.id === 'home' ? ['caption' as const] : []), ...(hasImage ? ['imageAlt' as const] : [])],
      mainImage: hasImage,
      mobileImage: false,
    };
  }
  if (record.id === 'footer' && record.parentId === 'shared') return { text: ['title'], mainImage: false, mobileImage: false };
  const planningParents: Record<string, string> = { 'service-planning': 'services', 'vessel-planning': 'fleet', 'project-planning': 'projects' };
  const template = (record.id.startsWith('home-') && record.parentId === 'home')
    || (record.id.startsWith('about-') && record.parentId === 'about')
    || (record.id === 'shared-callout' && record.parentId === 'shared')
    || (planningParents[record.id] && planningParents[record.id] === record.parentId) ? record.id : '';
  const value = ['home-trust-safety', 'home-trust-practical', 'home-trust-partnerships', 'about-vision', 'about-mission', 'about-values'].includes(template);
  const noImage = value || ['home-expertise', 'home-fleet', 'home-connections', 'service-planning', 'vessel-planning', 'project-planning'].includes(template);
  const decorativeImage = ['home-trust', 'shared-callout'].includes(template);
  return {
    text: ['title', 'description', ...(!value && template !== 'project-planning' ? ['eyebrow' as const] : []), 'body', ...(!noImage && !decorativeImage ? ['imageAlt' as const] : [])],
    mainImage: !noImage,
    mobileImage: false,
  };
}

const labels: Record<TextField, string> = {
  title: 'Title', description: 'Summary', eyebrow: 'Intro label', body: 'Content', caption: 'Image caption', imageAlt: 'Image description',
};
const limits: Record<TextField, number> = { title: 200, description: 2000, eyebrow: 160, body: 30000, caption: 200, imageAlt: 250 };

export default function CmsPageFields({ record, disabled, onChange, imageField }: {
  record: ContentRecord;
  disabled: boolean;
  onChange: (patch: Partial<ContentRecord>) => void;
  imageField: (label: string, target: 'image' | 'mobileImage', url: string, optional?: boolean) => ReactNode;
}) {
  const { locale, t } = useCmsLocale();
  const fields = editableFields(record);
  const textFields = fields.text.filter(field => field !== 'imageAlt');
  const languageName = (language: 'th' | 'en') => t(language === 'th' ? 'Thai' : 'English');

  function input(field: TextField, language: 'th' | 'en') {
    const key = (language === 'th' ? `${field}Th` : field) as TextField | ThaiTextField;
    const label = t(`${labels[field]} · ${language === 'th' ? 'Thai' : 'English'}`);
    const required = field === 'title' || (field === 'description' && record.type === 'Page');
    const common = { lang: language, required, maxLength: limits[field], value: record[key] || '', onChange: (event: { target: { value: string } }) => onChange({ [key]: event.target.value }) };
    return <label key={field} className={styles.field}>{label}
      {field === 'body' || field === 'description' ? <textarea {...common} rows={field === 'body' ? 7 : 3} /> : <input {...common} />}
      {field === 'body' && <span className={styles.hint}>{t('Separate paragraphs with a blank line.')}</span>}
    </label>;
  }

  return <fieldset className={styles.fields} disabled={disabled}>
    {record.type === 'Page' && record.id === 'home' && <p className={styles.hint}>{t('Manage the homepage banner images and their descriptions in Homepage slides.')}</p>}
    {([locale, locale === 'th' ? 'en' : 'th'] as const).map(language => <details key={language} className={styles.language} open={locale === language}>
      <summary><span className={styles.languageTitle}><Languages size={20} aria-hidden="true" />{languageName(language)}</span><span className={styles.hint}>{t('Website text')}</span></summary>
      <div className={styles.textFields}>{textFields.map(field => input(field, language))}</div>
    </details>)}
    {(fields.mainImage || fields.mobileImage) && <section className={styles.pictures} aria-label={t('Pictures')}>
      <div className={styles.pictureHeading}><ImagePlus size={21} aria-hidden="true" /><h3>{t('Pictures')}</h3></div>
      <p className={styles.hint}>{t('Choose a replacement picture. It will appear after you save.')}</p>
      {fields.mainImage && imageField(t('Main image'), 'image', record.image)}
      {fields.text.includes('imageAlt') && <div className={styles.imageDescriptions}>{(['th', 'en'] as const).map(language => <div key={language}>{input('imageAlt', language)}</div>)}</div>}
      {fields.mobileImage && <>{imageField(t('Mobile image'), 'mobileImage', record.mobileImage || '', true)}<p className={styles.hint}>{t('Used for the Home hero on narrow screens. If empty, the main image is used.')}</p></>}
    </section>}
  </fieldset>;
}
