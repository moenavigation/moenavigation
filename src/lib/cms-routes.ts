import type { ContentRecord } from './cms-types';

export type CmsSection = 'content' | 'inbox' | 'media' | 'trash' | 'setting' | 'users' | 'logs' | 'usage' | 'slides';
export type CmsView = { section: CmsSection; type: ContentRecord['type'] | 'All' };

const contentPaths: Partial<Record<ContentRecord['type'], string>> = {
  Page: '/cms/pages',
  Vessel: '/cms/fleet',
  Route: '/cms/routes',
  Project: '/cms/projects',
  Service: '/cms/services',
  News: '/cms/news',
};

const sectionPaths: Record<Exclude<CmsSection, 'content'>, string> = {
  inbox: '/cms/enquiries',
  media: '/cms/media',
  trash: '/cms/trash',
  setting: '/cms/setting',
  users: '/cms/users',
  logs: '/cms/logs',
  usage: '/cms/usage',
  slides: '/cms/slides',
};

export function cmsPathForView(section: CmsSection, type: string = 'All') {
  if (section !== 'content') return sectionPaths[section];
  if (type === 'Section') return '/cms/pages';
  return contentPaths[type as ContentRecord['type']] || '/cms';
}

export function cmsViewFromPathname(pathname: string, searchParams?: Pick<URLSearchParams, 'get'>): CmsView {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/cms' && searchParams?.get('type') === 'Section') return { section: 'content', type: 'Page' };
  for (const [type, path] of Object.entries(contentPaths)) {
    if (normalized === path) return { section: 'content', type: type as ContentRecord['type'] };
  }
  for (const [section, path] of Object.entries(sectionPaths)) {
    if (normalized === path) return { section: section as CmsSection, type: 'All' };
  }
  return { section: 'content', type: 'All' };
}
