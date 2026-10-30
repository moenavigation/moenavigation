import type { ContentRecord } from './cms-types';

export type CmsSection = 'content' | 'inbox' | 'media' | 'trash' | 'account' | 'users';
export type CmsView = { section: CmsSection; type: ContentRecord['type'] | 'All' };

const contentPaths: Record<ContentRecord['type'], string> = {
  Page: '/cms/pages',
  Section: '/cms/sections',
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
  account: '/cms/account',
  users: '/cms/users',
};

export function cmsPathForView(section: CmsSection, type: string = 'All') {
  if (section !== 'content') return sectionPaths[section];
  return contentPaths[type as ContentRecord['type']] || '/cms';
}

export function cmsViewFromPathname(pathname: string): CmsView {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  for (const [type, path] of Object.entries(contentPaths)) {
    if (normalized === path) return { section: 'content', type: type as ContentRecord['type'] };
  }
  for (const [section, path] of Object.entries(sectionPaths)) {
    if (normalized === path) return { section: section as CmsSection, type: 'All' };
  }
  return { section: 'content', type: 'All' };
}
