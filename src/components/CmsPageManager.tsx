/* eslint-disable @next/next/no-img-element */
'use client';

import { ArrowLeft, ArrowRight, ExternalLink, FileText, Pencil, Settings } from 'lucide-react';
import { corePageIds, type ContentRecord } from '@/lib/cms-types';
import { cmsPageLabel, publishedContentUrl } from '@/lib/cms-navigation';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsPageManager.module.css';

const homeOrder = ['home-expertise', 'home-trust', 'home-trust-safety', 'home-trust-practical', 'home-trust-partnerships', 'home-fleet', 'home-connections'];
const aboutOrder = ['about-intro', 'about-vision', 'about-mission', 'about-values'];
const unusedParents: Record<string, string> = { 'home-news': 'home', 'home-cta': 'home', 'footer-contact': 'shared' };
const detailParents: Record<string, string> = { 'service-planning': 'services', 'vessel-planning': 'fleet', 'project-planning': 'projects' };
const collectionTypes: Record<string, string> = { fleet: 'Vessel', routes: 'Route', services: 'Service', projects: 'Project', news: 'News' };

export default function CmsPageManager({ records, selectedPage, onSelect, onEdit, onCollection, onSettings, disabled }: {
  records: ContentRecord[]; selectedPage: string; onSelect: (id: string) => void;
  onEdit: (record: ContentRecord) => void; onCollection: (type: string) => void; onSettings: () => void; disabled: boolean;
}) {
  const { t, locale } = useCmsLocale();
  const active = records.filter(record => !record.deletedAt);
  const pages = active.filter(record => record.type === 'Page').sort((a, b) => {
    const rank = (id: string) => { const index = (corePageIds as readonly string[]).indexOf(id); return index < 0 ? corePageIds.length : index; };
    return rank(a.id) - rank(b.id);
  });
  const title = (record: ContentRecord) => locale === 'th' ? record.titleTh || record.title : record.title || record.titleTh;
  const pageName = (record: ContentRecord) => (corePageIds as readonly string[]).includes(record.id) ? t(cmsPageLabel(record)) : title(record);
  const page = pages.find(record => record.id === selectedPage);
  const shared = selectedPage === 'shared';
  const sectionRecords = active.filter(record => record.type === 'Section' && record.parentId === selectedPage);
  const order = selectedPage === 'home' ? homeOrder : selectedPage === 'about' ? aboutOrder : [];
  sectionRecords.sort((a, b) => {
    const rank = (record: ContentRecord) => order.includes(record.id) ? order.indexOf(record.id) : order.length + (record.order ?? 0);
    return rank(a) - rank(b);
  });
  const isUnused = (record: ContentRecord) => Boolean(unusedParents[record.id] && unusedParents[record.id] === record.parentId);
  const visible = sectionRecords.filter(record => !isUnused(record));
  const hidden = sectionRecords.filter(isUnused);
  const preview = page ? publishedContentUrl(page, records, locale) : null;
  function item(record: ContentRecord, introduction = false) {
    const footer = record.id === 'footer' && record.parentId === 'shared';
    const label = introduction ? t('Page introduction') : footer ? t('Footer text') : title(record);
    const hint = introduction ? t('The heading and introduction visitors see on this page.') : detailParents[record.id] && detailParents[record.id] === record.parentId ? t('Shown on individual item pages.') : record.id === 'shared-callout' && record.parentId === 'shared' ? t('Contact message shown on About and custom pages.') : footer ? t('The short text at the bottom of the website.') : '';
    return <article key={`${record.type}:${record.id}`} className={styles.item}>
      {record.image ? <img className={styles.thumbnail} src={record.image} alt="" width={160} height={110} /> : <span className={styles.placeholder}><FileText size={24} aria-hidden="true" /></span>}
      <div className={styles.itemCopy}><h3>{label}</h3>{introduction && <p className={styles.excerpt}>{title(record)}</p>}{hint && <p>{hint}</p>}{!introduction && (record.description || record.descriptionTh) && <p className={styles.excerpt}>{locale === 'th' ? record.descriptionTh || record.description : record.description || record.descriptionTh}</p>}</div>
      <button type="button" className="button secondary" disabled={disabled} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onEdit(record); }} aria-label={t('Edit {name}', { name: label })}><Pencil size={17} aria-hidden="true" />{t('Edit')}</button>
    </article>;
  }
  if (!page && !shared) return <section className={styles.manager} aria-labelledby="pages-title"><div className={styles.intro}><h2 id="pages-title">{t('Which page would you like to update?')}</h2><p>{t('Choose a page, then edit its existing text and pictures.')}</p></div><div className={styles.pageGrid}>{pages.map(record => <button key={record.id} className={styles.pageCard} type="button" disabled={disabled} onClick={() => onSelect(record.id)}>{record.image ? <img src={record.image} alt="" width={480} height={230} /> : <span className={styles.cover}><FileText size={34} aria-hidden="true" /></span>}<span className={styles.cardBody}><strong>{pageName(record)}</strong></span></button>)}<button className={`${styles.pageCard} ${styles.sharedCard}`} type="button" disabled={disabled} onClick={() => onSelect('shared')}><span className={styles.cover}><Settings size={34} aria-hidden="true" /></span><span className={styles.cardBody}><strong>{t('Shared website content')}</strong><span>{t('Footer and shared messages')}<ArrowRight size={18} aria-hidden="true" /></span></span></button></div>{!pages.length && <p>{t('No saved pages are available. Refresh to try again.')}</p>}</section>;
  return <section className={styles.manager} aria-labelledby="selected-page-title"><button className={styles.back} type="button" onClick={() => onSelect('')}><ArrowLeft size={18} aria-hidden="true" />{t('All pages')}</button><div className={styles.selectedHeading}><div><h2 id="selected-page-title">{shared ? t('Shared website content') : pageName(page!)}</h2><p>{t('Choose an item below to change its text or pictures. Save when you are ready.')}</p></div>{preview && <a href={preview} target="_blank" rel="noopener noreferrer" className="button secondary">{t('View page')}<ExternalLink size={17} aria-hidden="true" /></a>}</div><div className={styles.items}>{page && item(page, true)}{visible.map(record => item(record))}</div>{hidden.length > 0 && <details className={styles.hidden}><summary>{t('Saved content not currently displayed')}</summary><p>{t('These items are kept for reference. Editing them will not make them appear on the website.')}</p>{hidden.map(record => item(record))}</details>}{collectionTypes[selectedPage] && <aside className={styles.related}><div><h3>{t('Looking for the items shown on this page?')}</h3><p>{t('Manage the individual entries separately from the page introduction.')}</p></div><button type="button" className="button secondary" onClick={() => onCollection(collectionTypes[selectedPage])}>{t('Manage {name}', { name: pageName(page!) })}<ArrowRight size={18} aria-hidden="true" /></button></aside>}{(selectedPage === 'contact' || shared) && <aside className={styles.related}><div><h3>{t('Company contact details')}</h3><p>{t('Update the company name, address, phone and email in Settings.')}</p></div><button type="button" className="button secondary" onClick={onSettings}>{t('Settings')}<ArrowRight size={18} aria-hidden="true" /></button></aside>}</section>;
}
