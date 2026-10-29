import type { ContentRecord } from './cms-types';
import { href } from './content';

const pageNames: Record<string, string> = { home: 'Home', about: 'About', services: 'Services', fleet: 'Fleet', routes: 'Routes', projects: 'Projects', news: 'News', contact: 'Contact', privacy: 'Privacy' };
export function cmsPageLabel(page: Pick<ContentRecord, 'id' | 'title'>) {
  return pageNames[page.id] || page.title;
}

export function contentBelongsToPage(record: ContentRecord, pageId: string) {
  if (!pageId || pageId === 'All') return true;
  if (record.type === 'Page') return record.id === pageId;
  return record.type === 'Section' && record.parentId === pageId;
}

export function publishedContentUrl(record: ContentRecord, records: ContentRecord[], locale: 'th' | 'en') {
  if (record.status !== 'Published' || record.deletedAt) return null;
  let path: string;
  if (record.type === 'Section') {
    const parentId = record.parentId === 'shared' ? 'home' : record.parentId;
    if (!parentId || !records.some(page => page.type === 'Page' && page.id === parentId && page.status === 'Published' && !page.deletedAt)) return null;
    path = parentId === 'home' ? '' : parentId;
  } else if (record.type === 'Page') path = record.id === 'home' ? '' : record.id;
  else if (record.type === 'Route') path = 'routes';
  else path = `${record.type === 'Vessel' ? 'fleet' : record.type === 'News' ? 'news' : `${record.type.toLowerCase()}s`}/${record.id}`;
  return href(locale, path);
}
